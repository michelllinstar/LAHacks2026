"""Backwards-compatible shim around :mod:`backend.db.store`.

Cartographer now stores everything in MongoDB. This module re-exports the
common helpers so legacy imports keep working.
"""

from __future__ import annotations

from backend.db.store import (
    get_control_db,
    get_db,
    get_repo_db,
    init_control_db,
    init_repo_db,
)

__all__ = [
    "get_control_db",
    "get_db",
    "get_repo_db",
    "init_control_db",
    "init_repo_db",
]
