"""Query Engine REST endpoints — five query types from SPEC §5.1."""

from __future__ import annotations

from fastapi import APIRouter

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
