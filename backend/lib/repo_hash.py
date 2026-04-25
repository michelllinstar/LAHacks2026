"""Deterministic short hash for a repository identity."""

from __future__ import annotations

import hashlib
from typing import Optional


def hash_repo(git_url: Optional[str] = None, local_path: Optional[str] = None) -> str:
    """Return the first 12 hex chars of sha256(git_url|local_path)."""
    if not git_url and not local_path:
        raise ValueError("hash_repo requires at least one of git_url or local_path")
    key = f"{git_url or ''}|{local_path or ''}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
