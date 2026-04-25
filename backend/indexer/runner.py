"""Indexer orchestrator — runs Layer 1 and emits SSE progress events.

Layers 2/3/4 are invoked as no-op stubs and reported as ``done`` with
``count=0`` so the frontend's status panel reflects the four-layer pipeline.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from bson import ObjectId

from backend.db import store as db_store
from backend.lib import events as event_bus

from . import embeddings, layer1_symbols, layer2_flows, layer3_clusters, layer4_invariants
from .treesitter_loader import get_python_parser
from .walker import walk_repo

logger = logging.getLogger(__name__)

EmitFn = Callable[[str, dict], None]

LAYERS = ("symbol", "flow", "architecture", "invariant")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_emit(repo_hash: str) -> EmitFn:
    return event_bus.make_emitter(repo_hash)


def run_index(
    repo_hash: str,
    repo_path: str,
    emit: Optional[EmitFn] = None,
    job_id: Optional[str] = None,
) -> None:
    """Run all four layers (Layer 1 actual; 2/3/4 stubs) for a repo."""
    emit = emit or _default_emit(repo_hash)
    job_id = job_id or uuid.uuid4().hex

    db_store.init_repo_db(repo_hash)
    db_store.set_repo_status(repo_hash, "indexing")

    _run_layer1(repo_hash, repo_path, emit, job_id)
    _run_layer2(repo_hash, emit, job_id)
    _run_layer3(repo_hash, emit, job_id)
    _run_layer4(repo_hash, repo_path, emit, job_id)

    db_store.set_repo_status(repo_hash, "ready")


# ---------------------------------------------------------------------------
# Layer 1 implementation
# ---------------------------------------------------------------------------


def _run_layer1(repo_hash: str, repo_path: str, emit: EmitFn, job_id: str) -> None:
    layer = "symbol"
    started = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="running",
        count=0,
        started_at=started,
    )
    emit("index_progress", {"layer": layer, "state": "running", "count": 0})

    parser = get_python_parser()
    if parser is None:
        logger.warning("tree-sitter parser unavailable; skipping Layer 1 indexing")
        ended = _now_iso()
        db_store.upsert_index_job(
            job_id=f"{job_id}-{layer}",
            repo_hash=repo_hash,
            layer=layer,
            state="done",
            count=0,
            started_at=started,
            ended_at=ended,
        )
        emit("index_progress", {"layer": layer, "state": "done", "count": 0})
        return

    repo_root = str(Path(repo_path).resolve())
    all_symbols: list[layer1_symbols.SymbolRow] = []
    all_refs: list[layer1_symbols.RefRow] = []
    files_seen: list[tuple[str, Optional[str]]] = []

    for path in walk_repo(repo_root):
        try:
            source_bytes = path.read_bytes()
        except OSError as exc:
            logger.warning("could not read %s: %s", path, exc)
            continue
        try:
            tree = parser.parse(source_bytes)
        except Exception as exc:  # pragma: no cover
            logger.warning("parse failure for %s: %s", path, exc)
            continue
        module_qname = layer1_symbols.module_qname_for(repo_root, str(path))
        symbols, refs = layer1_symbols.extract_symbols(
            file_path=str(path),
            source_bytes=source_bytes,
            tree=tree,
            module_qname=module_qname,
        )
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            mtime = None
        files_seen.append((str(path), mtime))
        all_symbols.extend(symbols)
        all_refs.extend(refs)

    inserted_count = 0

    for file_path, mtime in files_seen:
        db_store.upsert_file(repo_hash, file_path=file_path, last_modified=mtime)

    qname_to_id: dict[str, ObjectId] = {}
    embed_blobs = embeddings.embed_symbols(all_symbols)
    for row, blob in zip(all_symbols, embed_blobs):
        sid = db_store.insert_symbol(
            repo_hash,
            qualified_name=row.qualified_name,
            file_path=row.file_path,
            line_start=row.line_start,
            line_end=row.line_end,
            kind=row.kind,
            signature=row.signature,
        )
        if not sid:
            continue
        qname_to_id[row.qualified_name] = sid
        if blob:
            db_store.upsert_symbol_embedding(repo_hash, sid, blob)
        inserted_count += 1
        emit(
            "node_added",
            {
                "layer": layer,
                "node": {
                    "id": str(sid),
                    "kind": "symbol",
                    "label": row.qualified_name,
                    "layer": 1,
                    "metadata": {
                        "file_path": row.file_path,
                        "line_start": row.line_start,
                        "line_end": row.line_end,
                        "signature": row.signature,
                        "symbol_kind": row.kind,
                    },
                },
            },
        )

    # Resolve refs in a second pass. Refs whose source or target qname was
    # not extracted as a Layer 1 symbol — typically calls into external
    # modules (stdlib, third-party packages) — are dropped. SPEC §4.1
    # documents this as best-effort static resolution; the warning below
    # surfaces the loss rate so a noisy demo repo is diagnosable.
    dropped_external = 0
    for ref in all_refs:
        src_id = qname_to_id.get(ref.source_qname)
        tgt_id = qname_to_id.get(ref.target_qname)
        if not src_id or not tgt_id:
            dropped_external += 1
            continue
        edge_id = db_store.insert_ref(repo_hash, src_id, tgt_id, ref.edge_kind)
        emit(
            "edge_added",
            {
                "layer": layer,
                "edge": {
                    "source": str(src_id),
                    "target": str(tgt_id),
                    "kind": ref.edge_kind,
                    "weight": 1.0,
                    "id": str(edge_id),
                },
            },
        )

    if dropped_external:
        total_refs = len(all_refs)
        logger.warning(
            "layer 1 dropped %d/%d refs (%.1f%%) targeting unresolved qnames "
            "(typically external modules); see SPEC §4.1",
            dropped_external,
            total_refs,
            100.0 * dropped_external / max(total_refs, 1),
        )

    ended = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="done",
        count=inserted_count,
        started_at=started,
        ended_at=ended,
    )
    emit("index_progress", {"layer": layer, "state": "done", "count": inserted_count})


def _run_layer2(repo_hash: str, emit: EmitFn, job_id: str) -> None:
    """Run Layer 2 (call-chain flow construction) and emit progress events."""
    layer = "flow"
    started = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="running",
        count=0,
        started_at=started,
    )
    emit("index_progress", {"layer": layer, "state": "running", "count": 0})

    try:
        stats = layer2_flows.build(repo_hash=repo_hash, emit=emit)
    except Exception as exc:
        logger.exception("layer 2 build failed: %s", exc)
        ended = _now_iso()
        db_store.upsert_index_job(
            job_id=f"{job_id}-{layer}",
            repo_hash=repo_hash,
            layer=layer,
            state="error",
            count=0,
            started_at=started,
            ended_at=ended,
        )
        emit(
            "index_progress",
            {"layer": layer, "state": "error", "count": 0, "error": str(exc)},
        )
        return

    count = int(stats.get("flows", 0))
    ended = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="done",
        count=count,
        started_at=started,
        ended_at=ended,
    )
    emit("index_progress", {"layer": layer, "state": "done", "count": count})


def _run_layer3(repo_hash: str, emit: EmitFn, job_id: str) -> None:
    """Run Layer 3 (architectural pattern clustering) and emit progress events."""
    layer = "architecture"
    started = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="running",
        count=0,
        started_at=started,
    )
    emit("index_progress", {"layer": layer, "state": "running", "count": 0})

    try:
        stats = layer3_clusters.build(repo_hash=repo_hash, emit=emit)
    except Exception as exc:
        logger.exception("layer 3 build failed: %s", exc)
        ended = _now_iso()
        db_store.upsert_index_job(
            job_id=f"{job_id}-{layer}",
            repo_hash=repo_hash,
            layer=layer,
            state="error",
            count=0,
            started_at=started,
            ended_at=ended,
        )
        emit(
            "index_progress",
            {"layer": layer, "state": "error", "count": 0, "error": str(exc)},
        )
        return

    count = int(stats.get("clusters", 0))
    ended = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="done",
        count=count,
        started_at=started,
        ended_at=ended,
    )
    emit("index_progress", {"layer": layer, "state": "done", "count": count})


def _run_layer4(repo_hash: str, repo_path: str, emit: EmitFn, job_id: str) -> None:
    """Run Layer 4 (implicit-constraint mining) and emit progress events."""
    layer = "invariant"
    started = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="running",
        count=0,
        started_at=started,
    )
    emit("index_progress", {"layer": layer, "state": "running", "count": 0})

    try:
        stats = layer4_invariants.build(
            repo_hash=repo_hash,
            repo_path=repo_path,
            emit=emit,
        )
    except Exception as exc:
        logger.exception("layer 4 build failed: %s", exc)
        ended = _now_iso()
        db_store.upsert_index_job(
            job_id=f"{job_id}-{layer}",
            repo_hash=repo_hash,
            layer=layer,
            state="error",
            count=0,
            started_at=started,
            ended_at=ended,
        )
        emit(
            "index_progress",
            {"layer": layer, "state": "error", "count": 0, "error": str(exc)},
        )
        return

    count = int(stats.get("invariants", 0))
    ended = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="done",
        count=count,
        started_at=started,
        ended_at=ended,
    )
    emit("index_progress", {"layer": layer, "state": "done", "count": count})


def _run_stub_layer(
    repo_hash: str,
    layer: str,
    emit: EmitFn,
    job_id: str,
    builder,
) -> None:
    started = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="running",
        count=0,
        started_at=started,
    )
    emit("index_progress", {"layer": layer, "state": "running", "count": 0})
    try:
        builder(repo_hash=repo_hash)
    except Exception as exc:
        logger.exception("layer %s stub builder failed: %s", layer, exc)
        ended = _now_iso()
        db_store.upsert_index_job(
            job_id=f"{job_id}-{layer}",
            repo_hash=repo_hash,
            layer=layer,
            state="error",
            count=0,
            started_at=started,
            ended_at=ended,
        )
        emit(
            "index_progress",
            {"layer": layer, "state": "error", "count": 0, "error": str(exc)},
        )
        return
    # Tiny pause keeps the SSE stream perceptibly stepwise during the demo.
    time.sleep(0.01)
    ended = _now_iso()
    db_store.upsert_index_job(
        job_id=f"{job_id}-{layer}",
        repo_hash=repo_hash,
        layer=layer,
        state="done",
        count=0,
        started_at=started,
        ended_at=ended,
    )
    emit("index_progress", {"layer": layer, "state": "done", "count": 0})
