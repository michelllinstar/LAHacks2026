"""Five-signal candidate ranker over Layer 1 data (MongoDB-backed).

Returns per-symbol signal values plus a combined weighted score. Coefficients
live in ``backend/query/weights.json`` and depend on ``task_type``.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from bson import ObjectId

from backend.db import store as db_store

_WEIGHTS_PATH = Path(__file__).resolve().parent / "weights.json"

_DEFAULT_WEIGHTS = {
    "modify existing": {
        "structural_centrality": 0.35,
        "change_recency": 0.10,
        "co_change_correlation": 0.10,
        "embedding_similarity": 0.35,
        "test_coverage_proxy": 0.10,
    },
}


def _load_weights() -> dict:
    try:
        return json.loads(_WEIGHTS_PATH.read_text())
    except Exception:
        return _DEFAULT_WEIGHTS


def _is_test_path(path: str) -> bool:
    name = path.replace("\\", "/")
    parts = name.split("/")
    if any(p in {"tests", "test"} for p in parts):
        return True
    base = parts[-1]
    return base.startswith("test_") or base.endswith("_test.py")


def _normalize(values: dict) -> dict:
    if not values:
        return {}
    lo = min(values.values())
    hi = max(values.values())
    if math.isclose(hi, lo):
        return {k: 0.0 for k in values}
    span = hi - lo
    return {k: (v - lo) / span for k, v in values.items()}


def _cosine(a: bytes, b: bytes) -> float:
    if not a or not b:
        return 0.0
    va = np.frombuffer(a, dtype="float32")
    vb = np.frombuffer(b, dtype="float32")
    if va.size == 0 or vb.size == 0 or va.size != vb.size:
        return 0.0
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------


def structural_centrality(repo_hash: str) -> dict[ObjectId, float]:
    """Approximate PageRank over ``refs``; falls back to out-degree if missing."""
    symbols = db_store.iter_symbols(repo_hash)
    if not symbols:
        return {}
    ids = [doc["_id"] for doc in symbols]
    edges = db_store.iter_refs(repo_hash)
    try:
        import networkx as nx  # type: ignore

        graph = nx.DiGraph()
        graph.add_nodes_from(ids)
        for e in edges:
            graph.add_edge(e["source_symbol_id"], e["target_symbol_id"])
        pr = nx.pagerank(graph, alpha=0.85)
        return {k: float(v) for k, v in pr.items()}
    except Exception:
        deg: dict = {sid: 0.0 for sid in ids}
        for e in edges:
            sid = e["source_symbol_id"]
            deg[sid] = deg.get(sid, 0.0) + 1.0
        return deg


def change_recency(repo_hash: str) -> dict[ObjectId, float]:
    now = datetime.now(timezone.utc).timestamp()
    by_path: dict[str, float] = {}
    for doc in db_store.iter_files(repo_hash):
        ts = doc.get("last_modified")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            by_path[doc["file_path"]] = dt.timestamp()
        except ValueError:
            continue
    if not by_path:
        return {}
    oldest = min(by_path.values())
    span = max(now - oldest, 1.0)
    out: dict = {}
    for sym in db_store.iter_symbols(repo_hash):
        ts = by_path.get(sym.get("file_path"))
        if ts is None:
            continue
        out[sym["_id"]] = 1.0 - ((now - ts) / span)
    return out


def co_change_correlation(_repo_hash: str) -> dict:
    """No git log mining in MVP; returns empty."""
    return {}


def embedding_similarity(
    repo_hash: str,
    candidate_ids: list[ObjectId],
    query_vector: Optional[bytes],
) -> dict[ObjectId, float]:
    if not query_vector or not candidate_ids:
        return {}
    out: dict = {}
    for doc in db_store.find_symbol_embeddings(repo_hash, candidate_ids):
        vec = doc.get("vector") or b""
        if not isinstance(vec, (bytes, bytearray)):
            vec = bytes(vec)
        out[doc["symbol_id"]] = _cosine(query_vector, bytes(vec))
    return out


def test_coverage_proxy(repo_hash: str) -> dict[ObjectId, float]:
    """Count refs whose source symbol lives in a test file."""
    sym_by_id = {doc["_id"]: doc for doc in db_store.iter_symbols(repo_hash)}
    counts: dict = {}
    for ref in db_store.iter_refs(repo_hash):
        src = sym_by_id.get(ref.get("source_symbol_id"))
        if not src or not _is_test_path(src.get("file_path") or ""):
            continue
        tid = ref.get("target_symbol_id")
        if tid is None:
            continue
        counts[tid] = counts.get(tid, 0.0) + 1.0
    return counts


# ---------------------------------------------------------------------------
# Combiner
# ---------------------------------------------------------------------------


def combine(
    repo_hash: str,
    candidate_ids: list[ObjectId],
    query_vector: Optional[bytes],
    task_type: str = "modify existing",
) -> dict[ObjectId, dict[str, float]]:
    """Return ``{symbol_id: {signal_name: value, ..., "score": combined}}``."""
    weights_table = _load_weights()
    weights = weights_table.get(task_type) or weights_table.get("modify existing", {})

    sc_raw = structural_centrality(repo_hash)
    cr_raw = change_recency(repo_hash)
    cc_raw = co_change_correlation(repo_hash)
    sim_raw = embedding_similarity(repo_hash, candidate_ids, query_vector)
    tc_raw = test_coverage_proxy(repo_hash)

    sc = _normalize(sc_raw)
    cr = _normalize(cr_raw)
    cc = _normalize(cc_raw)
    sim = sim_raw
    tc = _normalize(tc_raw)

    out: dict = {}
    for sid in candidate_ids:
        signals = {
            "structural_centrality": float(sc.get(sid, 0.0)),
            "change_recency": float(cr.get(sid, 0.0)),
            "co_change_correlation": float(cc.get(sid, 0.0)),
            "embedding_similarity": max(0.0, float(sim.get(sid, 0.0))),
            "test_coverage_proxy": float(tc.get(sid, 0.0)),
        }
        score = sum(signals[name] * weights.get(name, 0.0) for name in signals)
        signals["score"] = score
        out[sid] = signals
    return out
