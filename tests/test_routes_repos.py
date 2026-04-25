"""Contract tests for the /api/repos POST endpoint."""

from __future__ import annotations


def test_create_repo_requires_url_or_path(client):
    resp = client.post("/api/repos", json={})
    assert resp.status_code == 400
    body = resp.json()
    assert "git_url" in body["detail"] or "local_path" in body["detail"]


def test_create_repo_with_git_url_succeeds(client):
    resp = client.post(
        "/api/repos", json={"git_url": "https://github.com/foo/bar.git"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "hash" in body
    assert len(body["hash"]) == 12


def test_create_repo_with_local_path_succeeds(client):
    resp = client.post("/api/repos", json={"local_path": "/tmp/bar"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending"
