"""Idempotent migration runner for Cartographer.

Running this module as a script initialises the control DB and (optionally) a
per-repo index DB::

    python -m backend.db.migrations                # control DB only
    python -m backend.db.migrations <repo_hash>    # control + repo DB
"""

from __future__ import annotations

import sys

from backend.db.store import (
    control_db_path,
    init_control_db,
    init_repo_db,
    repo_db_path,
)


def run(repo_hash: str | None = None) -> None:
    init_control_db()
    print(f"control DB ready at {control_db_path()}")
    if repo_hash:
        init_repo_db(repo_hash)
        print(f"repo DB ready at {repo_db_path(repo_hash)}")


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else None)
