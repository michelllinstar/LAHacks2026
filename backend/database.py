"""Backwards-compatible shim around :mod:`backend.db.store`.

The original scaffold exposed a single ``cartographer.db`` SQLite file at the
repo root. Cartographer now uses a control DB plus per-repo index DBs under
``~/.cartographer/``. This module re-exports the new helpers under the legacy
names other modules import.
"""

from __future__ import annotations

import os
from pathlib import Path

from backend.db.store import (
    get_control_db,
    get_repo_db,
    init_control_db,
    init_repo_db,
)

__all__ = [
    "get_control_db",
    "get_repo_db",
    "init_control_db",
    "init_repo_db",
]


# Drop the legacy repo-root SQLite file if it survived the migration.
_LEGACY_DB = Path(__file__).resolve().parent.parent / "cartographer.db"
try:
    if _LEGACY_DB.exists():
        os.remove(_LEGACY_DB)
except OSError:
    pass


# Ensure the control DB exists as soon as the backend is imported.
init_control_db()
