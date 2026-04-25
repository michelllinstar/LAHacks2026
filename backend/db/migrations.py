"""Idempotent MongoDB index bootstrap for Cartographer.

Running this module creates (or refreshes) the indexes used by the four-layer
index plus the control plane::

    python -m backend.db.migrations
"""

from __future__ import annotations

import sys

from backend.db.store import _db_name, _mongo_uri, init_control_db, init_repo_db


def run(_repo_hash: str | None = None) -> None:
    init_control_db()
    init_repo_db("_bootstrap")  # collections are shared; arg is unused now
    print(f"MongoDB ready at {_mongo_uri()} (db={_db_name()})")


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else None)
