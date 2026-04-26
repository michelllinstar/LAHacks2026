"""OmegaClaw skill wrapping the Cartographer Coordinator (SPEC §7.3, §14.3).

OmegaClaw is Fetch.ai's skill wrapper that lets Agentverse-discoverable agents
expose a typed, named capability. The actual platform-side registration is
out of scope for this MVP (we don't have OmegaClaw credentials wired); this
module exposes the ``handle_query`` entry point that registration would point
to, plus a ``SKILL_MANIFEST`` describing the skill's input contract.

The skill is a thin adapter that:
1. Receives a user query about a codebase (question + repo_hash).
2. Invokes the Coordinator's classify+dispatch pipeline in-process per
   SPEC §7.2.5 (specialist agents are called as functions, not over uAgents).
3. Formats the resulting bundle into OmegaClaw's expected response shape:
   ``{answer, bundle, query_type, sources}``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from backend.agents import coordinator
from backend.agents.protocols import UserQuery


SKILL_MANIFEST: dict[str, Any] = {
    "name": "cartographer",
    "description": (
        "Codebase Cartographer — four-layer semantic index over a source "
        "repository. Answers questions about symbols, data flow, "
        "architecture clusters, exemplars, and implicit invariants."
    ),
    "keywords": [
        "code",
        "repository",
        "codebase",
        "architecture",
        "convention",
        "invariant",
        "data-flow",
    ],
    "version": "0.1.0",
    "input_schema": {
        "type": "object",
        "properties": {
            "question": {"type": "string"},
            "repo_hash": {"type": "string"},
        },
        "required": ["question", "repo_hash"],
    },
}


@dataclass
class SkillResponse:
    answer: str
    bundle: dict
    query_type: str
    sources: list[str]


def handle_query(
    question: str,
    repo_hash: str,
    *,
    extras: Optional[dict[str, Any]] = None,
) -> dict:
    """Entry point OmegaClaw invokes per user query.

    Builds a :class:`UserQuery`, runs the Coordinator's in-process dispatch,
    and formats the result into the :class:`SkillResponse` wire shape.
    Returns a plain ``dict`` so it serialises cleanly through OmegaClaw's
    JSON transport layer.
    """
    if not question:
        return _error("question is required")
    if not repo_hash:
        return _error("repo_hash is required")

    user_query = UserQuery(repo_hash=repo_hash, question=question)
    if extras:
        # Pass through arbitrary fields so callers can preselect query_type
        # or attach structured payloads (flow / arch / invariant). UserQuery
        # may or may not allow extras depending on whether uagents.Model or
        # pydantic.BaseModel is in play, so we set defensively.
        for k, v in extras.items():
            try:
                setattr(user_query, k, v)
            except Exception:
                pass

    try:
        response = coordinator.handle_user_query(user_query)
    except Exception as exc:  # pragma: no cover - defensive
        return _error(f"coordinator error: {exc}")

    bundle = getattr(response, "bundle", {}) or {}
    if not isinstance(bundle, dict):
        bundle = {}
    query_type = (
        bundle.get("query_type", "find_relevant_context")
        if isinstance(bundle, dict)
        else "find_relevant_context"
    )
    answer = _summarize(query_type, bundle)
    sources = _extract_sources(bundle)
    return SkillResponse(
        answer=answer,
        bundle=bundle,
        query_type=query_type,
        sources=sources,
    ).__dict__


def _error(detail: str) -> dict:
    return {
        "error": detail,
        "answer": "",
        "bundle": {},
        "query_type": "",
        "sources": [],
    }


def _summarize(query_type: str, bundle: dict) -> str:
    """One-line natural-language summary of the bundle for OmegaClaw display."""
    if not isinstance(bundle, dict):
        return "Cartographer query completed."
    # find_relevant_context returns the bundle inline (model_dump of
    # ContextBundle), other query types nest under ``result``.
    result = bundle.get("result") if "result" in bundle else bundle

    if query_type == "find_relevant_context" and isinstance(result, dict):
        rs = result.get("relevant_symbols") or []
        files = {s.get("file_path") for s in rs if isinstance(s, dict)}
        return (
            f"Cartographer ranked {len(rs)} relevant symbols across "
            f"{len(files)} files."
        )
    if query_type == "trace_data_flow" and isinstance(result, dict):
        flows = result.get("flows") or []
        return f"Traced {len(flows)} call-chain flow(s)."
    if query_type == "find_invariants" and isinstance(result, dict):
        invs = result.get("invariants") or []
        return f"Found {len(invs)} invariant(s) attached to the requested target."
    if query_type == "describe_architecture" and isinstance(result, dict):
        cluster = result.get("cluster") or {}
        role = cluster.get("role", "") if isinstance(cluster, dict) else ""
        return f"Cluster role: {role[:120]}" if role else "No matching cluster."
    if query_type == "find_exemplars" and isinstance(result, dict):
        files = result.get("files") or []
        return f"Found {len(files)} exemplar file(s) within the cluster."
    return "Cartographer query completed."


def _extract_sources(bundle: dict) -> list[str]:
    """Surface file paths the user can open. Best-effort across query types."""
    if not isinstance(bundle, dict):
        return []
    # Look in both the top-level bundle (find_relevant_context) and the
    # nested ``result`` wrapper (other query types) so a single helper covers
    # every Coordinator response shape.
    candidates: list[dict] = []
    if isinstance(bundle.get("result"), dict):
        candidates.append(bundle["result"])
    candidates.append(bundle)

    out: set[str] = set()
    for src in candidates:
        for sym in src.get("relevant_symbols") or []:
            if isinstance(sym, dict) and sym.get("file_path"):
                out.add(sym["file_path"])
        for ex in src.get("exemplars") or []:
            if isinstance(ex, dict) and ex.get("file_path"):
                out.add(ex["file_path"])
        for fp in src.get("member_files") or []:
            if isinstance(fp, str):
                out.add(fp)
        for f in src.get("files") or []:
            if isinstance(f, dict) and f.get("file_path"):
                out.add(f["file_path"])
    return sorted(out)[:25]
