"""Minimum-viable Cartographer CLI.

Two commands. Writes to the same MongoDB the FastAPI server reads from, so
results show up automatically in the website + every protocol adapter.

    python -m backend.cli index <path>      # index a directory
    python -m backend.cli query "<task>"    # ask the most recently indexed repo

The CLI bypasses backend/routes/ entirely (no JWT, no FastAPI overhead, no
workspace-path jail) and calls the underlying engine functions directly.
``MONGODB_URI`` and ``GEMINI_API_KEY`` come from the same .env the server uses.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load env BEFORE importing backend.* so MONGODB_URI / GEMINI_API_KEY reach
# the lazy clients on first call. Match backend/main.py's layering.
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / ".env.local", override=True)

from backend.db import store as db_store  # noqa: E402
from backend.indexer.runner import run_index  # noqa: E402
from backend.lib.repo_hash import hash_repo  # noqa: E402
from backend.main import configure_logging  # noqa: E402
from backend.models import FindContextRequest  # noqa: E402
from backend.query.engine import QueryEngine  # noqa: E402

_LAST_FILE = Path.home() / ".cartographer" / "last"


def _save_last(repo_hash: str) -> None:
    _LAST_FILE.parent.mkdir(parents=True, exist_ok=True)
    _LAST_FILE.write_text(repo_hash + "\n")


def _read_last() -> str:
    if not _LAST_FILE.exists():
        sys.exit("no indexed repo. run: python -m backend.cli index <path>")
    return _LAST_FILE.read_text().strip()


def cmd_index(path_str: str) -> None:
    path = Path(path_str).expanduser().resolve()
    if not path.is_dir():
        sys.exit(f"not a directory: {path}")

    repo_hash = hash_repo(local_path=str(path))
    db_store.upsert_repo(
        hash=repo_hash,
        name=path.name or repo_hash,
        local_path=str(path),
        status="pending",
    )

    def emit(event_type: str, payload: dict) -> None:
        # Mirror the SSE event shape the FastAPI route emits, but to stdout.
        layer = payload.get("layer", "")
        state = payload.get("state", "")
        count = payload.get("count")
        line = f"[{event_type}] {layer} {state}".rstrip()
        if count is not None:
            line += f" count={count}"
        print(line, flush=True)

    print(f"indexing {path} ({repo_hash})", flush=True)
    run_index(repo_hash, str(path), emit, job_id="cli")
    _save_last(repo_hash)

    print()
    print(f"indexed: {path.name}")
    print(f"hash:    {repo_hash}")
    print()
    print(f"open: http://localhost:3000/workspace/{repo_hash}")
    print(f"ask:  python -m backend.cli query \"<your task>\"")


def cmd_query(task: str) -> None:
    repo_hash = _read_last()
    bundle = QueryEngine(repo_hash).find_relevant_context(
        FindContextRequest(task=task, repo_hash=repo_hash)
    )

    print(f"region: {bundle.region.role or '(no role inferred)'}")
    print()
    if bundle.relevant_symbols:
        print("top symbols:")
        for s in bundle.relevant_symbols[:5]:
            print(f"  {s.qualified_name}  {s.file_path}:{s.line_start}")
    else:
        print("(no symbols matched)")

    if bundle.notes:
        print()
        print("notes:")
        for n in bundle.notes:
            print(f"  - {n}")


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(prog="cartographer")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_index = sub.add_parser("index", help="index a directory")
    p_index.add_argument("path", help="path to a source directory")

    p_query = sub.add_parser("query", help="ask the most recently indexed repo")
    p_query.add_argument("task", help="natural-language task description")

    args = parser.parse_args()
    if args.cmd == "index":
        cmd_index(args.path)
    elif args.cmd == "query":
        cmd_query(args.task)


if __name__ == "__main__":
    main()
