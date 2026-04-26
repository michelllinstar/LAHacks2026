"""Indexing job endpoints."""


from __future__ import annotations


import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path


from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException


from backend.db import store as db_store
from backend.indexer.runner import LAYERS, run_index
from backend.lib import events as event_bus
from backend.lib.auth_guard import require_session
from backend.models import IndexJob, IndexStatus, LayerStatus
from backend.routes.repos import _safe_dir_name, _validate_local_path, _workspace_root


router = APIRouter(dependencies=[Depends(require_session)])




def _clone_repo(git_url: str, name: str) -> str:
   """Clone ``git_url`` into the workspace and return the local path.


   Uses ``--depth 1`` to avoid fetching full history. Raises HTTPException on
   clone failure or timeout so the caller gets a useful error response.
   """
   workspace = _workspace_root()
   safe_name = _safe_dir_name(name)
   repo_dir = (workspace / safe_name).resolve()
   try:
       repo_dir.relative_to(workspace)
   except ValueError:
       raise HTTPException(status_code=400, detail="invalid repo name")
   if repo_dir.exists():
       shutil.rmtree(repo_dir)
   try:
       subprocess.run(
           ["git", "clone", "--depth", "1", git_url, str(repo_dir)],
           check=True,
           capture_output=True,
           timeout=120,
       )
   except subprocess.CalledProcessError as exc:
       stderr = exc.stderr.decode(errors="replace")[:500] if exc.stderr else ""
       raise HTTPException(status_code=400, detail=f"git clone failed: {stderr}")
   except subprocess.TimeoutExpired:
       shutil.rmtree(repo_dir, ignore_errors=True)
       raise HTTPException(status_code=408, detail="git clone timed out (120s)")
   except FileNotFoundError:
       raise HTTPException(status_code=500, detail="git not found; install git on the server")
   return str(repo_dir)




@router.post("/{repo_hash}/index", response_model=IndexJob)
def start_index(repo_hash: str, background_tasks: BackgroundTasks) -> IndexJob:
   row = db_store.get_repo(repo_hash)
   if row is None:
       raise HTTPException(status_code=404, detail="repo not found")
   repo_path = row["local_path"]
   git_url = row.get("git_url")


   if not repo_path:
       if not git_url:
           raise HTTPException(
               status_code=400,
               detail="repo has no local_path; provide a local_path or git_url when registering",
           )
       # Clone into the workspace so the indexer has a local tree to walk.
       repo_path = _clone_repo(git_url, row["name"])
       db_store.upsert_repo(
           hash=repo_hash,
           name=row["name"],
           git_url=git_url,
           local_path=repo_path,
           status="pending",
       )


   # Re-validate the stored local_path against the workspace jail before
   # kicking off the background indexer (the env var may have changed since
   # the repo was first registered).
   _validate_local_path(repo_path)
   job_id = uuid.uuid4().hex
   started = datetime.now(timezone.utc).isoformat()
   for layer in LAYERS:
       db_store.upsert_index_job(
           job_id=f"{job_id}-{layer}",
           repo_hash=repo_hash,
           layer=layer,
           state="pending",
           count=0,
           started_at=started,
       )
   emit = event_bus.make_emitter(repo_hash)
   # SPEC §7.2.2 designates the Indexer uAgent as the sole writer to the index
   # store. Per §7.2.5 hackathon scope reduction, we run indexing as an
   # in-process FastAPI BackgroundTask instead — the same run_index() function
   # the Indexer agent would call. Switching to the agent path is a deployment
   # change, not a code rewrite.
   background_tasks.add_task(run_index, repo_hash, repo_path, emit, job_id)
   return IndexJob(job_id=job_id, repo_hash=repo_hash, status="started")




@router.get("/{repo_hash}/index", response_model=IndexStatus)
def get_index_status(repo_hash: str) -> IndexStatus:
   row = db_store.get_repo(repo_hash)
   if row is None:
       raise HTTPException(status_code=404, detail="repo not found")
   layers: dict[str, LayerStatus] = {
       layer: LayerStatus(state="pending", count=0) for layer in LAYERS
   }
   for job in db_store.jobs_for_repo(repo_hash):
       layers[job["layer"]] = LayerStatus(
           state=job["state"],
           count=int(job["count"] or 0),
           started_at=job["started_at"],
           ended_at=job["ended_at"],
       )
   return IndexStatus(repo_hash=repo_hash, layers=layers)
