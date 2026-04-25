"""Graph projection endpoints (frontend visualization contract)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.db import store as db_store
from backend.models import GraphProjection
from backend.query import graph_api

router = APIRouter()

_VALID_LAYERS = {"symbol", "flow", "architecture", "invariant"}


@router.get("/{repo_hash}/graph/{layer}", response_model=GraphProjection)
def get_graph(repo_hash: str, layer: str) -> GraphProjection:
    if layer not in _VALID_LAYERS:
        raise HTTPException(status_code=400, detail=f"unknown layer '{layer}'")
    if db_store.get_repo(repo_hash) is None:
        raise HTTPException(status_code=404, detail="repo not found")
    return graph_api.projection_for(repo_hash, layer)
