#!/bin/bash
# Wrapper that launches the Cartographer MCP server from anywhere.
# Used by Claude Code (`claude mcp add`), Claude Desktop, Cursor, etc.
#
# Resolves to the project root regardless of caller CWD, then execs the
# stdio MCP server. .env is auto-loaded by backend.main on import.

set -euo pipefail

# Resolve the directory this script lives in, then walk one up to repo root.
# Using BASH_SOURCE so symlinks are followed correctly.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Pin to the interpreter that has the project's deps. Override by setting
# CARTOGRAPHER_PYTHON in the caller's env (handy when testing under venv).
PYTHON_BIN="${CARTOGRAPHER_PYTHON:-/opt/anaconda3/bin/python}"

# Dev-mode default lets the MCP server fail-open when MCP_SHARED_SECRET is
# blank. Override by exporting MCP_SHARED_SECRET in the caller's env.
export CARTOGRAPHER_DEV="${CARTOGRAPHER_DEV:-1}"

# Force-blank the secret so MCP clients (Claude Desktop, Cursor, etc.) that
# can't pass a per-call ``__secret__`` argument aren't rejected. We set to
# empty string rather than ``unset`` because backend/db/store.py loads .env
# with override=False — an unset var would get repopulated from .env, but
# an empty-but-set var wins and is treated as "no secret configured" by
# backend/mcp/server.py:_check_secret. Override by exporting a non-empty
# MCP_SHARED_SECRET (and the matching __secret__ in tool calls) in the
# caller's env when you want production-style auth.
export MCP_SHARED_SECRET="${MCP_SHARED_SECRET:-}"

# Make the repo importable as `backend.*`.
export PYTHONPATH="$REPO_ROOT:${PYTHONPATH:-}"

exec "$PYTHON_BIN" -m backend.mcp.server
