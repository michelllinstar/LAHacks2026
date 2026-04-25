"""Five-signal candidate ranker over Layer 1 data.

Returns per-symbol signal values plus a combined weighted score. Coefficients
live in ``backend/query/weights.json`` and depend on ``task_type``.
"""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np

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


def _normalize(values: dict[int, float]) -> dict[int, float]:
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


def structural_centrality(conn: sqlite3.Connection) -> dict[int, float]:
    """Approximate PageRank over ``refs``; falls back to out-degree if missing."""
    rows = list(conn.execute("SELECT id FROM symbols"))
    if not rows:
        return {}
    ids = [int(r["id"]) for r in rows]
    edges = list(conn.execute("SELECT source_symbol_id, target_symbol_id FROM refs"))
    try:
        import networkx as nx  # type: ignore

        graph = nx.DiGraph()
        graph.add_nodes_from(ids)
        for e in edges:
            graph.add_edge(int(e["source_symbol_id"]), int(e["target_symbol_id"]))
        pr = nx.pagerank(graph, alpha=0.85)
        return {int(k): float(v) for k, v in pr.items()}
    except Exception:
        # Fallback: out-degree.
        deg: dict[int, float] = {sid: 0.0 for sid in ids}
        for e in edges:
            sid = int(e["source_symbol_id"])
            deg[sid] = deg.get(sid, 0.0) + 1.0
        return deg


def change_recency(conn: sqlite3.Connection) -> dict[int, float]:
    """Per-symbol recency signal derived from ``files.last_modified``."""
    now = datetime.now(timezone.utc).timestamp()
    by_path: dict[str, float] = {}
    for row in conn.execute("SELECT file_path, last_modified FROM files"):
        ts = row["last_modified"]
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            by_path[row["file_path"]] = dt.timestamp()
        except ValueError:
            continue
    if not by_path:
        return {}
    oldest = min(by_path.values())
    span = max(now - oldest, 1.0)
    out: dict[int, float] = {}
    for row in conn.execute("SELECT id, file_path FROM symbols"):
        ts = by_path.get(row["file_path"])
        if ts is None:
            continue
        # Recency: 1.0 = brand new, 0.0 = repo-oldest file.
        out[int(row["id"])] = 1.0 - ((now - ts) / span)
    return out


def co_change_correlation(_conn: sqlite3.Connection) -> dict[int, float]:
    """No git log mining in MVP; returns empty."""
    return {}


def embedding_similarity(
    conn: sqlite3.Connection, query_vector: Optional[bytes]
) -> dict[int, float]:
    if not query_vector:
        return {}
    out: dict[int, float] = {}
    for row in conn.execute("SELECT symbol_id, vector FROM symbol_embeddings"):
        out[int(row["symbol_id"])] = _cosine(query_vector, bytes(row["vector"] or b""))
    return out


def test_coverage_proxy(conn: sqlite3.Connection) -> dict[int, float]:
    """Count refs whose source symbol lives in a test file."""
    counts: dict[int, float] = {}
    rows = conn.execute(
        """
        SELECT r.target_symbol_id AS target_id, s.file_path AS src_path
        FROM refs r
        JOIN symbols s ON s.id = r.source_symbol_id
        """
    )
    for row in rows:
        if not _is_test_path(row["src_path"] or ""):
            continue
        tid = int(row["target_id"])
        counts[tid] = counts.get(tid, 0.0) + 1.0
    return counts


# ---------------------------------------------------------------------------
# Combiner
# ---------------------------------------------------------------------------


def combine(
    conn: sqlite3.Connection,
    candidate_ids: list[int],
    query_vector: Optional[bytes],
    task_type: str = "modify existing",
) -> dict[int, dict[str, float]]:
    """Return ``{symbol_id: {signal_name: value, ..., "score": combined}}``.

    Only ``candidate_ids`` get a row in the output, but signals are computed
    over the whole index where that is cheaper than per-candidate queries.
    """
    weights_table = _load_weights()
    weights = weights_table.get(task_type) or weights_table.get("modify existing", {})

    sc_raw = structural_centrality(conn)
    cr_raw = change_recency(conn)
    cc_raw = co_change_correlation(conn)
    sim_raw = embedding_similarity(conn, query_vector)
    tc_raw = test_coverage_proxy(conn)

    sc = _normalize(sc_raw)
    cr = _normalize(cr_raw)
    cc = _normalize(cc_raw)
    sim = sim_raw  # already in [-1, 1]; clamp below
    tc = _normalize(tc_raw)

    out: dict[int, dict[str, float]] = {}
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
