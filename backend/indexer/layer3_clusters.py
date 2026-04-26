"""Layer 3 architectural-pattern builder.

Builds clusters of files using a four-signal pairwise distance
(directory, naming, imports, structural), agglomerative hierarchical
clustering with a hardcoded threshold, an LLM-or-heuristic role
annotation pass per cluster, and inter-cluster ``allowed`` dependency
edges inferred from observed imports. SPEC §4.3.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from collections import Counter
from typing import Any, Callable, Optional

from bson import ObjectId

from backend.db import store as db_store
from backend.lib import llm as llm_lib

logger = logging.getLogger(__name__)


D_THRESHOLD = 0.55
LARGE_REPO_FILE_LIMIT = 500
DIST_W_DIR = 0.4
DIST_W_NAME = 0.2
DIST_W_IMP = 0.25
DIST_W_STRUCT = 0.15

EmitFn = Callable[[str, dict], None]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def build(repo_hash: str, *, emit: Optional[EmitFn] = None) -> dict:
    """Build Layer 3 for ``repo_hash``.

    Returns ``{'clusters': N, 'dependencies': M, 'annotated': K}`` where
    ``K`` is the count of clusters whose role was returned from a real
    LLM call (the rest used the heuristic fallback).
    """
    files = list(db_store.iter_files(repo_hash))
    if not files:
        return {"clusters": 0, "dependencies": 0, "annotated": 0}

    symbols = list(db_store.iter_symbols(repo_hash))
    refs = list(db_store.iter_refs(repo_hash))

    file_paths = sorted({f["file_path"] for f in files})
    symbols_by_file: dict[str, list[dict]] = {}
    for sym in symbols:
        symbols_by_file.setdefault(sym.get("file_path", ""), []).append(sym)

    sym_id_to_file: dict[Any, str] = {s["_id"]: s.get("file_path", "") for s in symbols}
    imports_by_file: dict[str, set[str]] = {fp: set() for fp in file_paths}
    incoming_refs_by_file: dict[str, int] = {fp: 0 for fp in file_paths}

    # Layer 1 currently emits only "calls" and "inherits" — there are no
    # "imports" edges to mine directly. Treat any cross-file edge as
    # evidence of a module-level dependency between the two files. This is
    # what the import-distance signal ultimately models: file A using any
    # symbol defined in file B implies an import path (direct or indirect).
    _IMPORT_PROXY_KINDS = {"imports", "calls", "inherits"}
    for ref in refs:
        src_file = sym_id_to_file.get(ref.get("source_symbol_id"))
        tgt_file = sym_id_to_file.get(ref.get("target_symbol_id"))
        if not src_file or not tgt_file:
            continue
        if src_file != tgt_file:
            if ref.get("edge_kind") in _IMPORT_PROXY_KINDS:
                imports_by_file.setdefault(src_file, set()).add(tgt_file)
            incoming_refs_by_file[tgt_file] = incoming_refs_by_file.get(tgt_file, 0) + 1

    # ------------------------------------------------------------------
    # Cluster
    # ------------------------------------------------------------------
    if len(file_paths) >= 2 and len(file_paths) <= LARGE_REPO_FILE_LIMIT:
        clusters = _agglomerative_cluster(
            file_paths,
            symbols_by_file=symbols_by_file,
            imports_by_file=imports_by_file,
        )
    elif len(file_paths) > LARGE_REPO_FILE_LIMIT:
        logger.warning(
            "layer 3 degraded: %d files exceed %d, falling back to per-directory clustering",
            len(file_paths),
            LARGE_REPO_FILE_LIMIT,
        )
        clusters = _directory_cluster(file_paths)
    else:
        # Singleton — every file is its own cluster (here only one file).
        clusters = [list(file_paths)]

    # ------------------------------------------------------------------
    # Annotate + persist
    # ------------------------------------------------------------------
    db_store.reset_clusters(repo_hash)

    cluster_rows: list[dict] = []
    annotation_sources: list[str] = []
    for member_files in clusters:
        annotation, source = _annotate_cluster(
            member_files,
            symbols_by_file=symbols_by_file,
            incoming_refs_by_file=incoming_refs_by_file,
        )
        cluster_rows.append(annotation)
        annotation_sources.append(source)

    if not cluster_rows:
        return {"clusters": 0, "dependencies": 0, "annotated": 0}

    cluster_ids = db_store.bulk_insert_clusters(repo_hash, cluster_rows)

    assignments: list[tuple[str, Optional[ObjectId]]] = []
    file_to_cluster_idx: dict[str, int] = {}
    for idx, member_files in enumerate(clusters):
        for fp in member_files:
            file_to_cluster_idx[fp] = idx
            assignments.append((fp, cluster_ids[idx]))
    db_store.bulk_update_file_clusters(repo_hash, assignments)

    # ------------------------------------------------------------------
    # Emit cluster nodes
    # ------------------------------------------------------------------
    if emit is not None:
        for idx, cid in enumerate(cluster_ids):
            row = cluster_rows[idx]
            emit(
                "node_added",
                {
                    "layer": "architecture",
                    "node": {
                        "id": str(cid),
                        "kind": "cluster",
                        "label": row["role_description"],
                        "layer": 3,
                        "metadata": {
                            "member_count": len(clusters[idx]),
                            "naming_convention": row.get("naming_convention"),
                            "code_shape": row.get("code_shape"),
                            "annotation_source": annotation_sources[idx],
                        },
                    },
                },
            )

    # ------------------------------------------------------------------
    # Inter-cluster dependencies
    # ------------------------------------------------------------------
    seen_pairs: set[tuple[int, int]] = set()
    dependency_count = 0
    for src_file, targets in imports_by_file.items():
        src_idx = file_to_cluster_idx.get(src_file)
        if src_idx is None:
            continue
        for tgt_file in targets:
            tgt_idx = file_to_cluster_idx.get(tgt_file)
            if tgt_idx is None or tgt_idx == src_idx:
                continue
            pair = (src_idx, tgt_idx)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            src_cid = cluster_ids[src_idx]
            tgt_cid = cluster_ids[tgt_idx]
            db_store.insert_cluster_dependency(repo_hash, src_cid, tgt_cid, "allowed")
            dependency_count += 1
            if emit is not None:
                emit(
                    "edge_added",
                    {
                        "layer": "architecture",
                        "edge": {
                            "source": str(src_cid),
                            "target": str(tgt_cid),
                            "kind": "allows",
                            "weight": 1.0,
                        },
                    },
                )

    annotated_count = sum(1 for s in annotation_sources if s == "llm")
    return {
        "clusters": len(cluster_ids),
        "dependencies": dependency_count,
        "annotated": annotated_count,
    }


# ---------------------------------------------------------------------------
# Distance signals
# ---------------------------------------------------------------------------


def _split_path(path: str) -> list[str]:
    return [p for p in re.split(r"[\\/]", path) if p]


def _dir_distance(a: str, b: str, max_depth: int) -> float:
    if max_depth <= 0:
        return 0.0
    parts_a = _split_path(a)[:-1]  # drop filename
    parts_b = _split_path(b)[:-1]
    shared = 0
    for x, y in zip(parts_a, parts_b):
        if x == y:
            shared += 1
        else:
            break
    return 1.0 - (shared / max_depth)


_NAME_TOKEN_RE = re.compile(r"[_\-\.]")
# Split CamelCase / PascalCase boundaries: lowercase→uppercase and
# acronym→Word (e.g. `HTTPServer` → `HTTP|Server`). Applied after the
# punctuation split so `UserService.ts` → ["User", "Service"].
_CAMEL_BOUNDARIES = [
    re.compile(r"(?<=[a-z0-9])(?=[A-Z])"),
    re.compile(r"(?<=[A-Z])(?=[A-Z][a-z])"),
]


def _split_camel(token: str) -> list[str]:
    pieces = [token]
    for boundary in _CAMEL_BOUNDARIES:
        pieces = [sub for piece in pieces for sub in boundary.split(piece) if sub]
    return pieces


def _name_tokens(path: str) -> set[str]:
    parts = _split_path(path)
    if not parts:
        return set()
    base = parts[-1]
    # strip extension
    stem = base.rsplit(".", 1)[0] if "." in base else base
    raw = [p for p in _NAME_TOKEN_RE.split(stem) if p]
    pieces = [sub for token in raw for sub in _split_camel(token)]
    return {p.lower() for p in pieces}


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 1.0
    return len(a & b) / len(union)


def _name_distance(a: str, b: str) -> float:
    ta = _name_tokens(a)
    tb = _name_tokens(b)
    if not ta or not tb:
        return 1.0
    return 1.0 - _jaccard(ta, tb)


def _import_distance(a: str, b: str, imports_by_file: dict[str, set[str]]) -> float:
    ia = imports_by_file.get(a, set())
    ib = imports_by_file.get(b, set())
    if not ia or not ib:
        return 1.0
    return 1.0 - _jaccard(ia, ib)


_KIND_BUCKETS = ("function", "class", "method", "variable", "import")


def _kind_histogram(file_path: str, symbols_by_file: dict[str, list[dict]]) -> list[float]:
    syms = symbols_by_file.get(file_path) or []
    counts = [0] * len(_KIND_BUCKETS)
    for sym in syms:
        kind = sym.get("kind") or ""
        if kind in _KIND_BUCKETS:
            counts[_KIND_BUCKETS.index(kind)] += 1
    total = float(sum(counts))
    if total <= 0.0:
        return []
    return [c / total for c in counts]


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a))
    db = math.sqrt(sum(y * y for y in b))
    if da <= 0.0 or db <= 0.0:
        return 0.0
    return num / (da * db)


def _struct_distance(a: str, b: str, symbols_by_file: dict[str, list[dict]]) -> float:
    ha = _kind_histogram(a, symbols_by_file)
    hb = _kind_histogram(b, symbols_by_file)
    if not ha or not hb:
        return 1.0
    return max(0.0, 1.0 - _cosine(ha, hb))


def _pairwise_distance(
    a: str,
    b: str,
    *,
    max_depth: int,
    symbols_by_file: dict[str, list[dict]],
    imports_by_file: dict[str, set[str]],
) -> float:
    d_dir = _dir_distance(a, b, max_depth)
    d_name = _name_distance(a, b)
    d_imp = _import_distance(a, b, imports_by_file)
    d_struct = _struct_distance(a, b, symbols_by_file)
    return (
        DIST_W_DIR * d_dir
        + DIST_W_NAME * d_name
        + DIST_W_IMP * d_imp
        + DIST_W_STRUCT * d_struct
    )


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------


def _agglomerative_cluster(
    file_paths: list[str],
    *,
    symbols_by_file: dict[str, list[dict]],
    imports_by_file: dict[str, set[str]],
) -> list[list[str]]:
    """Single-linkage agglomerative clustering with threshold ``D_THRESHOLD``."""
    n = len(file_paths)
    if n == 0:
        return []
    if n == 1:
        return [list(file_paths)]

    max_depth = max((len(_split_path(p)) - 1 for p in file_paths), default=1)
    max_depth = max(max_depth, 1)

    # Compute condensed distance matrix
    dist: list[list[float]] = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = _pairwise_distance(
                file_paths[i],
                file_paths[j],
                max_depth=max_depth,
                symbols_by_file=symbols_by_file,
                imports_by_file=imports_by_file,
            )
            dist[i][j] = d
            dist[j][i] = d

    # Try scipy first; fall back to manual single-linkage merge.
    try:
        from scipy.cluster import hierarchy  # type: ignore
        import numpy as _np  # type: ignore

        condensed = []
        for i in range(n):
            for j in range(i + 1, n):
                condensed.append(dist[i][j])
        Z = hierarchy.linkage(_np.asarray(condensed, dtype=float), method="single")
        labels = hierarchy.fcluster(Z, t=D_THRESHOLD, criterion="distance")
        groups: dict[int, list[str]] = {}
        for path, label in zip(file_paths, labels):
            groups.setdefault(int(label), []).append(path)
        return [sorted(grp) for grp in groups.values()]
    except Exception:
        pass

    return _manual_single_linkage(file_paths, dist)


def _manual_single_linkage(
    file_paths: list[str], dist: list[list[float]]
) -> list[list[str]]:
    n = len(file_paths)
    clusters: list[Optional[list[int]]] = [[i] for i in range(n)]

    while True:
        best = None
        best_d = D_THRESHOLD
        for i in range(len(clusters)):
            ci = clusters[i]
            if ci is None:
                continue
            for j in range(i + 1, len(clusters)):
                cj = clusters[j]
                if cj is None:
                    continue
                # Single linkage: minimum pairwise distance.
                local_min = math.inf
                for a in ci:
                    for b in cj:
                        if dist[a][b] < local_min:
                            local_min = dist[a][b]
                if local_min < best_d:
                    best_d = local_min
                    best = (i, j)
        if best is None:
            break
        i, j = best
        ci = clusters[i] or []
        cj = clusters[j] or []
        clusters[i] = sorted(set(ci) | set(cj))
        clusters[j] = None

    out: list[list[str]] = []
    for grp in clusters:
        if grp is None:
            continue
        out.append(sorted(file_paths[idx] for idx in grp))
    return out


def _directory_cluster(file_paths: list[str]) -> list[list[str]]:
    by_dir: dict[str, list[str]] = {}
    for fp in file_paths:
        parts = _split_path(fp)
        directory = "/".join(parts[:-1]) if len(parts) > 1 else ""
        by_dir.setdefault(directory, []).append(fp)
    return [sorted(v) for v in by_dir.values()]


# ---------------------------------------------------------------------------
# Annotation
# ---------------------------------------------------------------------------


def _longest_common_dir(file_paths: list[str]) -> str:
    if not file_paths:
        return ""
    split = [_split_path(p)[:-1] for p in file_paths]
    if not split:
        return ""
    shared: list[str] = []
    for i in range(min(len(s) for s in split)):
        col = {s[i] for s in split}
        if len(col) == 1:
            shared.append(next(iter(col)))
        else:
            break
    return "/".join(shared)


def _common_suffix(file_paths: list[str]) -> str:
    """Most common ``*_suffix.ext`` pattern in the cluster, or ``*``."""
    suffixes: Counter = Counter()
    for fp in file_paths:
        parts = _split_path(fp)
        if not parts:
            continue
        base = parts[-1]
        stem, _, ext = base.rpartition(".") if "." in base else (base, "", "")
        ext = f".{ext}" if ext else ""
        tokens = [t for t in _NAME_TOKEN_RE.split(stem) if t]
        if not tokens:
            continue
        suffix = tokens[-1].lower()
        suffixes[f"*_{suffix}{ext}"] += 1
    if not suffixes:
        return "*"
    pattern, count = suffixes.most_common(1)[0]
    if count <= 1 and len(file_paths) > 2:
        return "*"
    return pattern


def _heuristic_code_shape(
    file_paths: list[str], symbols_by_file: dict[str, list[dict]]
) -> list[str]:
    counter: Counter = Counter()
    for fp in file_paths:
        for sym in symbols_by_file.get(fp) or []:
            kind = sym.get("kind") or "unknown"
            counter[kind] += 1
    if not counter:
        return ["no extracted symbols"]
    parts = [f"{count} {kind}{'s' if count != 1 else ''}" for kind, count in counter.most_common(5)]
    return parts


def _heuristic_annotation(
    file_paths: list[str], symbols_by_file: dict[str, list[dict]]
) -> dict:
    common = _longest_common_dir(file_paths) or "<repo root>"
    role = f"files in directory `{common}` (LLM annotation unavailable)"
    naming = _common_suffix(file_paths)
    shape_list = _heuristic_code_shape(file_paths, symbols_by_file)
    code_shape = {"patterns": shape_list, "source": "heuristic"}
    return {
        "role_description": role,
        "naming_convention": naming,
        "code_shape": code_shape,
    }


def _select_central_files(
    file_paths: list[str], incoming_refs_by_file: dict[str, int], limit: int = 5
) -> list[str]:
    ranked = sorted(
        file_paths,
        key=lambda fp: (-incoming_refs_by_file.get(fp, 0), fp),
    )
    return ranked[:limit]


def _build_llm_prompt(
    selected_files: list[str], symbols_by_file: dict[str, list[dict]]
) -> tuple[str, str]:
    system = (
        "You are an expert software architect. Given a sample of files from a "
        "single cluster of a codebase, infer the cluster's role.\n"
        "Output STRICT JSON with exactly these keys:\n"
        '  "role" — one short sentence describing the cluster\'s role.\n'
        '  "naming_convention" — a glob or regex describing the file naming pattern (e.g. "*_handler.py").\n'
        '  "code_shape" — a JSON array of 3-5 short strings naming characteristic code patterns observed.\n'
        '  "forbidden_dependencies" — optional JSON array of cluster role names this cluster should NOT depend on.\n'
        "Output ONLY the JSON object, no prose, no markdown fences."
    )
    user_lines = ["Files in this cluster:"]
    for fp in selected_files:
        user_lines.append(f"\n- {fp}")
        syms = symbols_by_file.get(fp) or []
        for sym in syms[:20]:
            sig = sym.get("signature") or sym.get("qualified_name") or ""
            kind = sym.get("kind") or "?"
            user_lines.append(f"    [{kind}] {sig}")
    user_lines.append(
        "\nReturn the JSON description for this cluster."
    )
    return system, "\n".join(user_lines)


def _parse_llm_json(payload: str) -> Optional[dict]:
    if not payload:
        return None
    text = payload.strip()
    # Tolerate ```json fences if the model adds them.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    # Find the outermost JSON object.
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return None


def _annotate_cluster(
    file_paths: list[str],
    *,
    symbols_by_file: dict[str, list[dict]],
    incoming_refs_by_file: dict[str, int],
) -> tuple[dict, str]:
    """Return ``(row, source)`` where ``source`` is ``"llm"`` or ``"heuristic"``."""
    if not file_paths:
        return (
            {
                "role_description": "empty cluster",
                "naming_convention": "*",
                "code_shape": {"patterns": [], "source": "heuristic"},
            },
            "heuristic",
        )

    if not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
        return _heuristic_annotation(file_paths, symbols_by_file), "heuristic"

    selected = _select_central_files(file_paths, incoming_refs_by_file, limit=5)
    system, user = _build_llm_prompt(selected, symbols_by_file)

    raw = ""
    try:
        raw = llm_lib.complete(system=system, user=user, max_tokens=512)
    except Exception as exc:
        logger.warning("layer 3 LLM call failed: %s", exc)
        raw = ""

    parsed = _parse_llm_json(raw) if raw else None
    if not parsed or not isinstance(parsed, dict) or not parsed.get("role"):
        return _heuristic_annotation(file_paths, symbols_by_file), "heuristic"

    role = str(parsed.get("role") or "").strip() or "unnamed cluster"
    naming = parsed.get("naming_convention")
    if not isinstance(naming, str) or not naming.strip():
        naming = _common_suffix(file_paths)

    shape_raw = parsed.get("code_shape") or []
    if not isinstance(shape_raw, list):
        shape_raw = [str(shape_raw)]
    patterns = [str(s) for s in shape_raw if s][:5]
    if not patterns:
        patterns = _heuristic_code_shape(file_paths, symbols_by_file)

    code_shape: dict[str, Any] = {"patterns": patterns, "source": "llm"}
    forbidden = parsed.get("forbidden_dependencies")
    if isinstance(forbidden, list) and forbidden:
        code_shape["forbidden_dependencies"] = [str(x) for x in forbidden if x]

    return (
        {
            "role_description": role,
            "naming_convention": naming.strip(),
            "code_shape": code_shape,
        },
        "llm",
    )
