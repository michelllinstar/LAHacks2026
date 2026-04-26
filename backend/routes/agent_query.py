"""Read-only query surface for external agents.

Mirrors a subset of ``backend.routes.query`` — the five Query Engine reads —
but is gated by the ``X-Cartographer-Agent-Token`` header instead of the
session cookie. The token is issued by ``backend.routes.external_agents``
when it dispatches a registered agent and is bound to a specific repo hash.

Anything that mutates state (indexing, repo CRUD, agent-run creation) is
deliberately *not* exposed here. The dispatcher endpoint from query.py is
also omitted — agents address tools by name, so the wrapper offers no value
and just widens the attack surface.
"""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException

from backend.lib.agent_token import verify
from backend.models import (
    ArchRequest,
    ArchResponse,
    ContextBundle,
    ExemplarRequest,
    ExemplarResponse,
    FindContextRequest,
    FlowRequest,
    InvariantRequest,
)
from backend.query.engine import QueryEngine


def require_agent_token(
    x_cartographer_agent_token: str | None = Header(default=None),
) -> dict:
    if not x_cartographer_agent_token:
        raise HTTPException(
            status_code=401, detail="missing X-Cartographer-Agent-Token"
        )
    try:
        return verify(x_cartographer_agent_token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"invalid agent token: {exc}") from None


router = APIRouter(dependencies=[Depends(require_agent_token)])


def _enforce_scope(claims: dict, repo_hash: str) -> None:
    """Defence in depth: the token's repo_hash must match the request body's
    repo_hash. Otherwise an agent issued a token for repo A could read repo B
    by changing the body."""
    if claims.get("repo_hash") != repo_hash:
        raise HTTPException(
            status_code=403,
            detail="agent token is scoped to a different repo_hash",
        )


@router.post("/find_relevant_context", response_model=ContextBundle)
def find_relevant_context(
    req: FindContextRequest, claims: dict = Depends(require_agent_token)
) -> ContextBundle:
    _enforce_scope(claims, req.repo_hash)
    return QueryEngine(req.repo_hash).find_relevant_context(req)


@router.post("/trace_data_flow")
def trace_data_flow(
    req: FlowRequest, claims: dict = Depends(require_agent_token)
) -> dict:
    _enforce_scope(claims, req.repo_hash)
    return QueryEngine(req.repo_hash).trace_data_flow(req)


@router.post("/find_invariants")
def find_invariants(
    req: InvariantRequest, claims: dict = Depends(require_agent_token)
) -> list[dict]:
    _enforce_scope(claims, req.repo_hash)
    return QueryEngine(req.repo_hash).find_invariants(req)


@router.post("/describe_architecture", response_model=ArchResponse)
def describe_architecture(
    req: ArchRequest, claims: dict = Depends(require_agent_token)
) -> ArchResponse:
    _enforce_scope(claims, req.repo_hash)
    return QueryEngine(req.repo_hash).describe_architecture(req)


@router.post("/find_exemplars", response_model=ExemplarResponse)
def find_exemplars(
    req: ExemplarRequest, claims: dict = Depends(require_agent_token)
) -> ExemplarResponse:
    _enforce_scope(claims, req.repo_hash)
    return QueryEngine(req.repo_hash).find_exemplars(req)
