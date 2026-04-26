"""Whole-repository graph projections used by the visualization frontend."""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

from backend.db import store as db_store
from backend.models import GraphEdge, GraphNode, GraphProjection


# A few common words that should map to canonical short tags. Anything not
# in this dict falls through to "uppercase + cap at 12 chars" which gives
# reasonable results for path segments like "users", "api", "tests", etc.
_TAG_ABBREVIATIONS = {
    "authentication": "AUTH",
    "auth": "AUTH",
    "authorization": "AUTHZ",
    "database": "DB",
    "persistent": "STORAGE",
    "persistence": "STORAGE",
    "storage": "STORAGE",
    "utility": "UTILS",
    "utilities": "UTILS",
    "configuration": "CONFIG",
    "controllers": "CONTROL",
    "middleware": "MIDDLE",
}


def _short_tag(raw: str) -> str:
    """Normalise an identifier-ish string to a short upper-snake tag."""
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", raw or "").strip("_").lower()
    if not cleaned:
        return "CLUSTER"
    if cleaned in _TAG_ABBREVIATIONS:
        return _TAG_ABBREVIATIONS[cleaned]
    return cleaned.upper()[:12]


_ROLE_STOPWORDS = {
    "the", "a", "an", "this", "that", "these", "those",
    "manages", "handles", "provides", "implements", "contains",
    "serves", "represents", "defines", "is", "are", "and", "or",
    "with", "for", "to", "of", "in", "on", "by", "as",
    "cluster", "module", "component", "system", "code", "files",
}


def _short_name_for_cluster(file_paths: Iterable[str], role_description: str) -> str:
    """Pick a short tag for a cluster.

    Strategy: most common immediate-parent directory of the cluster's member
    files, lowercased + abbreviated via _TAG_ABBREVIATIONS. If the files don't
    share a meaningful directory, fall back to the first non-stopword in the
    role description.
    """
    parents: list[str] = []
    for p in file_paths:
        if not p:
            continue
        # Take the immediate parent directory; that's almost always the
        # meaningful module name (``auth/login.py`` → ``auth``).
        parts = p.replace("\\", "/").rstrip("/").split("/")
        if len(parts) >= 2 and parts[-2]:
            parents.append(parts[-2])
    if parents:
        most_common, _ = Counter(parents).most_common(1)[0]
        return _short_tag(most_common)

    # Role-text fallback: pick the first word that isn't a stopword.
    for word in re.findall(r"[A-Za-z]+", role_description.lower()):
        if len(word) > 2 and word not in _ROLE_STOPWORDS:
            return _short_tag(word)
    return "CLUSTER"


