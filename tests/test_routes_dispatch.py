"""Contract tests for /api/query/dispatch.

These tests exercise the validator + early-return guards only; they do not
expect the underlying QueryEngine to do real work, so cases that would
require Mongo data are not asserted on the result, only on status codes.
"""

from __future__ import annotations


def test_unknown_query_type_rejected_by_literal_validator(client):
    resp = client.post(
        "/api/query/dispatch",
        json={"query_type": "not_a_real_type", "repo_hash": "abc"},
    )
    assert resp.status_code == 422


def test_trace_data_flow_requires_symbol(client):
    resp = client.post(
        "/api/query/dispatch",
        json={"query_type": "trace_data_flow", "repo_hash": "abc"},
    )
    assert resp.status_code == 400
    assert "symbol" in resp.json()["detail"]


def test_find_exemplars_requires_cluster_id(client):
    resp = client.post(
        "/api/query/dispatch",
        json={
            "query_type": "find_exemplars",
            "repo_hash": "abc",
            "task": "add a new handler",
        },
    )
    assert resp.status_code == 400
    assert "cluster_id" in resp.json()["detail"]


def test_dispatch_requires_repo_hash(client):
    resp = client.post(
        "/api/query/dispatch",
        json={"query_type": "find_relevant_context"},
    )
    # repo_hash is required by the model
    assert resp.status_code == 422
