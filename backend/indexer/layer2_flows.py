"""Layer 2 flow extraction — call-chain approximation.

Hackathon-tractable approximation of SPEC §4.2: skips parameter-level
tracking and instead derives data-flow edges from the Layer 1 call graph.
For each function, we walk the call graph from roots (functions with no
incoming call edges) up to ``max_depth`` and emit one ``call_chain`` flow
per distinct path.

Sensitivity classification scans qualified names along the path against a
small fixed regex set (``password``, ``token``, ``ssn``); first match wins.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict, deque
from typing import Callable, Optional

from bson import ObjectId

from backend.db import store as db_store

logger = logging.getLogger(__name__)

EmitFn = Callable[[str, dict], None]

_FUNCTION_KINDS = {"function", "method"}
_CALL_EDGE_KINDS = {"calls", "call"}

# Sensitivity tag → compiled pattern. Order matters — first match wins.
# `\b` word boundaries treat `_` as word-internal, which would miss the
# common snake_case forms (`check_password`, `get_token`, `validate_ssn`).
# We use case-insensitive substring matches for the unambiguous full words
# and lookarounds requiring non-letter neighbors only for short tokens
# (`pwd`, `ssn`) where substring matching would false-positive.
_SENSITIVITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "password",
        re.compile(
            r"password|passwd|(?<![a-zA-Z])pwd(?![a-zA-Z])",
            re.IGNORECASE,
        ),
    ),
    (
        "token",
        re.compile(
            r"token|api[_-]?key|secret|auth[_-]?token",
            re.IGNORECASE,
        ),
    ),
    (
        "ssn",
        re.compile(
            r"(?<![a-zA-Z])ssn(?![a-zA-Z])|social[_-]?security|tax[_-]?id",
            re.IGNORECASE,
        ),
    ),
]


def _classify_sensitivity(qnames: list[str]) -> Optional[str]:
    """Return first sensitivity tag whose regex matches any qname, else None."""
    for qname in qnames:
        for tag, pattern in _SENSITIVITY_PATTERNS:
            if pattern.search(qname):
                return tag
    return None


def build(
    repo_hash: str,
    *,
    max_depth: int = 3,
    max_flows: int = 2000,
    emit: Optional[EmitFn] = None,
) -> dict:
    """Build Layer 2 flows.

    Returns ``{'flows': N, 'sensitive': M, 'capped': bool}``.
    """
    logger.info(
        "layer 2: starting flow extraction repo=%s max_depth=%d max_flows=%d",
        repo_hash,
        max_depth,
        max_flows,
    )
    try:
        symbols = db_store.iter_symbols(repo_hash)
        refs = db_store.iter_refs(repo_hash)
    except Exception:
        logger.exception("layer 2: failed to load symbols/refs repo=%s", repo_hash)
        raise

    # Restrict to function/method symbols.
    func_ids: set[ObjectId] = set()
    id_to_qname: dict[ObjectId, str] = {}
    total_symbols = 0
    for sym in symbols:
        total_symbols += 1
        if sym.get("kind") in _FUNCTION_KINDS:
            sid = sym["_id"]
            func_ids.add(sid)
            id_to_qname[sid] = sym.get("qualified_name", "")

    logger.info(
        "layer 2: loaded symbols repo=%s total=%d functions=%d",
        repo_hash,
        total_symbols,
        len(func_ids),
    )

    if not func_ids:
        logger.info(
            "layer 2: no function/method symbols found; skipping flow build repo=%s",
            repo_hash,
        )
        return {"flows": 0, "sensitive": 0, "capped": False}

    # Adjacency list over function-only call edges.
    adjacency: dict[ObjectId, list[ObjectId]] = defaultdict(list)
    incoming: dict[ObjectId, int] = defaultdict(int)
    out_degree: dict[ObjectId, int] = defaultdict(int)

    edge_total = 0
    edge_resolved = 0
    edge_dropped_kind = 0
    edge_dropped_missing = 0
    edge_dropped_external = 0
    for ref in refs:
        edge_total += 1
        if ref.get("edge_kind") not in _CALL_EDGE_KINDS:
            edge_dropped_kind += 1
            continue
        src = ref.get("source_symbol_id")
        tgt = ref.get("target_symbol_id")
        if src is None or tgt is None:
            edge_dropped_missing += 1
            logger.debug(
                "layer 2: dropping ref with missing endpoint repo=%s src=%s tgt=%s",
                repo_hash,
                src,
                tgt,
            )
            continue
        if src not in func_ids or tgt not in func_ids:
            edge_dropped_external += 1
            logger.debug(
                "layer 2: dropping external/non-function ref repo=%s src_qname=%s tgt_qname=%s",
                repo_hash,
                id_to_qname.get(src, "<unknown>"),
                id_to_qname.get(tgt, "<unknown>"),
            )
            continue
        adjacency[src].append(tgt)
        incoming[tgt] += 1
        out_degree[src] += 1
        edge_resolved += 1

    logger.info(
        "layer 2: call-edge resolution repo=%s total=%d resolved=%d "
        "dropped_kind=%d dropped_missing=%d dropped_external=%d",
        repo_hash,
        edge_total,
        edge_resolved,
        edge_dropped_kind,
        edge_dropped_missing,
        edge_dropped_external,
    )
    if edge_dropped_external:
        logger.warning(
            "layer 2: %d call refs dropped as external/non-function repo=%s",
            edge_dropped_external,
            repo_hash,
        )
    if edge_dropped_missing:
        logger.warning(
            "layer 2: %d call refs dropped due to missing endpoints repo=%s",
            edge_dropped_missing,
            repo_hash,
        )

    # Identify roots: function nodes with no incoming call edges within the set.
    roots: list[ObjectId] = [fid for fid in func_ids if incoming.get(fid, 0) == 0]
    if not roots:
        # Fallback: cycle-only graph. Use functions with the most outgoing
        # edges as synthetic roots so we still produce flows.
        if out_degree:
            ordered = sorted(out_degree.items(), key=lambda kv: kv[1], reverse=True)
            roots = [fid for fid, deg in ordered if deg > 0]
            logger.warning(
                "layer 2: no clean call-graph roots (cycle) repo=%s; using %d high out-degree fallbacks",
                repo_hash,
                len(roots),
            )
        else:
            logger.info(
                "layer 2: no call edges among function symbols; skipping repo=%s",
                repo_hash,
            )
            return {"flows": 0, "sensitive": 0, "capped": False}
    else:
        logger.info(
            "layer 2: identified roots repo=%s roots=%d",
            repo_hash,
            len(roots),
        )

    # Collect distinct paths of 2..(max_depth+1) nodes (1..max_depth edges)
    # via BFS from each root, with cycle avoidance per traversal.
    collected: list[dict] = []
    seen_paths: set[tuple[ObjectId, ...]] = set()

    for root in roots:
        # Each queue entry is a path tuple.
        queue: deque[tuple[ObjectId, ...]] = deque()
        queue.append((root,))
        while queue:
            path = queue.popleft()
            current = path[-1]
            # Expand if depth allows.
            if len(path) <= max_depth:
                for nxt in adjacency.get(current, ()):
                    if nxt in path:
                        continue  # cycle guard
                    new_path = path + (nxt,)
                    if new_path in seen_paths:
                        continue
                    seen_paths.add(new_path)
                    # Record this as a flow (length >= 2 nodes => 1+ edges).
                    qnames = [id_to_qname.get(n, "") for n in new_path]
                    sensitivity = _classify_sensitivity(qnames)
                    intermediate = list(new_path[1:-1])  # exclusive of endpoints
                    collected.append(
                        {
                            "source_symbol_id": new_path[0],
                            "sink_symbol_id": new_path[-1],
                            "path": intermediate,
                            "flow_kind": "call_chain",
                            "sensitivity": sensitivity,
                            # Sort metadata kept off-row:
                            "_depth": len(new_path),
                            "_src_out": out_degree.get(new_path[0], 0),
                        }
                    )
                    queue.append(new_path)
                    logger.debug(
                        "layer 2: discovered flow repo=%s depth=%d src=%s sink=%s sensitivity=%s",
                        repo_hash,
                        len(new_path),
                        qnames[0],
                        qnames[-1],
                        sensitivity,
                    )

    logger.info(
        "layer 2: traversal complete repo=%s discovered_flows=%d unique_paths=%d",
        repo_hash,
        len(collected),
        len(seen_paths),
    )

    capped = False
    if len(collected) > max_flows:
        capped = True
        logger.warning(
            "layer 2: collected %d flows repo=%s, capping to %d (sensitivity-first, then deeper, then lower out-degree)",
            len(collected),
            repo_hash,
            max_flows,
        )
        # Sort: sensitive first, then deeper paths first, then lower source out-degree first.
        collected.sort(
            key=lambda f: (
                0 if f["sensitivity"] else 1,
                -f["_depth"],
                f["_src_out"],
            )
        )
        collected = collected[:max_flows]

    # Strip helper keys before insertion.
    rows: list[dict] = [
        {
            "source_symbol_id": f["source_symbol_id"],
            "sink_symbol_id": f["sink_symbol_id"],
            "path": f["path"],
            "flow_kind": f["flow_kind"],
            "sensitivity": f["sensitivity"],
        }
        for f in collected
    ]

    flow_ids: list[ObjectId] = []
    if rows:
        try:
            flow_ids = db_store.bulk_insert_flows(repo_hash, rows)
        except Exception:
            logger.exception(
                "layer 2: bulk_insert_flows failed repo=%s rows=%d",
                repo_hash,
                len(rows),
            )
            raise

    sensitive_count = sum(1 for f in collected if f["sensitivity"])
    logger.info(
        "layer 2: persisted flows repo=%s flows=%d sensitive=%d capped=%s",
        repo_hash,
        len(rows),
        sensitive_count,
        capped,
    )

    if emit is not None:
        for flow_id, row in zip(flow_ids, rows):
            sensitivity = row["sensitivity"]
            emit(
                "edge_added",
                {
                    "layer": "flow",
                    "edge": {
                        "id": str(flow_id),
                        "source": str(row["source_symbol_id"]),
                        "target": str(row["sink_symbol_id"]),
                        "kind": "flow_call_chain",
                        "weight": 1.0 + (1.0 if sensitivity else 0.0),
                        "metadata": {
                            "path": [str(p) for p in row["path"]],
                            "flow_kind": "call_chain",
                            "sensitivity": sensitivity,
                        },
                    },
                },
            )

    logger.info(
        "layer 2: done repo=%s flows=%d edges=%d sensitive=%d capped=%s",
        repo_hash,
        len(rows),
        edge_resolved,
        sensitive_count,
        capped,
    )

    return {
        "flows": len(rows),
        "sensitive": sensitive_count,
        "capped": capped,
    }
