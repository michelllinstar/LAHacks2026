"""Indexing job endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException

from backend.db import store as db_store
from backend.indexer.runner import LAYERS, run_index
from backend.lib import events as event_bus
from backend.models import IndexJob, IndexStatus, LayerStatus

router = APIRouter()


@router.post("/{repo_hash}/index", response_model=IndexJob)
def start_index(repo_hash: str, background_tasks: BackgroundTasks) -> IndexJob:
    row = db_store.get_repo(repo_hash)
    if row is None:
        raise HTTPException(status_code=404, detail="repo not found")
    repo_path = row["local_path"]
    if not repo_path:
        raise HTTPException(
            status_code=400,
            detail="repo has no local_path; clone the repo and re-register with local_path",
        )
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
