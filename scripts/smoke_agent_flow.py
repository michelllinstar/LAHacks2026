"""End-to-end smoke for the agent lifecycle: index a directory, then query it
through the same MCP tool surface an external agent (Claude Desktop, Cursor)
would use. Bypasses the JSON-RPC transport so failures point at the engine,
not the wire protocol.

Usage:
    python scripts/smoke_agent_flow.py <path>
    python scripts/smoke_agent_flow.py <path> --skip-index   # reuse existing index
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
load_dotenv(_ROOT / ".env")
load_dotenv(_ROOT / ".env.local", override=True)

from backend.lib.repo_hash import hash_repo  # noqa: E402
from backend.mcp.server import (  # noqa: E402
    tool_describe_architecture,
    tool_find_invariants,
    tool_find_relevant_context,
    tool_index_directory,
    tool_trace_data_flow,
)


def _truncate(obj, n: int = 600) -> str:
    s = json.dumps(obj, default=str, indent=2)
    return s if len(s) <= n else s[:n] + "\n  ... [truncated]"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="directory to index")
    ap.add_argument("--task", default="how does authentication work")
    ap.add_argument("--skip-index", action="store_true",
                    help="use the pre-existing index for this path")
    args = ap.parse_args()

    path = Path(args.path).expanduser().resolve()
    if not path.is_dir():
        sys.exit(f"not a directory: {path}")

    if args.skip_index:
        repo_hash = hash_repo(local_path=str(path))
        print(f"[1/4] reusing existing index hash={repo_hash}")
    else:
        print(f"[1/4] indexing {path}")
        idx = tool_index_directory({"path": str(path)})
        if "error" in idx:
            sys.exit(f"index failed: {idx['error']}")
        repo_hash = idx["repo_hash"]
        print(f"      hash={repo_hash} counts={idx['counts']}")

    print(f"\n[2/4] find_relevant_context(task={args.task!r})")
    ctx = tool_find_relevant_context({"task": args.task, "repo_hash": repo_hash})
    syms = ctx.get("relevant_symbols", [])[:5]
    print(f"      {len(ctx.get('relevant_symbols', []))} symbols ranked, top 5:")
    for s in syms:
        print(f"        {s['qualified_name']}  {s['file_path']}:{s['line_start']}")

    print("\n[3/4] describe_architecture()")
    arch = tool_describe_architecture({"repo_hash": repo_hash})
    clusters = arch.get("clusters", [])
    print(f"      {len(clusters)} clusters")
    for c in clusters[:3]:
        print(f"        cluster {c.get('cluster_id')}  role={c.get('role')!r}  files={len(c.get('member_files', []))}")

    if syms:
        seed = syms[0]["qualified_name"]
        print(f"\n[4a/4] trace_data_flow(symbol={seed!r})")
        flow = tool_trace_data_flow({
            "repo_hash": repo_hash, "symbol": seed,
            "direction": "forward", "depth": 3,
        })
        print(f"      {len(flow.get('flows', []))} flows traced")

        print(f"\n[4b/4] find_invariants(symbol={seed!r})")
        inv = tool_find_invariants({"repo_hash": repo_hash, "symbol": seed})
        print(f"      {len(inv)} invariants")
        for i in inv[:3]:
            print(f"        [{i.get('source_kind')}] {i.get('description', '')[:80]}")
    else:
        print("\n[4/4] no symbols → skipping flow + invariant probes "
              "(check tree-sitter install if you expected results)")

    print("\nOK — full agent loop completed.")


if __name__ == "__main__":
    main()
