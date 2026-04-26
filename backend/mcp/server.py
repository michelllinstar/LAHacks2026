"""MCP stdio server exposing the Cartographer lifecycle + query tools.

The MCP SDK is an optional dependency; when missing, ``main()`` exits with a
clear message rather than crashing FastAPI imports of this module.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

from backend.db import store as db_store
from backend.indexer.runner import run_index
from backend.lib.repo_hash import hash_repo
from backend.models import (
    ArchRequest,
    ExemplarRequest,
    FindContextRequest,
    FlowRequest,
    InvariantRequest,
)
from backend.query.engine import QueryEngine

logger = logging.getLogger(__name__)


def _check_secret(provided: str | None) -> bool:
    """Authorize an MCP tool call.

    Precedence:
    1. ``MCP_SHARED_SECRET`` set → require ``provided`` to match exactly.
       ``CARTOGRAPHER_DEV`` is ignored in this branch so a stray dev flag
       can never weaken a configured secret.
    2. ``MCP_SHARED_SECRET`` unset → deny all calls unless
       ``CARTOGRAPHER_DEV=1`` (dev convenience).
    """
    expected = os.getenv("MCP_SHARED_SECRET")
    if expected:
        return provided == expected
    return os.getenv("CARTOGRAPHER_DEV") == "1"


def _engine(repo_hash: str) -> QueryEngine:
    return QueryEngine(repo_hash)


# ---------------------------------------------------------------------------
# Tool implementations (pure-python, no MCP SDK)
# ---------------------------------------------------------------------------


def tool_index_directory(args: dict[str, Any]) -> dict[str, Any]:
    """Index a local directory and return its repo_hash plus per-layer counts.

    Synchronous: blocks until all four layers complete. The agent uses the
    returned ``repo_hash`` for subsequent query tool calls. Re-indexing the
    same path produces the same hash and overwrites prior state.
    """
    raw = args.get("path")
    if not raw or not isinstance(raw, str):
        return {"error": "path (string) is required"}
    path = Path(raw).expanduser().resolve()
    if not path.is_dir():
        return {"error": f"not a directory: {path}"}

    repo_hash = hash_repo(local_path=str(path))
    db_store.upsert_repo(
        hash=repo_hash,
        name=path.name or repo_hash,
        local_path=str(path),
        status="pending",
    )
    progress: list[dict[str, Any]] = []

    def _emit(event_type: str, payload: dict) -> None:
        progress.append({"event": event_type, **payload})

    run_index(repo_hash, str(path), _emit, job_id="mcp")

    counts = {
        "symbols": len(db_store.iter_symbols(repo_hash)),
        "flows": db_store.count_flows(repo_hash),
        "clusters": db_store.count_clusters(repo_hash),
        "invariants": db_store.count_invariants(repo_hash),
    }
    return {
        "repo_hash": repo_hash,
        "name": path.name,
        "local_path": str(path),
        "counts": counts,
    }


def tool_find_relevant_context(args: dict[str, Any]) -> dict[str, Any]:
    req = FindContextRequest(**args)
    return _engine(req.repo_hash).find_relevant_context(req).model_dump()


def tool_trace_data_flow(args: dict[str, Any]) -> dict[str, Any]:
    req = FlowRequest(**args)
    return _engine(req.repo_hash).trace_data_flow(req)


def tool_find_invariants(args: dict[str, Any]) -> list[dict[str, Any]]:
    req = InvariantRequest(**args)
    return _engine(req.repo_hash).find_invariants(req)


def tool_describe_architecture(args: dict[str, Any]) -> dict[str, Any]:
    req = ArchRequest(**args)
    return _engine(req.repo_hash).describe_architecture(req).model_dump()


def tool_find_exemplars(args: dict[str, Any]) -> dict[str, Any]:
    req = ExemplarRequest(**args)
    return _engine(req.repo_hash).find_exemplars(req).model_dump()


TOOLS = {
    "index_directory": tool_index_directory,
    "find_relevant_context": tool_find_relevant_context,
    "trace_data_flow": tool_trace_data_flow,
    "find_invariants": tool_find_invariants,
    "describe_architecture": tool_describe_architecture,
    "find_exemplars": tool_find_exemplars,
}


# ---------------------------------------------------------------------------
# Tool descriptions + input schemas
#
# The description field is what the agent reads to decide *which* tool to
# call; the schema is what tells it which arguments to pass. Without these,
# every Pydantic 422 burns a roundtrip while the model guesses field names.
# Schemas are written by hand (rather than auto-derived) so they stay small
# and free of Pydantic internals like $defs / title / default.
# ---------------------------------------------------------------------------


_REPO_HASH = {"type": "string", "description": "Repo hash returned by index_directory."}


TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "index_directory": {
        "description": (
            "Index a local source directory. Returns repo_hash + per-layer "
            "counts. Call this once before any query tool. Re-indexing the "
            "same path is idempotent."
        ),
        "schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or ~-relative path to a source directory.",
                },
            },
            "required": ["path"],
        },
    },
    "find_relevant_context": {
        "description": (
            "Given a natural-language task, return the top symbols, flows, "
            "and exemplars relevant to it. Best first call when you don't "
            "yet know which symbol to focus on."
        ),
        "schema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Natural-language description of what you're trying to do.",
                },
                "repo_hash": _REPO_HASH,
                "seed_symbol": {
                    "type": "string",
                    "description": "Optional fully-qualified symbol to bias retrieval toward.",
                },
            },
            "required": ["task", "repo_hash"],
        },
    },
    "trace_data_flow": {
        "description": (
            "Trace value flow through symbols starting from `symbol`. "
            "`forward` follows where its return value goes; `backward` "
            "follows where its arguments come from."
        ),
        "schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Fully-qualified symbol name."},
                "direction": {"type": "string", "enum": ["forward", "backward"]},
                "depth": {"type": "integer", "minimum": 1, "maximum": 6, "default": 3},
                "repo_hash": _REPO_HASH,
            },
            "required": ["symbol", "repo_hash"],
        },
    },
    "find_invariants": {
        "description": (
            "Return inferred invariants (preconditions, postconditions, "
            "documented assumptions) for a symbol or cluster. Useful before "
            "modifying code so you don't break implicit contracts."
        ),
        "schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Fully-qualified symbol; mutually exclusive with cluster_id."},
                "cluster_id": {"type": "string", "description": "Cluster ObjectId; mutually exclusive with symbol."},
                "min_confidence": {"type": "number", "minimum": 0, "maximum": 1, "default": 0.0},
                "repo_hash": _REPO_HASH,
            },
            "required": ["repo_hash"],
        },
    },
    "describe_architecture": {
        "description": (
            "Return a high-level description of the repo or a folder/cluster: "
            "components, responsibilities, and cross-component dependencies."
        ),
        "schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Folder path to scope the description to. Optional."},
                "cluster_id": {"type": "string", "description": "Cluster ObjectId to scope to. Optional."},
                "repo_hash": _REPO_HASH,
            },
            "required": ["repo_hash"],
        },
    },
    "find_exemplars": {
        "description": (
            "Find canonical examples in the repo of a pattern (e.g. 'how we "
            "do auth middleware'). Cheaper than reading many files yourself."
        ),
        "schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "What pattern you're looking for."},
                "repo_hash": _REPO_HASH,
            },
            "required": ["task", "repo_hash"],
        },
    },
}


# Result-payload trimmers.
#
# Default model_dump output of the query engine is comprehensive — every
# RankedSymbol carries signals/invariants, every Region carries the full
# cluster description, etc. Most agent loops only need names + locations
# to decide what to read next. We trim by default and let the caller opt
# in to the verbose form with __verbose__=true so power users can still
# inspect everything when debugging.

_MAX_SYMBOLS = 8
_MAX_FLOWS = 5
_MAX_INVARIANTS = 8


def _trim_symbol(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "qualified_name": s.get("qualified_name"),
        "file_path": s.get("file_path"),
        "line_start": s.get("line_start"),
        "line_end": s.get("line_end"),
        "kind": s.get("kind"),
        "signature": s.get("signature"),
    }


def _trim_flow(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_symbol": f.get("source_symbol"),
        "sink_symbol": f.get("sink_symbol"),
        "flow_kind": f.get("flow_kind"),
        # Keep only the first + last hop; intermediates are usually noise.
        "path": [(f.get("path") or [])[0], (f.get("path") or [])[-1]] if f.get("path") else [],
    }


def _trim_invariant(i: dict[str, Any]) -> dict[str, Any]:
    return {
        "target_symbol": i.get("target_symbol"),
        "text": i.get("text"),
        "source_kind": i.get("source_kind"),
        "confidence": i.get("confidence"),
    }


def _compact_result(name: str, result: Any) -> Any:
    """Trim verbose query-engine payloads so agents pay for what they read.

    The agent can ask for the full payload by sending ``__verbose__: true``
    in the tool args, in which case ``call_tool`` skips this function.
    """
    if not isinstance(result, (dict, list)):
        return result
    if name == "find_relevant_context" and isinstance(result, dict):
        return {
            "region": {
                "role": (result.get("region") or {}).get("role"),
                "cluster_id": (result.get("region") or {}).get("cluster_id"),
            },
            "relevant_symbols": [
                _trim_symbol(s) for s in (result.get("relevant_symbols") or [])[:_MAX_SYMBOLS]
            ],
            "flows": [_trim_flow(f) for f in (result.get("flows") or [])[:_MAX_FLOWS]],
            "notes": result.get("notes") or [],
            "_truncated": {
                "symbols": max(0, len(result.get("relevant_symbols") or []) - _MAX_SYMBOLS),
                "flows": max(0, len(result.get("flows") or []) - _MAX_FLOWS),
                "hint": "Set __verbose__=true to receive the full payload.",
            },
        }
    if name == "find_invariants" and isinstance(result, list):
        return {
            "invariants": [_trim_invariant(i) for i in result[:_MAX_INVARIANTS]],
            "_truncated": max(0, len(result) - _MAX_INVARIANTS),
        }
    if name == "trace_data_flow" and isinstance(result, dict):
        flows = result.get("flows") or []
        return {
            "flows": [_trim_flow(f) for f in flows[:_MAX_FLOWS]],
            "_truncated": max(0, len(flows) - _MAX_FLOWS),
        }
    if name == "describe_architecture" and isinstance(result, dict):
        # Keep the prose summary + cluster names; drop full cluster bodies.
        clusters = result.get("clusters") or []
        return {
            "summary": result.get("summary"),
            "clusters": [
                {"id": c.get("id"), "name": c.get("name"), "role": c.get("role")}
                for c in clusters[:_MAX_INVARIANTS]
            ],
            "_truncated": max(0, len(clusters) - _MAX_INVARIANTS),
        }
    return result


# ---------------------------------------------------------------------------
# MCP SDK wiring (optional)
# ---------------------------------------------------------------------------


def main() -> None:
    try:
        from mcp.server import Server  # type: ignore
        from mcp.server.stdio import stdio_server  # type: ignore
        from mcp.types import TextContent, Tool  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise SystemExit(
            f"MCP SDK not installed; cannot start Cartographer MCP server: {exc}"
        )

    server: Any = Server("cartographer")

    @server.list_tools()
    async def _list_tools() -> list[Any]:
        return [
            Tool(
                name=name,
                description=TOOL_SCHEMAS[name]["description"],
                inputSchema=TOOL_SCHEMAS[name]["schema"],
            )
            for name in TOOLS
        ]

    @server.call_tool()
    async def _call_tool(name: str, arguments: dict[str, Any]) -> list[Any]:
        args = dict(arguments or {})
        secret = args.pop("__secret__", None)
        verbose = bool(args.pop("__verbose__", False))
        if not _check_secret(secret):
            return [TextContent(type="text", text=json.dumps({"error": "unauthorized"}))]
        impl = TOOLS.get(name)
        if not impl:
            return [TextContent(type="text", text=json.dumps({"error": f"unknown tool {name}"}))]
        result = impl(args)
        if not verbose:
            result = _compact_result(name, result)
        return [TextContent(type="text", text=json.dumps(result, default=str))]

    async def _run() -> None:
        async with stdio_server() as (reader, writer):
            await server.run(reader, writer, server.create_initialization_options())

    asyncio.run(_run())


if __name__ == "__main__":  # pragma: no cover
    main()