def symbol_projection(repo_hash: str) -> GraphProjection:
    """Layer 1 projection: every symbol + every ref.

    Per-symbol metadata is enriched with the symbol's Layer 3 cluster
    assignment (``cluster_id`` + ``cluster_role``) so the frontend can group
    symbols visually by architectural region without a separate round trip.
    Both fields are ``None`` when Layer 3 hasn't run for this repo.
    """
    # Build the file_path → cluster_id map once. iter_files is cheap (one
    # Mongo scan keyed on repo_hash); avoiding it would require a per-symbol
    # lookup which is N round trips. We also build the inverse cluster_id →
    # [file_path] mapping in the same pass so the short-tag derivation
    # doesn't need a second scan.
    file_to_cluster: dict[str, str | None] = {}
    cluster_to_files: dict[str, list[str]] = {}
    for f in db_store.iter_files(repo_hash):
        path = f["file_path"]
        cid_obj = f.get("cluster_id")
        cid = str(cid_obj) if cid_obj is not None else None
        file_to_cluster[path] = cid
        if cid is not None:
            cluster_to_files.setdefault(cid, []).append(path)

    # cluster_id → role_description so we can ship the human label alongside
    # the id (saves the frontend a second projection request). Also derive a
    # short, badge-sized tag (e.g. AUTH / USERS / TESTS) for the visual
    # cluster region label.
    cluster_to_role: dict[str, str] = {}
    cluster_to_short: dict[str, str] = {}
    for c in db_store.iter_clusters(repo_hash):
        cid = c.get("_id")
        if cid is None:
            continue
        cid_str = str(cid)
        role = c.get("role_description", "") or ""
        cluster_to_role[cid_str] = role
        cluster_to_short[cid_str] = _short_name_for_cluster(
            cluster_to_files.get(cid_str, []), role,
        )

    nodes: list[GraphNode] = []
    for doc in db_store.iter_symbols(repo_hash):
        qname = doc.get("qualified_name", "")
        kind = doc.get("kind")
        # For methods (and any function whose qname is "X.y") expose the
        # owning class qname so the frontend can roll the method into the
        # class card without needing to re-derive it from labels.
        parent_class = None
        if kind == "method" and "." in qname:
            parent_class = qname.rsplit(".", 1)[0]
        cluster_id = file_to_cluster.get(doc.get("file_path") or "")
        cluster_role = cluster_to_role.get(cluster_id) if cluster_id else None
        cluster_short = cluster_to_short.get(cluster_id) if cluster_id else None
        nodes.append(
            GraphNode(
                id=str(doc["_id"]),
                kind="symbol",
                label=qname,
                layer=1,
                metadata={
                    "file_path": doc.get("file_path"),
                    "line_start": doc.get("line_start"),
                    "line_end": doc.get("line_end"),
                    "signature": doc.get("signature") or "",
                    "symbol_kind": kind,
                    "parent_class": parent_class,
                    "cluster_id": cluster_id,
                    "cluster_role": cluster_role,
                    # Short upper-snake tag for the cluster region label
                    # (e.g. AUTH / USERS / TESTS). Long form lives in
                    # ``cluster_role`` for the click-to-expand card.
                    "cluster_short": cluster_short,
                },
            )
        )
    edges: list[GraphEdge] = []
    for doc in db_store.iter_refs(repo_hash):
        edges.append(
            GraphEdge(
                source=str(doc["source_symbol_id"]),
                target=str(doc["target_symbol_id"]),
                kind=doc.get("edge_kind", ""),
                weight=1.0,
            )
        )
    return GraphProjection(nodes=nodes, edges=edges)


def flow_projection(repo_hash: str) -> GraphProjection:
    """Layer 2 projection: function symbols touched by flows + flow edges.

    Each flow becomes one edge (source → sink) with metadata describing the
    intermediate path and sensitivity tag. Nodes are the symbols that appear
    as source, sink, or anywhere in any path.
    """
    flows = db_store.iter_flows(repo_hash)
    if not flows:
        return empty_projection()

    touched: set = set()
    for flow in flows:
        src = flow.get("source_symbol_id")
        sink = flow.get("sink_symbol_id")
        if src is not None:
            touched.add(src)
        if sink is not None:
            touched.add(sink)
        for pid in flow.get("path") or []:
            if pid is not None:
                touched.add(pid)

    docs = db_store.get_symbols_by_ids(repo_hash, list(touched)) if touched else []
    by_id = {doc["_id"]: doc for doc in docs}

    nodes: list[GraphNode] = []
    for sid, doc in by_id.items():
        nodes.append(
            GraphNode(
                id=str(sid),
                kind="flow_node",
                label=doc.get("qualified_name", ""),
                layer=2,
                metadata={
                    "file_path": doc.get("file_path"),
                    "line_start": doc.get("line_start"),
                    "line_end": doc.get("line_end"),
                    "signature": doc.get("signature") or "",
                    "symbol_kind": doc.get("kind"),
                },
            )
        )

    edges: list[GraphEdge] = []
    for flow in flows:
        src = flow.get("source_symbol_id")
        sink = flow.get("sink_symbol_id")
        if src is None or sink is None:
            continue
        sensitivity = flow.get("sensitivity")
        edges.append(
            GraphEdge(
                source=str(src),
                target=str(sink),
                kind="flow_call_chain",
                weight=2.0 if sensitivity else 1.0,
                metadata={
                    "path": [str(pid) for pid in flow.get("path") or []],
                    "flow_kind": flow.get("flow_kind", "call_chain"),
                    "sensitivity": sensitivity,
                },
            )
        )

    return GraphProjection(nodes=nodes, edges=edges)


