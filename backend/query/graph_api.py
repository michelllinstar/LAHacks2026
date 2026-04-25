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


def empty_projection() -> GraphProjection:
    return GraphProjection(nodes=[], edges=[])


def projection_for(repo_hash: str, layer: str) -> GraphProjection:
    if layer == "symbol":
        return symbol_projection(repo_hash)
    return empty_projection()
