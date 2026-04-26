"""Shared Pydantic contract for Cartographer.

All HTTP routes, agent protocol messages, MCP tools, and frontend mocks share
these shapes. Pydantic v2 syntax.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Graph projection (frontend visualization contract)
# ---------------------------------------------------------------------------


class GraphNode(BaseModel):
    id: str
    kind: Literal["symbol", "cluster", "flow_node", "invariant"]
    label: str
    layer: int
    metadata: dict[str, Any] = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    kind: str
    weight: float = 1.0
    metadata: dict[str, Any] = {}


class GraphProjection(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# ---------------------------------------------------------------------------
# Repository registration & indexing
# ---------------------------------------------------------------------------


class RepoCreate(BaseModel):
    git_url: Optional[str] = None
    local_path: Optional[str] = None
    name: Optional[str] = None


class RepoSummary(BaseModel):
    hash: str
    name: str
    status: Literal["pending", "indexing", "ready", "stale"]
    git_url: Optional[str] = None
    local_path: Optional[str] = None
    # Convenience field: number of Layer 1 symbols indexed for this repo.
    # Surfaced so the dashboard can show "N symbols indexed" without needing
    # a per-repo round trip to /api/repos/{hash}/index. Defaults to 0 for
    # newly-created (un-indexed) repos.
    symbol_count: int = 0


class IndexJob(BaseModel):
    job_id: str
    repo_hash: str
    status: str


class LayerStatus(BaseModel):
    state: Literal["pending", "running", "done", "error"]
    count: int = 0
    started_at: Optional[str] = None
    ended_at: Optional[str] = None


class IndexStatus(BaseModel):
    repo_hash: str
    layers: dict[str, LayerStatus]


# ---------------------------------------------------------------------------
# Context bundle (Query Engine response surface)
# ---------------------------------------------------------------------------


class Region(BaseModel):
    # cluster_id is the stringified ObjectId of the underlying Layer 3
    # cluster document. Wire format is always a string so the frontend can
    # treat it opaquely; backend converts via str(ObjectId) on read.
    cluster_id: Optional[str] = None
    role: str = ""
    conventions: dict[str, Any] = {}
    dependencies: dict[str, list[str]] = {}


class RelevantSymbol(BaseModel):
    qualified_name: str
    file_path: str
    line_start: int
    line_end: int
    signature: str
    kind: str
    invariants: list[dict[str, Any]] = []
    signals: dict[str, float] = {}


class Exemplar(BaseModel):
    file_path: str
    reason: str


class FlowPath(BaseModel):
    source_symbol: str
    sink_symbol: str
    path: list[str]
    flow_kind: str
    sensitivity: Optional[str] = None


class Invariant(BaseModel):
    target_symbol: str
    text: str
    source_kind: Literal["test", "defensive", "comment"]
    source_location: str
    confidence: float


class ContextBundle(BaseModel):
    region: Region
    exemplars: list[Exemplar]
    relevant_symbols: list[RelevantSymbol]
    flows: list[FlowPath]
    notes: list[str]


# ---------------------------------------------------------------------------
# Query Engine request shapes
# ---------------------------------------------------------------------------


class FindContextRequest(BaseModel):
    task: str
    seed_symbol: Optional[str] = None
    repo_hash: str


class FlowRequest(BaseModel):
    symbol: str
    direction: Literal["forward", "backward"] = "forward"
    depth: int = 3
    repo_hash: str


class InvariantRequest(BaseModel):
    symbol: Optional[str] = None
    cluster_id: Optional[str] = None
    min_confidence: float = 0.0
    repo_hash: str


class ArchRequest(BaseModel):
    path: Optional[str] = None
    cluster_id: Optional[str] = None
    repo_hash: str


class ArchResponse(BaseModel):
    cluster: Region
    member_files: list[str]


class ExemplarRequest(BaseModel):
    task: str
    cluster_id: str
    repo_hash: str


class ExemplarResponse(BaseModel):
    files: list[Exemplar]


# ---------------------------------------------------------------------------
# Auth (kept for the existing /api/auth/login route)
# ---------------------------------------------------------------------------


class LoginPayload(BaseModel):
    email: str
    password: str


# ---------------------------------------------------------------------------
# External agents (user-registered HTTP endpoints)
# ---------------------------------------------------------------------------


class ExternalAgentCreate(BaseModel):
    name: str
    endpoint_url: str
    auth_header: Optional[str] = None


class ExternalAgentSummary(BaseModel):
    agent_id: str
    name: str
    endpoint_url: str
    has_auth: bool      # True iff auth_header is set; raw value never returned
    created_at: str


class ExternalAgentRunRequest(BaseModel):
    repo_hash: str
    prompt: str


class ReasoningStep(BaseModel):
    """One entry in an external agent's chain of reasoning. Optional — agents
    that don't supply steps still get a single-summary activity entry."""

    kind: Literal["thought", "tool_call", "tool_result", "final"]
    text: str
    tool: Optional[str] = None
    citations: list[str] = []
    ts_ms: Optional[int] = None


class ExternalAgentResult(BaseModel):
    summary: str
    citations: list[str] = []
    warnings: list[str] = []
    steps: list[ReasoningStep] = []
