"""Smoke test for GET /health."""

from __future__ import annotations


def test_health_returns_ok(client):
    """The endpoint must always return HTTP 200 with status:ok so liveness
    probes succeed regardless of Mongo reachability. The ``mongo`` field
    distinguishes "DB up" from "DB down" without flipping HTTP status — the
    test fixture mocks the DB so we just verify both fields are present."""
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "mongo" in body
    assert body["mongo"] in {"reachable", "unreachable"}
