"""Agent runner REST surface — Phase 2 of the agent feature.

Owns persistence + HTTP routes + SSE event emission for agent runs. The actual
runner loop lives in ``backend.agents.runner`` (Phase 1) and the scope model
lives in ``backend.query.scope`` (Phase 3); both are imported lazily inside the
background task so this module stays importable even before the sibling phases
are merged.

Endpoints:

- ``POST   /api/agents/runs``                          -> ``{run_id}``
- ``GET    /api/agents/runs?repo_hash=...&status=...`` -> list (no transcript)
- ``GET    /api/agents/runs/{run_id}?repo_hash=...``   -> full document
- ``DELETE /api/agents/runs/{run_id}?repo_hash=...``   -> trip cancel event
- ``GET    /api/agents/templates``                     -> hardcoded catalogue
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from backend.db import store as db_store
from backend.lib.auth_guard import require_session
from backend.lib import events as event_bus

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_session)])


# ---------------------------------------------------------------------------
# Hardcoded template catalogue (Phase 1 will eventually own a real registry).
# ---------------------------------------------------------------------------


_TEMPLATES: list[dict[str, str]] = [
    {
        "id": "region-auditor",
        "name": "Region Auditor",
        "description": (
            "Audits a chosen region of the codebase against the index's "
            "invariants and conventions and reports drift."
        ),
    },
    {
        "id": "flow-tracer",
        "name": "Flow Tracer",
        "description": (
            "Traces data and control flow across the indexed graph from a "
            "seed symbol, summarising every hop with citations."
        ),
    },
    {
        "id": "convention-scout",
        "name": "Convention Scout",
        "description": (
            "Mines exemplars and naming/shape conventions inside a cluster "
            "so a new contribution can match house style."
        ),
    },
    {
        "id": "refactor-planner",
        "name": "Refactor Planner",
        "description": (
            "Drafts a step-by-step refactor plan for the scoped region with "
            "ordered edits and impact analysis."
        ),
    },
]
_TEMPLATE_IDS = {t["id"] for t in _TEMPLATES}


# ---------------------------------------------------------------------------
# Cancellation registry: DELETE flips one of these events; the runner watches it.
# ---------------------------------------------------------------------------


_CANCEL_EVENTS: dict[str, asyncio.Event] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class CreateRunRequest(BaseModel):
    repo_hash: str
    template_id: str
    scope: Optional[dict] = None
    prompt: str


class CreateRunResponse(BaseModel):
    run_id: str


# ---------------------------------------------------------------------------
# Background dispatch
# ---------------------------------------------------------------------------


async def _dispatch_run(
    repo_hash: str,
    run_id: str,
    template_id: str,
    scope_dict: Optional[dict],
    prompt: str,
) -> None:
    """Resolve the scope, run the agent, and persist + emit each step.

    Imports of Phase 1/Phase 3 modules are lazy so this module stays importable
    in isolation (the smoke-import is part of the contract).
    """
    cancel_event = _CANCEL_EVENTS.setdefault(run_id, asyncio.Event())
    try:
        # Lazy imports — siblings own these files.
        from backend.agents.runner import run_agent  # type: ignore
        from backend.query.scope import Scope, resolve_scope  # type: ignore

        scope_parsed = None
        scope_resolved = None
        scope_summary: Optional[dict] = None
        if scope_dict is not None:
            try:
                scope_parsed = Scope.model_validate(scope_dict)
            except Exception as exc:
                logger.warning(
                    "agent_run %s: scope parse failed: %s", run_id, exc
                )
                raise
            try:
                scope_resolved = resolve_scope(repo_hash, scope_parsed)
            except Exception as exc:
                logger.warning(
                    "agent_run %s: scope resolve failed: %s", run_id, exc
                )
                raise
            # Lightweight summary for the run-started SSE; never the full
            # resolved set (could be huge).
            try:
                scope_summary = {
                    "kind": getattr(scope_parsed, "kind", None)
                    or scope_dict.get("kind"),
                }
            except Exception:
                scope_summary = None

        db_store.update_agent_run_status(
            repo_hash, run_id, "running", started_at=_now_iso()
        )

        event_bus.publish(
            repo_hash,
            "agent_run_started",
            {
                "run_id": run_id,
                "template_id": template_id,
                "scope": scope_dict,
                "prompt": prompt,
                "scope_summary": scope_summary,
            },
        )

        step_counter = {"n": 0}

        def emit(role: str, payload: dict) -> None:
            step_counter["n"] += 1
            step_idx = step_counter["n"]
            step = {
                "step": step_idx,
                "role": role,
                "payload": payload,
                "ts": _now_iso(),
            }
            try:
                db_store.append_agent_run_step(repo_hash, run_id, step)
            except Exception as exc:  # pragma: no cover — log but don't kill the run
                logger.warning(
                    "agent_run %s: persist step %d failed: %s",
                    run_id,
                    step_idx,
                    exc,
                )
            event_bus.publish(
                repo_hash,
                "agent_step",
                {
                    "run_id": run_id,
                    "step": step_idx,
                    "role": role,
                    "payload": payload,
                },
            )

        result = await run_agent(
            repo_hash,
            run_id,
            template_id,
            scope_resolved,
            prompt,
            cancel_event,
            emit,
        )

        if cancel_event.is_set():
            db_store.update_agent_run_status(
                repo_hash,
                run_id,
                "cancelled",
                finished_at=_now_iso(),
                result=result if isinstance(result, dict) else None,
            )
            event_bus.publish(
                repo_hash,
                "agent_run_finished",
                {"run_id": run_id, "status": "cancelled"},
            )
            return

        db_store.update_agent_run_status(
            repo_hash,
            run_id,
            "succeeded",
            finished_at=_now_iso(),
            result=result if isinstance(result, dict) else None,
        )
        event_bus.publish(
            repo_hash,
            "agent_run_finished",
            {
                "run_id": run_id,
                "status": "succeeded",
                "result": result if isinstance(result, dict) else None,
            },
        )
    except asyncio.CancelledError:
        db_store.update_agent_run_status(
            repo_hash, run_id, "cancelled", finished_at=_now_iso()
        )
        event_bus.publish(
            repo_hash,
            "agent_run_finished",
            {"run_id": run_id, "status": "cancelled"},
        )
        raise
    except Exception as exc:
        logger.exception("agent_run %s failed", run_id)
        try:
            db_store.update_agent_run_status(
                repo_hash,
                run_id,
                "failed",
                finished_at=_now_iso(),
                error=str(exc),
            )
        except Exception:  # pragma: no cover
            pass
        event_bus.publish(
            repo_hash,
            "agent_run_finished",
            {"run_id": run_id, "status": "failed", "error": str(exc)},
        )
    finally:
        # Drop the cancel event so the dict doesn't leak across long uptimes.
        _CANCEL_EVENTS.pop(run_id, None)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/templates")
def list_templates() -> dict:
    """Return the hardcoded template catalogue."""
    return {"templates": _TEMPLATES}


@router.post("/runs", response_model=CreateRunResponse)
def create_run(
    req: CreateRunRequest,
    background_tasks: BackgroundTasks,
    claims: dict = Depends(require_session),
) -> CreateRunResponse:
    """Persist a queued run and dispatch it on a background task."""
    if req.template_id not in _TEMPLATE_IDS:
        raise HTTPException(
            status_code=404, detail="unknown template_id: %s" % req.template_id
        )
    if db_store.get_repo(req.repo_hash) is None:
        raise HTTPException(
            status_code=404, detail="unknown repo_hash: %s" % req.repo_hash
        )

    # Defer scope validation to the background task so we get a single failure
    # path (status='failed', error=<msg>) for any malformed scope rather than
    # a 422 here AND a separate failure mode after dispatch.
    created_by = None
    if isinstance(claims, dict):
        created_by = claims.get("email") or claims.get("sub")

    run_id = db_store.create_agent_run(
        repo_hash=req.repo_hash,
        template_id=req.template_id,
        scope=req.scope,
        prompt=req.prompt,
        created_by=created_by,
    )
    _CANCEL_EVENTS[run_id] = asyncio.Event()

    background_tasks.add_task(
        _dispatch_run,
        req.repo_hash,
        run_id,
        req.template_id,
        req.scope,
        req.prompt,
    )
    logger.info(
        "agent_run queued run_id=%s template=%s repo=%s",
        run_id,
        req.template_id,
        req.repo_hash,
    )
    return CreateRunResponse(run_id=run_id)


@router.get("/runs")
def list_runs(
    repo_hash: str,
    status: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """Most-recent runs for a repo. Transcript is omitted."""
    if db_store.get_repo(repo_hash) is None:
        raise HTTPException(
            status_code=404, detail="unknown repo_hash: %s" % repo_hash
        )
    runs = db_store.list_agent_runs(repo_hash, limit=limit, status=status)
    return {"runs": runs}


@router.get("/runs/{run_id}")
def get_run(run_id: str, repo_hash: str) -> dict:
    """Full run document including transcript."""
    doc = db_store.get_agent_run(repo_hash, run_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="unknown run_id: %s" % run_id)
    return doc


@router.delete("/runs/{run_id}")
def cancel_run(run_id: str, repo_hash: str) -> dict:
    """Trip the cancel event for an in-flight run.

    The runner is responsible for honouring the event; we only flip the flag
    here and return immediately. If the run already finished we still 200 so
    the frontend's cancel button is idempotent.
    """
    doc = db_store.get_agent_run(repo_hash, run_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="unknown run_id: %s" % run_id)
    ev = _CANCEL_EVENTS.get(run_id)
    if ev is not None:
        ev.set()
    return {"run_id": run_id, "cancel_requested": True}
