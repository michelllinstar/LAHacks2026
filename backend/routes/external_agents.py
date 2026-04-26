"""External agent runner — user-registered HTTP endpoints we POST work to.

Distinct from ``backend.routes.agents`` (which runs built-in templates inside
this process). External agents live behind the user's own URL; we forward a
``ContextBundle`` plus the prompt, expect a ``{summary, citations, warnings}``
JSON document back, and emit a single SSE ``agent_activity`` event so the
visualization can light up the cluster.

Endpoints (mounted at ``/api/agents/external``):

- ``POST   ""``                    register an agent       -> ExternalAgentSummary
- ``GET    ""``                    list                    -> list[ExternalAgentSummary]
- ``DELETE "/{agent_id}"``         delete                  -> 204
- ``POST   "/{agent_id}/run"``     dispatch + relay        -> ExternalAgentResult
"""

from __future__ import annotations

import ipaddress
import logging
import os
import socket
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException, Response

from backend.db import store as db_store
from backend.lib import events as event_bus
from backend.lib.agent_token import mint as mint_agent_token
from backend.lib.auth_guard import require_session
from backend.models import (
    ExternalAgentCreate,
    ExternalAgentResult,
    ExternalAgentRunRequest,
    ExternalAgentSummary,
    FindContextRequest,
)
from backend.query.engine import QueryEngine

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_session)])


def _to_summary(doc: dict) -> ExternalAgentSummary:
    return ExternalAgentSummary(
        agent_id=doc["agent_id"],
        name=doc["name"],
        endpoint_url=doc["endpoint_url"],
        has_auth=bool(doc.get("auth_header")),
        kind=doc.get("kind", "http"),
        agent_address=doc.get("agent_address"),
        created_at=doc["created_at"],
    )


