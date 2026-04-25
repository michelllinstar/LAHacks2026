"""Pydantic round-trip tests for backend.models."""

from __future__ import annotations

from backend.models import (
    ContextBundle,
    Exemplar,
    FlowPath,
    GraphEdge,
    GraphNode,
    Region,
    RelevantSymbol,
)


def test_region_accepts_string_cluster_id():
    r = Region(cluster_id="64f2a1c0c0a1b2c3d4e5f6a7", role="handlers")
    assert r.cluster_id == "64f2a1c0c0a1b2c3d4e5f6a7"
    assert r.role == "handlers"
    # round-trip
    assert Region(**r.model_dump()).cluster_id == r.cluster_id


def test_region_cluster_id_optional():
    r = Region()
    assert r.cluster_id is None
    assert r.role == ""
    assert r.conventions == {}


def test_graph_node_round_trip():
    n = GraphNode(id="abc", kind="symbol", label="foo()", layer=1, metadata={"k": "v"})
    payload = n.model_dump()
    n2 = GraphNode(**payload)
    assert n2.id == "abc"
    assert n2.kind == "symbol"
    assert n2.layer == 1
    assert n2.metadata == {"k": "v"}


def test_graph_edge_default_weight():
    e = GraphEdge(source="a", target="b", kind="calls")
    assert e.weight == 1.0
    assert GraphEdge(**e.model_dump()).source == "a"


def test_flow_path_round_trip():
    f = FlowPath(
        source_symbol="auth.login",
        sink_symbol="db.write",
        path=["auth.middleware", "auth.session"],
        flow_kind="call_chain",
        sensitivity="password",
    )
    f2 = FlowPath(**f.model_dump())
    assert f2.path == ["auth.middleware", "auth.session"]
    assert f2.sensitivity == "password"


def test_context_bundle_round_trip_with_string_cluster_id():
    bundle = ContextBundle(
        region=Region(cluster_id="64f2a1c0c0a1b2c3d4e5f6a7", role="api"),
        exemplars=[Exemplar(file_path="a/b.py", reason="naming match")],
        relevant_symbols=[
            RelevantSymbol(
                qualified_name="x.y",
                file_path="a/b.py",
                line_start=1,
                line_end=10,
                signature="def y(): ...",
                kind="function",
            )
        ],
        flows=[],
        notes=["heads up"],
    )
    payload = bundle.model_dump()
    # cluster_id must serialize as a string
    assert isinstance(payload["region"]["cluster_id"], str)
    rebuilt = ContextBundle(**payload)
    assert rebuilt.region.cluster_id == "64f2a1c0c0a1b2c3d4e5f6a7"
    assert rebuilt.relevant_symbols[0].qualified_name == "x.y"
    assert rebuilt.notes == ["heads up"]
