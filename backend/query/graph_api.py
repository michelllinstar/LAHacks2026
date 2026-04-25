"""Whole-repository graph projections used by the visualization frontend."""

from __future__ import annotations

from backend.db import store as db_store
from backend.models import GraphEdge, GraphNode, GraphProjection


def symbol_projection(repo_hash: str) -> GraphProjection:
    """Layer 1 projection: every symbol + every ref."""
    nodes: list[GraphNode] = []
    for doc in db_store.iter_symbols(repo_hash):
        nodes.append(
            GraphNode(
                id=str(doc["_id"]),
                kind="symbol",
                label=doc.get("qualified_name", ""),
                layer=1,
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