def architecture_projection(repo_hash: str) -> GraphProjection:
    """Layer 3 projection: clusters as nodes; allowed/forbidden deps as edges."""
    clusters = db_store.iter_clusters(repo_hash)
    if not clusters:
        return empty_projection()

    # Single ``iter_files`` call so member counts stay O(1) per cluster
    # instead of N+1 round trips.
    member_counts: dict = {}
    for fdoc in db_store.iter_files(repo_hash):
        cid = fdoc.get("cluster_id")
        if cid is None:
            continue
        member_counts[cid] = member_counts.get(cid, 0) + 1

    nodes: list[GraphNode] = []
    for cluster in clusters:
        cid = cluster["_id"]
        role = cluster.get("role_description", "") or ""
        label = role[:80]
        nodes.append(
            GraphNode(
                id=str(cid),
                kind="cluster",
                label=label,
                layer=3,
                metadata={
                    "naming_convention": cluster.get("naming_convention"),
                    "code_shape": cluster.get("code_shape"),
                    "member_count": member_counts.get(cid, 0),
                    "role_description": role,
                },
            )
        )

    edges: list[GraphEdge] = []
    for dep in db_store.iter_cluster_dependencies(repo_hash):
        src = dep.get("source_cluster_id")
        tgt = dep.get("target_cluster_id")
        if src is None or tgt is None:
            continue
        raw_kind = dep.get("kind", "")
        if raw_kind == "allowed":
            edge_kind = "allows"
            weight = 1.0
        elif raw_kind == "forbidden":
            edge_kind = "forbids"
            weight = 2.0
        else:
            edge_kind = raw_kind or "depends"
            weight = 1.0
        edges.append(
            GraphEdge(
                source=str(src),
                target=str(tgt),
                kind=edge_kind,
                weight=weight,
                metadata={"kind": raw_kind},
            )
        )

    return GraphProjection(nodes=nodes, edges=edges)


def invariant_projection(repo_hash: str) -> GraphProjection:
    """Layer 4 projection: invariants as nodes, attached to their target
    symbols via 'constrains' edges (SPEC §8.3)."""
    invariants = db_store.iter_invariants(repo_hash)
    if not invariants:
        return empty_projection()

    target_ids: set = set()
    for inv in invariants:
        tid = inv.get("target_symbol_id")
        if tid is not None:
            target_ids.add(tid)

    sym_docs = (
        db_store.get_symbols_by_ids(repo_hash, list(target_ids)) if target_ids else []
    )
    by_id = {doc["_id"]: doc for doc in sym_docs}

    # Only emit symbol nodes for targets that actually have at least one
    # invariant — anything else would clutter the layer view.
    constrained_targets: set = {
        inv.get("target_symbol_id")
        for inv in invariants
        if inv.get("target_symbol_id") is not None and inv.get("target_symbol_id") in by_id
    }

    nodes: list[GraphNode] = []
    for sid in constrained_targets:
        doc = by_id[sid]
        nodes.append(
            GraphNode(
                id=str(sid),
                kind="symbol",
                label=doc.get("qualified_name", ""),
                layer=1,
                metadata={
                    "file_path": doc.get("file_path"),
                    "signature": doc.get("signature") or "",
                },
            )
        )

    edges: list[GraphEdge] = []
    for inv in invariants:
        tid = inv.get("target_symbol_id")
        if tid is None or tid not in by_id:
            continue
        inv_id = inv.get("_id")
        if inv_id is None:
            continue
        text = inv.get("text", "") or ""
        source_kind = inv.get("source_kind", "")
        confidence = float(inv.get("confidence", 0.0))
        nodes.append(
            GraphNode(
                id=str(inv_id),
                kind="invariant",
                label=text[:80],
                layer=4,
                metadata={
                    "source_kind": source_kind,
                    "confidence": confidence,
                    "source_location": inv.get("source_location", ""),
                    "target_symbol_id": str(tid),
                    "target_symbol": by_id[tid].get("qualified_name", ""),
                },
            )
        )
        edges.append(
            GraphEdge(
                source=str(inv_id),
                target=str(tid),
                kind="constrains",
                weight=confidence,
                metadata={"source_kind": source_kind},
            )
        )

    return GraphProjection(nodes=nodes, edges=edges)


def empty_projection() -> GraphProjection:
    return GraphProjection(nodes=[], edges=[])


def projection_for(repo_hash: str, layer: str) -> GraphProjection:
    if layer == "symbol":
        return symbol_projection(repo_hash)
    if layer == "flow":
        return flow_projection(repo_hash)
    if layer == "architecture":
        return architecture_projection(repo_hash)
    if layer == "invariant":
        return invariant_projection(repo_hash)
    return empty_projection()