def _validate_endpoint_url(url: str) -> None:
    """Cheap SSRF guard. In dev mode (default) we only enforce the scheme so
    pointing at ``http://localhost:9999`` keeps working. Set
    ``CARTOGRAPHER_AGENT_BLOCK_PRIVATE_IPS=1`` to refuse private/loopback
    targets — the production posture."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid endpoint_url")
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="invalid endpoint_url")

    if os.getenv("CARTOGRAPHER_AGENT_BLOCK_PRIVATE_IPS") != "1":
        return

    host = parsed.hostname
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="endpoint_url does not resolve")

    for info in infos:
        sockaddr = info[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(
                status_code=400,
                detail="endpoint_url resolves to a non-routable address",
            )


@router.post("", response_model=ExternalAgentSummary)
def register_agent(req: ExternalAgentCreate) -> ExternalAgentSummary:
    """Register a new external agent. ``auth_header`` is stored verbatim
    (hackathon scope) but never returned by ``GET``."""
    _validate_endpoint_url(req.endpoint_url)
    if req.kind == "fetchai" and req.agent_address:
        # Cheap shape check; uAgent addresses always start with ``agent1`` and
        # are bech32-encoded. We don't verify the checksum — the website just
        # needs enough discrimination to refuse obviously wrong input.
        if not req.agent_address.startswith("agent1") or len(req.agent_address) < 20:
            raise HTTPException(
                status_code=400, detail="agent_address does not look like a uAgent address"
            )
    doc = db_store.register_external_agent(
        name=req.name,
        endpoint_url=req.endpoint_url,
        auth_header=req.auth_header,
        kind=req.kind,
        agent_address=req.agent_address,
    )
    return _to_summary(doc)


@router.get("", response_model=list[ExternalAgentSummary])
def list_agents() -> list[ExternalAgentSummary]:
    return [_to_summary(d) for d in db_store.list_external_agents()]


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str) -> Response:
    if not db_store.delete_external_agent(agent_id):
        raise HTTPException(status_code=404, detail="unknown agent_id")
    return Response(status_code=204)


@router.post("/{agent_id}/run", response_model=ExternalAgentResult)
def run_agent(agent_id: str, req: ExternalAgentRunRequest) -> ExternalAgentResult:
    agent = db_store.get_external_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="unknown agent_id")
    if db_store.get_repo(req.repo_hash) is None:
        raise HTTPException(
            status_code=404, detail="unknown repo_hash: %s" % req.repo_hash
        )

    _validate_endpoint_url(agent["endpoint_url"])

    # Pre-fetch the bundle so the external agent receives the same context
    # surface a built-in template would. This may raise if the repo isn't
    # indexed yet; let it propagate as a 500 for now (hackathon scope).
    bundle = QueryEngine(req.repo_hash).find_relevant_context(
        FindContextRequest(task=req.prompt, repo_hash=req.repo_hash)
    )

    # Mint a short-lived read token + advertise the callback base URL so the
    # agent can issue follow-up reads against /api/agent-query/* during its
    # reasoning loop. Token expires in 5 min — well past the 30 s outer
    # timeout below — and is bound to this single repo_hash.
    callback_token = mint_agent_token(req.repo_hash)
    callback_base = os.getenv(
        "CARTOGRAPHER_PUBLIC_BASE_URL", "http://localhost:4000"
    )

    body = {
        "prompt": req.prompt,
        "repo_hash": req.repo_hash,
        "context_bundle": bundle.model_dump(),
        # Optional callback channel — agents that want to do more than skim
        # the pre-fetched bundle use these to call read tools themselves.
        "cartographer_token": callback_token,
        "cartographer_base_url": callback_base,
    }
    headers = {"Content-Type": "application/json"}
    if agent.get("auth_header"):
        headers["Authorization"] = agent["auth_header"]

    try:
        resp = requests.post(
            agent["endpoint_url"], json=body, headers=headers, timeout=30
        )
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="external agent timed out")
    except requests.exceptions.RequestException as exc:
        raise HTTPException(
            status_code=502, detail="external agent unreachable: %s" % exc
        )

    if resp.status_code < 200 or resp.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail="external agent returned HTTP %d" % resp.status_code,
        )

    try:
        payload = resp.json()
    except ValueError:
        raise HTTPException(
            status_code=502, detail="external agent response was not JSON"
        )
    if not isinstance(payload, dict) or not isinstance(payload.get("summary"), str):
        raise HTTPException(
            status_code=502,
            detail="external agent response missing required 'summary' string",
        )

    citations = payload.get("citations") or []
    warnings = payload.get("warnings") or []
    if not isinstance(citations, list) or not isinstance(warnings, list):
        raise HTTPException(
            status_code=502,
            detail="external agent response 'citations'/'warnings' must be lists",
        )

    # Reasoning steps are optional and best-effort: drop malformed entries
    # rather than rejecting the whole reply, since they come from third-party
    # code we don't control.
    raw_steps = payload.get("steps") or []
    steps: list[dict] = []
    if isinstance(raw_steps, list):
        for entry in raw_steps:
            if not isinstance(entry, dict):
                continue
            kind = entry.get("kind")
            text = entry.get("text")
            if kind not in {"thought", "tool_call", "tool_result", "final"}:
                continue
            if not isinstance(text, str):
                continue
            step_citations = entry.get("citations") or []
            if not isinstance(step_citations, list):
                step_citations = []
            steps.append(
                {
                    "kind": kind,
                    "text": text,
                    "tool": entry.get("tool") if isinstance(entry.get("tool"), str) else None,
                    "citations": [c for c in step_citations if isinstance(c, str)],
                    "ts_ms": entry.get("ts_ms") if isinstance(entry.get("ts_ms"), int) else None,
                }
            )
    if raw_steps and not steps:
        warnings = list(warnings) + ["dropped malformed 'steps' entries"]

    emit = event_bus.make_emitter(req.repo_hash)
    emit(
        "agent_activity",
        {
            "query_type": "external:%s" % agent["name"],
            "task": req.prompt,
            "cluster_id": bundle.region.cluster_id,
            "symbol_ids": citations,
            # Carry the agent's natural-language reply so the frontend's
            # AgentActivityLog can render it directly under the entry.
            "summary": payload["summary"],
            "steps": steps,
            "warnings": warnings,
        },
    )

    return ExternalAgentResult(
        summary=payload["summary"],
        citations=citations,
        warnings=warnings,
        steps=steps,
    )
