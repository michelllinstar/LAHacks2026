"""Query Engine REST endpoints — five query types from SPEC §5.1."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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

router = APIRouter()


class DispatchRequest(BaseModel):
    query_type: Literal[
        "find_relevant_context",
        "trace_data_flow",
        "find_invariants",
        "describe_architecture",
        "find_exemplars",
    ]
    repo_hash: str
    # All other fields from any of the five request models, optional:
    task: Optional[str] = None
    seed_symbol: Optional[str] = None
    symbol: Optional[str] = None
    direction: Optional[str] = None
    depth: Optional[int] = None
    cluster_id: Optional[str] = None
    path: Optional[str] = None
    min_confidence: Optional[float] = None


class DispatchResponse(BaseModel):
    query_type: str
    result: dict


@router.post("/find_relevant_context", response_model=ContextBundle)
def find_relevant_context(req: FindContextRequest) -> ContextBundle:
    return QueryEngine(req.repo_hash).find_relevant_context(req)


@router.post("/trace_data_flow")
def trace_data_flow(req: FlowRequest) -> dict:
    return QueryEngine(req.repo_hash).trace_data_flow(req)


@router.post("/find_invariants")
def find_invariants(req: InvariantRequest) -> list[dict]:
    return QueryEngine(req.repo_hash).find_invariants(req)


@router.post("/describe_architecture", response_model=ArchResponse)
def describe_architecture(req: ArchRequest) -> ArchResponse:
    return QueryEngine(req.repo_hash).describe_architecture(req)


@router.post("/find_exemplars", response_model=ExemplarResponse)
def find_exemplars(req: ExemplarRequest) -> ExemplarResponse:
    return QueryEngine(req.repo_hash).find_exemplars(req)


@router.post("/dispatch", response_model=DispatchResponse)
def dispatch_query(payload: DispatchRequest) -> DispatchResponse:
    """Unified dispatcher — routes a query_type + payload to the right engine method.

    The frontend's QueryConsole posts here so it can submit any of the five
    query types without selecting a specific endpoint URL. The five direct
    endpoints above remain unchanged for MCP / agent-protocol callers.
    """
    engine = QueryEngine(payload.repo_hash)
    qt = payload.query_type
    if qt == "find_relevant_context":
        bundle = engine.find_relevant_context(FindContextRequest(
            task=payload.task or "",
            seed_symbol=payload.seed_symbol,
            repo_hash=payload.repo_hash,
        ))
        return DispatchResponse(query_type=qt, result=bundle.model_dump())
    if qt == "trace_data_flow":
        if not payload.symbol:
            raise HTTPException(status_code=400, detail="symbol required for trace_data_flow")
        result = engine.trace_data_flow(FlowRequest(
            symbol=payload.symbol,
            direction=payload.direction or "forward",
            depth=int(payload.depth or 3),
            repo_hash=payload.repo_hash,
        ))
        return DispatchResponse(query_type=qt, result=result)
    if qt == "find_invariants":
        invariants = engine.find_invariants(InvariantRequest(
            symbol=payload.symbol,
            cluster_id=payload.cluster_id,
            min_confidence=float(payload.min_confidence or 0.0),
            repo_hash=payload.repo_hash,
        ))
        return DispatchResponse(query_type=qt, result={"invariants": invariants})
    if qt == "describe_architecture":
        response = engine.describe_architecture(ArchRequest(
            path=payload.path,
            cluster_id=payload.cluster_id,
            repo_hash=payload.repo_hash,
        ))
        return DispatchResponse(query_type=qt, result=response.model_dump())
    if qt == "find_exemplars":
        if not payload.cluster_id:
            raise HTTPException(status_code=400, detail="cluster_id required for find_exemplars")
        response = engine.find_exemplars(ExemplarRequest(
            task=payload.task or "",
            cluster_id=payload.cluster_id,
            repo_hash=payload.repo_hash,
        ))
        return DispatchResponse(query_type=qt, result=response.model_dump())
    raise HTTPException(status_code=400, detail=f"unknown query_type: {qt}")
