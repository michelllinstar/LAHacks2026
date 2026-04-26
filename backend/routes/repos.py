"""Repository registration endpoints."""

from __future__ import annotations

import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.db import store as db_store
from backend.lib.auth_guard import require_session
from backend.lib.repo_hash import hash_repo
from backend.models import RepoCreate, RepoSummary

# Cap upload size and count so a misclick on node_modules doesn't OOM the
# server. ~10k files / 50MB total is plenty for hackathon-scale repos.
_MAX_UPLOAD_FILES = 10_000
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

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
        symbol_count=db_store.count_symbols(row["hash"]),
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


@router.delete("/{repo_hash}", status_code=204)
def delete_repo(repo_hash: str) -> None:
    """Wipe a repo's index store — all four layers, jobs, registration row.

    Returns 404 if the repo isn't registered. On-disk uploaded files under
    ``CARTOGRAPHER_WORKSPACE_ROOT`` are *not* removed; the user's source
    tree is the user's to manage. This only clears Cartographer's index.
    """
    if db_store.get_repo(repo_hash) is None:
        raise HTTPException(status_code=404, detail="repo not found")
    db_store.delete_repo(repo_hash)
    return None


def _safe_dir_name(raw: str) -> str:
    """Sanitize a project name for use as a directory under the workspace root.

    Allow alphanumerics, dot, underscore, hyphen — replace anything else with
    a hyphen. Reject empty results so we never materialize files at the
    workspace root itself.
    """
    cleaned = _SAFE_NAME_RE.sub("-", raw).strip(".-_")
    if not cleaned:
        raise HTTPException(status_code=400, detail="invalid project name")
    return cleaned


@router.post("/upload", response_model=RepoSummary)
async def upload_repo(
    name: str = Form(...),
    files: list[UploadFile] = File(...),
) -> RepoSummary:
    """Materialize an uploaded folder under the workspace root and register it.

    The browser's folder picker (``<input webkitdirectory>``) cannot expose the
    user's absolute filesystem path, so the frontend uploads the picked folder's
    contents as multipart/form-data. Each ``UploadFile.filename`` is the
    ``webkitRelativePath`` (``<picked-folder>/<sub>/<file>``). We strip the
    leading folder segment (redundant with ``name``) and write each file under
    ``<workspace>/<safe_name>/<rel>``. The caller then triggers indexing via
    ``POST /api/repos/{hash}/index`` like any local repo.
    """
    if not files:
        raise HTTPException(status_code=400, detail="no files uploaded")
    if len(files) > _MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"too many files (max {_MAX_UPLOAD_FILES})",
        )

    safe_name = _safe_dir_name(name)
    workspace = _workspace_root()
    repo_dir = (workspace / safe_name).resolve()
    # Belt-and-braces: ensure the resolved directory still sits inside the jail
    # even if a normalized name re-introduced a separator somehow.
    try:
        repo_dir.relative_to(workspace)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid project name")

    # Wipe any prior contents so re-uploading the same name is idempotent.
    if repo_dir.exists():
        shutil.rmtree(repo_dir)
    repo_dir.mkdir(parents=True)

    total_bytes = 0
    written = 0
    for upload in files:
        rel_raw = (upload.filename or "").replace("\\", "/")
        if not rel_raw:
            continue
        # Drop the leading picked-folder segment if the browser included it.
        parts = rel_raw.split("/", 1)
        rel = parts[1] if len(parts) == 2 and parts[1] else parts[0]
        if not rel or rel.startswith("/"):
            continue
        target = (repo_dir / rel).resolve()
        try:
            target.relative_to(repo_dir)
        except ValueError:
            # Somebody embedded ".." — refuse to write outside the repo dir.
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as out:
            while chunk := await upload.read(1 << 20):  # 1 MiB chunks
                total_bytes += len(chunk)
                if total_bytes > _MAX_UPLOAD_BYTES:
                    shutil.rmtree(repo_dir, ignore_errors=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"upload exceeds {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
                    )
                out.write(chunk)
        await upload.close()
        written += 1

    if written == 0:
        shutil.rmtree(repo_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="no usable files in upload")

    repo_hash = hash_repo(local_path=str(repo_dir))
    db_store.upsert_repo(
        hash=repo_hash,
        name=safe_name,
        local_path=str(repo_dir),
        status="pending",
    )
    db_store.init_repo_db(repo_hash)
    row = db_store.get_repo(repo_hash)
    if row is None:
        raise HTTPException(status_code=500, detail="failed to register repo")
    return _row_to_summary(row)
