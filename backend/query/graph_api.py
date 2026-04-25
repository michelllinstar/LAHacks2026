"""Whole-repository graph projections used by the visualization frontend."""

from __future__ import annotations

from backend.db import store as db_store
from backend.models import GraphEdge, GraphNode, GraphProjection


def symbol_projection(repo_hash: str) -> GraphProjection:
    """Layer 1 projection: every symbol + every ref."""
    conn = db_store.get_repo_db(repo_hash)
    try:
        nodes: list[GraphNode] = []
        for row in conn.execute(
            "SELECT id, qualified_name, file_path, line_start, line_end, kind, signature FROM symbols"
        ):
            nodes.append(
                GraphNode(
                    id=str(row["id"]),
                    kind="symbol",
                    label=row["qualified_name"],
                    layer=1,
                    metadata={
                        "file_path": row["file_path"],
                        "line_start": row["line_start"],
                        "line_end": row["line_end"],
                        "signature": row["signature"] or "",
                        "symbol_kind": row["kind"],
                    },
                )
            )
        edges: list[GraphEdge] = []
        for row in conn.execute(
            "SELECT id, source_symbol_id, target_symbol_id, edge_kind FROM refs"
        ):
            edges.append(
                GraphEdge(
                    source=str(row["source_symbol_id"]),
                    target=str(row["target_symbol_id"]),
                    kind=row["edge_kind"],
                    weight=1.0,
                )
            )
        return GraphProjection(nodes=nodes, edges=edges)
    finally:
        conn.close()


def empty_projection() -> GraphProjection:
    return GraphProjection(nodes=[], edges=[])


def projection_for(repo_hash: str, layer: str) -> GraphProjection:
    if layer == "symbol":
        return symbol_projection(repo_hash)
    return empty_projection()
