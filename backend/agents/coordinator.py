"""Coordinator uAgent — public ASI:One entry point that aggregates specialists.

For the MVP, Architecture / Flow / Invariant logic is inlined as method calls
on :class:`backend.query.engine.QueryEngine` rather than dispatched out to
separate specialist agents (see SPEC §7.2.5 hackathon scope reduction).
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from backend.db import store as db_store
from backend.lib import events as event_bus
from backend.models import FindContextRequest
from backend.query.engine import QueryEngine

from . import architecture_analyst, flow_analyst, invariant_reporter
from .protocols import UserQuery, UserResponse

logger = logging.getLogger(__name__)


_USER_QUERY_DECLARED = {"repo_hash", "question"}


def _query_extras(query) -> dict:
    """Return the dict of fields the caller passed beyond UserQuery's declared
    fields. Handles Pydantic v2 (``model_extra``) and v1 (extras land in
    ``__dict__`` because UserQuery sets ``Config.extra = 'allow'``).
    Pydantic v1 is what ``uagents.Model`` ships with."""
    extra = getattr(query, "model_extra", None)
    if isinstance(extra, dict) and extra:
        return extra
    # Pydantic v1: pull everything off the model and subtract declared fields.
    if hasattr(query, "dict"):
        try:
            data = query.dict()
        except Exception:
            data = {}
        return {k: v for k, v in data.items() if k not in _USER_QUERY_DECLARED}
    return {}


def _count_by_source(invariants: list[dict]) -> dict[str, int]:
    """Group an invariant list by source_kind so the Activity Log can render
    per-kind counts (test/defensive/comment) without re-scanning the bundle."""
    counts: dict[str, int] = {}
    for inv in invariants or []:
        kind = inv.get("source_kind") or "unknown"
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def _symbol_ids_for_files(repo_hash: str, file_paths: list[str]) -> list[str]:
    """Resolve a list of file paths to the stringified symbol ObjectIds the
    frontend graph store keys nodes by. ``region_highlighted`` events carry
    ``node_ids`` (symbol IDs), not file paths — without this resolution
    architecture/exemplar highlights silently no-op on the frontend.
    """
    if not file_paths:
        return []
    wanted = set(file_paths)
    out: list[str] = []
    for sym in db_store.iter_symbols(repo_hash):
        if sym.get("file_path") in wanted:
            out.append(str(sym["_id"]))
    return out


def _classify(question: str) -> str:
    q = (question or "").lower()
    # Order is by keyword specificity, most specific first:
    # 1. exemplar/template — unambiguous L3 exemplar intent.
    # 2. invariant/constraint — unambiguous L4. Runs before architecture so
    #    "invariants for the user cluster" routes to L4 instead of being
    #    captured by the cluster keyword.
    # 3. architecture/convention/cluster/region — L3. Beats flow so prompts
    #    like "describe the data flow architecture" go to L3, not L2.
    # 4. flow/taint/trace — L2 fallback for any remaining flow phrasing.
    # 5. default — find_relevant_context.
    # Callers can bypass this entirely by passing model_extra["query_type"].
    if "exemplar" in q or "template" in q:
        return "find_exemplars"
    if "invariant" in q or "constraint" in q:
        return "find_invariants"
    if (
        "architecture" in q
        or "convention" in q
        or "cluster" in q
        or "region" in q
        or "how is the codebase organized" in q
    ):
        return "describe_architecture"
    if "flow" in q or "taint" in q or "trace" in q:
        return "trace_data_flow"
    return "find_relevant_context"


def _extract_flow_payload(query: UserQuery) -> dict:
    """Pull a FlowQuery-shaped dict off a UserQuery.

    UserQuery in :mod:`backend.agents.protocols` only carries ``repo_hash`` and
    ``question``, but callers may attach a ``query_type`` / structured payload
    via Pydantic's ``model_extra`` (when the model permits) or via attribute
    access. We look in both places defensively.
    """
    extra = _query_extras(query)
    explicit = extra.get("flow") if isinstance(extra, dict) else None
    if isinstance(explicit, dict):
        payload = dict(explicit)
    else:
        payload = {}
    payload.setdefault("symbol", extra.get("symbol", "") if isinstance(extra, dict) else "")
    payload.setdefault(
        "direction",
        extra.get("direction", "forward") if isinstance(extra, dict) else "forward",
    )
    payload.setdefault(
        "depth", extra.get("depth", 3) if isinstance(extra, dict) else 3
    )
    # Fallback: try to lift a bare symbol qualified name out of the question
    # so demo prompts like "trace data flow from auth.login" still work.
    if not payload.get("symbol"):
        for token in (query.question or "").split():
            if "." in token and token.replace(".", "").replace("_", "").isalnum():
                payload["symbol"] = token
                break
    return payload


def _extract_arch_payload(query: UserQuery) -> dict:
    """Pull an ArchQuery-shaped dict off a UserQuery (path / cluster_id)."""
    extra = _query_extras(query)
    payload: dict = {}
    if isinstance(extra, dict):
        explicit = extra.get("arch")
        if isinstance(explicit, dict):
            payload = dict(explicit)
        if "path" not in payload and extra.get("path"):
            payload["path"] = extra.get("path")
        if "cluster_id" not in payload and extra.get("cluster_id") is not None:
            payload["cluster_id"] = extra.get("cluster_id")
    return payload


def _extract_invariant_payload(query: UserQuery) -> dict:
    """Pull an InvariantQuery-shaped dict off a UserQuery.

    Looks for ``invariant`` (nested dict), ``symbol``, ``cluster_id``, and
    ``min_confidence`` in ``model_extra``. Falls back to lifting a bare
    qualified name out of the question text so prompts like
    ``"what invariants apply to auth.login?"`` still work.
    """
    extra = _query_extras(query)
    payload: dict = {}
    if isinstance(extra, dict):
        explicit = extra.get("invariant")
        if isinstance(explicit, dict):
            payload = dict(explicit)
        if "symbol" not in payload and extra.get("symbol"):
            payload["symbol"] = extra.get("symbol")
        if "cluster_id" not in payload and extra.get("cluster_id") is not None:
            payload["cluster_id"] = extra.get("cluster_id")
        if "min_confidence" not in payload and extra.get("min_confidence") is not None:
            payload["min_confidence"] = extra.get("min_confidence")
    if not payload.get("symbol") and not payload.get("cluster_id"):
        for token in (query.question or "").split():
            if "." in token and token.replace(".", "").replace("_", "").isalnum():
                payload["symbol"] = token
                break
    return payload


def _extract_exemplar_payload(query: UserQuery) -> dict:
    """Pull an ExemplarQuery-shaped dict off a UserQuery (task / cluster_id)."""
    extra = _query_extras(query)
    payload: dict = {"task": query.question or ""}
    if isinstance(extra, dict):
        explicit = extra.get("exemplar")
        if isinstance(explicit, dict):
            payload.update(explicit)
        if "cluster_id" not in payload and extra.get("cluster_id") is not None:
            payload["cluster_id"] = extra.get("cluster_id")
        if extra.get("task"):
            payload["task"] = extra.get("task")
    return payload


def handle_user_query(query: UserQuery) -> UserResponse:
    query_id = uuid.uuid4().hex
    # Allow callers to skip the keyword classifier by passing an explicit
    # ``query_type`` field (e.g. via the FastAPI gateway). Falls back to
    # keyword-based classification per SPEC §7.2.3.
    extra = _query_extras(query)
    explicit_type = extra.get("query_type") if isinstance(extra, dict) else None
    query_type = explicit_type or _classify(query.question)
    engine = QueryEngine(query.repo_hash)

    if query_type == "trace_data_flow":
        # SPEC §7.2.5: Flow Analyst runs in-process here, dispatched out to a
        # uAgent only when the bureau is up. The handler below is the same
        # entry point used by ``flow_analyst.build_agent``'s on_message hook.
        payload = _extract_flow_payload(query)
        result = flow_analyst.handle_flow_query(query.repo_hash, payload)
        flows = list(result.get("flows", []))
        symbol_ids: list[str] = []
        for flow in flows:
            src = flow.get("source_symbol")
            sink = flow.get("sink_symbol")
            if src:
                symbol_ids.append(src)
            if sink:
                symbol_ids.append(sink)
            for inter in flow.get("path", []) or []:
                if inter:
                    symbol_ids.append(inter)
        # De-dupe while preserving order so the Activity Log highlight matches
        # the wire payload the consumer just saw.
        seen: set[str] = set()
        unique_ids: list[str] = []
        for sid in symbol_ids:
            if sid in seen:
                continue
            seen.add(sid)
            unique_ids.append(sid)
        event_bus.publish(
            query.repo_hash,
            "agent_activity",
            {
                "query_id": query_id,
                "query_type": "trace_data_flow",
                "cluster_id": None,
                "symbol_ids": unique_ids,
                "seed_symbol": payload.get("symbol"),
                "direction": payload.get("direction"),
                "flow_count": len(flows),
            },
        )
        if unique_ids:
            event_bus.publish(
                query.repo_hash,
                "region_highlighted",
                {
                    "node_ids": unique_ids,
                    "color": "#ff6b6b",
                    "ttl_ms": 4000,
                },
            )
        return UserResponse(
            bundle={"query_type": "trace_data_flow", "result": result}
        )

    if query_type == "find_relevant_context":
        bundle = engine.find_relevant_context(
            FindContextRequest(task=query.question, repo_hash=query.repo_hash)
        )
        symbol_ids = [s.qualified_name for s in bundle.relevant_symbols]
        event_bus.publish(
            query.repo_hash,
            "agent_activity",
            {
                "query_id": query_id,
                "query_type": query_type,
                "cluster_id": bundle.region.cluster_id,
                "symbol_ids": symbol_ids,
            },
        )
        if symbol_ids:
            event_bus.publish(
                query.repo_hash,
                "region_highlighted",
                {
                    "node_ids": symbol_ids,
                    "color": "#ffb347",
                    "ttl_ms": 4000,
                },
            )
        return UserResponse(bundle=bundle.model_dump())

    if query_type == "describe_architecture":
        # SPEC §7.2.5: Architecture Analyst runs in-process here. The handler
        # is the same entry point used by ``architecture_analyst.build_agent``.
        payload = _extract_arch_payload(query)
        result = architecture_analyst.handle_arch_query(query.repo_hash, payload)
        member_files = list(result.get("member_files", []))
        cluster_blob = result.get("cluster") or {}
        cluster_id = cluster_blob.get("cluster_id") if isinstance(cluster_blob, dict) else None
        event_bus.publish(
            query.repo_hash,
            "agent_activity",
            {
                "query_id": query_id,
                "query_type": "describe_architecture",
                "cluster_id": cluster_id,
                "member_files": member_files,
            },
        )
        if member_files:
            highlight_ids = _symbol_ids_for_files(query.repo_hash, member_files)
            if highlight_ids:
                event_bus.publish(
                    query.repo_hash,
                    "region_highlighted",
                    {
                        "node_ids": highlight_ids,
                        "color": "#7ed6df",
                        "ttl_ms": 4000,
                    },
                )
        return UserResponse(
            bundle={"query_type": "describe_architecture", "result": result}
        )

    if query_type == "find_exemplars":
        payload = _extract_exemplar_payload(query)
        result = architecture_analyst.handle_exemplar_query(query.repo_hash, payload)
        files = [f.get("file_path") for f in result.get("files", []) if f.get("file_path")]
        event_bus.publish(
            query.repo_hash,
            "agent_activity",
            {
                "query_id": query_id,
                "query_type": "find_exemplars",
                "cluster_id": payload.get("cluster_id"),
                "exemplar_files": files,
            },
        )
        if files:
            highlight_ids = _symbol_ids_for_files(query.repo_hash, files)
            if highlight_ids:
                event_bus.publish(
                    query.repo_hash,
                    "region_highlighted",
                    {
                        "node_ids": highlight_ids,
                        "color": "#a29bfe",
                        "ttl_ms": 4000,
                    },
                )
        return UserResponse(
            bundle={"query_type": "find_exemplars", "result": result}
        )

    if query_type == "find_invariants":
        # SPEC §7.2.5: Invariant Reporter runs in-process here. The handler
        # is the same entry point used by ``invariant_reporter.build_agent``.
        payload = _extract_invariant_payload(query)
        result = invariant_reporter.handle_invariant_query(query.repo_hash, payload)
        invariants = result.get("invariants", [])
        # Highlight the constrained symbols in the visualization.
        target_qnames = list(
            {inv.get("target_symbol") for inv in invariants if inv.get("target_symbol")}
        )
        highlight_ids: list[str] = []
        if target_qnames:
            wanted = set(target_qnames)
            for sym in db_store.iter_symbols(query.repo_hash):
                if sym.get("qualified_name") in wanted:
                    highlight_ids.append(str(sym["_id"]))
        event_bus.publish(
            query.repo_hash,
            "agent_activity",
            {
                "query_id": query_id,
                "query_type": "find_invariants",
                "invariant_count": len(invariants),
                "target_symbol": payload.get("symbol"),
                "cluster_id": payload.get("cluster_id"),
                "target_qnames": target_qnames,
                "by_source": _count_by_source(invariants),
            },
        )
        if highlight_ids:
            event_bus.publish(
                query.repo_hash,
                "region_highlighted",
                {
                    "node_ids": highlight_ids,
                    "color": "#fab1a0",
                    "ttl_ms": 4000,
                },
            )
        return UserResponse(
            bundle={"query_type": "find_invariants", "result": result}
        )

    # All other types currently degrade to empty responses for the MVP.
    return UserResponse(bundle={"query_type": query_type, "result": None})


def build_agent(seed: Optional[str] = None, port: int = 8001):
    from uagents import Agent, Context  # type: ignore

    agent = Agent(
        name="cartographer_coordinator",
        seed=seed or os.getenv("COORDINATOR_SEED", "cartographer-coordinator-seed"),
        port=port,
        mailbox=True,
    )

    @agent.on_message(model=UserQuery, replies=UserResponse)
    async def _on_query(ctx: Context, sender: str, msg: UserQuery) -> None:
        try:
            reply = handle_user_query(msg)
        except Exception as exc:  # pragma: no cover
            logger.exception("Coordinator error: %s", exc)
            reply = UserResponse(bundle={"error": str(exc)})
        await ctx.send(sender, reply)

    return agent
