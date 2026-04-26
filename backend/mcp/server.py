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
                description=f"Cartographer {name} query",
                inputSchema={"type": "object", "additionalProperties": True},
            )
            for name in TOOLS
        ]

    @server.call_tool()
    async def _call_tool(name: str, arguments: dict[str, Any]) -> list[Any]:
        secret = arguments.pop("__secret__", None) if isinstance(arguments, dict) else None
        if not _check_secret(secret):
            return [TextContent(type="text", text=json.dumps({"error": "unauthorized"}))]
        impl = TOOLS.get(name)
        if not impl:
            return [TextContent(type="text", text=json.dumps({"error": f"unknown tool {name}"}))]
        result = impl(arguments or {})
        return [TextContent(type="text", text=json.dumps(result, default=str))]

    async def _run() -> None:
        async with stdio_server() as (reader, writer):
            await server.run(reader, writer, server.create_initialization_options())

    asyncio.run(_run())


if __name__ == "__main__":  # pragma: no cover
    main()
