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


def empty_projection() -> GraphProjection:
    return GraphProjection(nodes=[], edges=[])


def projection_for(repo_hash: str, layer: str) -> GraphProjection:
    if layer == "symbol":
        return symbol_projection(repo_hash)
    if layer == "flow":
        return flow_projection(repo_hash)
    return empty_projection()
