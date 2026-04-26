"""Shared uAgent message schemas.

The ``uagents`` SDK is optional at import time so the FastAPI process can run
without the agent runtime installed. When ``uagents`` is missing we fall back
to ``pydantic.BaseModel`` aliases — the schemas remain valid Pydantic models
for callers that just need the shape.
"""

from __future__ import annotations

from typing import Any, Optional

try:
    from uagents import Model  # type: ignore
except Exception:  # pragma: no cover - optional dep
    from pydantic import BaseModel as Model  # type: ignore


class IndexRepo(Model):
    repo_hash: str
    repo_path: str


class IndexProgress(Model):
    repo_hash: str
    layer: str
    state: str
    count: int = 0


class SymbolQuery(Model):
    repo_hash: str
    task: str
    seed_symbol: Optional[str] = None
    cluster_id: Optional[str] = None


class SymbolGraph(Model):
    symbols: list[dict[str, Any]] = []


class ArchQuery(Model):
    repo_hash: str
    path: Optional[str] = None
    cluster_id: Optional[str] = None


class ArchGraph(Model):
    cluster: dict[str, Any] = {}
    member_files: list[str] = []


class FlowQuery(Model):
    repo_hash: str
    symbol: str
    direction: str = "forward"
    depth: int = 3


class FlowGraph(Model):
    flows: list[dict[str, Any]] = []


class InvariantQuery(Model):
    repo_hash: str
    symbol: Optional[str] = None
    cluster_id: Optional[str] = None
    min_confidence: float = 0.0


class InvariantGraph(Model):
    invariants: list[dict[str, Any]] = []


class UserQuery(Model):
    # Allow callers (e.g. the OmegaClaw skill) to pass ``query_type`` or
    # structured payloads alongside the required fields; the Coordinator
    # reads them via ``model_extra``. uagents.Model is built on Pydantic
    # v1, so we use an inner Config class (the v1-canonical syntax) which
    # also still works under v2.
    repo_hash: str
    question: str

    class Config:
        extra = "allow"


class UserResponse(Model):
    bundle: dict[str, Any] = {}
