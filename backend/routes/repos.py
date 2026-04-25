"""Repository registration endpoints."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from backend.db import store as db_store
from backend.lib.auth_guard import require_session
from backend.lib.repo_hash import hash_repo
from backend.models import RepoCreate, RepoSummary

router = APIRouter(dependencies=[Depends(require_session)])


def _workspace_root() -> Path:
    """Return the configured Cartographer workspace root (created if missing)."""
    root = os.getenv("CARTOGRAPHER_WORKSPACE_ROOT")
    if root:
        path = Path(root).expanduser().resolve()
    else:
        path = (Path.home() / ".cartographer" / "repos").resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _validate_local_path(local_path: str) -> None:
    """Reject local_path values that escape the workspace root or are symlinks."""
    original = Path(local_path).expanduser()
    if original.is_symlink():
        raise HTTPException(status_code=400, detail="local_path is a symlink")
    resolved = original.resolve()
    root = _workspace_root()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="local_path outside CARTOGRAPHER_WORKSPACE_ROOT",
        )


def _row_to_summary(row) -> RepoSummary:
    return RepoSummary(
        hash=row["hash"],
        name=row["name"],
        status=row["status"],
        git_url=row["git_url"],
        local_path=row["local_path"],
    )


@router.post("", response_model=RepoSummary)
def create_repo(payload: RepoCreate) -> RepoSummary:
    if not payload.git_url and not payload.local_path:
        raise HTTPException(status_code=400, detail="git_url or local_path required")
    if payload.local_path:
        _validate_local_path(payload.local_path)
    repo_hash = hash_repo(git_url=payload.git_url, local_path=payload.local_path)
    name = payload.name
    if not name:
        if payload.git_url:
            name = payload.git_url.rstrip("/").split("/")[-1].removesuffix(".git")
        elif payload.local_path:
            name = Path(payload.local_path).expanduser().name or repo_hash
        else:
            name = repo_hash
    db_store.upsert_repo(
        hash=repo_hash,
        name=name,
        git_url=payload.git_url,
        local_path=payload.local_path,
        status="pending",
    )
    db_store.init_repo_db(repo_hash)
    row = db_store.get_repo(repo_hash)
    if row is None:
        raise HTTPException(status_code=500, detail="failed to register repo")
    return _row_to_summary(row)


@router.get("", response_model=List[RepoSummary])
def list_repos() -> list[RepoSummary]:
    return [_row_to_summary(r) for r in db_store.list_repos()]


@router.get("/{repo_hash}", response_model=RepoSummary)
def get_repo(repo_hash: str) -> RepoSummary:
    row = db_store.get_repo(repo_hash)
    if row is None:
        raise HTTPException(status_code=404, detail="repo not found")
    return _row_to_summary(row)
