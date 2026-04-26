"""Tests for the OmegaClaw skill wrapper (SPEC §7.3)."""

from __future__ import annotations

from backend.lib import omegaclaw
from backend.agents.protocols import UserResponse


def test_handle_query_empty_question_returns_error():
    out = omegaclaw.handle_query("", "abc123")
    assert out["error"] == "question is required"
    assert out["answer"] == ""
    assert out["bundle"] == {}
    assert out["sources"] == []


def test_handle_query_empty_repo_hash_returns_error():
    out = omegaclaw.handle_query("explain auth", "")
    assert out["error"] == "repo_hash is required"


def test_handle_query_returns_skill_response_shape(monkeypatch):
    fake_bundle = {
        "query_type": "find_relevant_context",
        "result": {
            "relevant_symbols": [
                {"file_path": "/repo/auth/login.py", "qualified_name": "auth.login"},
                {"file_path": "/repo/auth/login.py", "qualified_name": "auth.logout"},
                {"file_path": "/repo/auth/session.py", "qualified_name": "auth.session"},
            ],
        },
    }

    def _fake_handle(query):
        return UserResponse(bundle=fake_bundle)

    monkeypatch.setattr(omegaclaw.coordinator, "handle_user_query", _fake_handle)

    out = omegaclaw.handle_query("explain auth", "abc123")
    assert set(out.keys()) == {"answer", "bundle", "query_type", "sources"}
    assert out["query_type"] == "find_relevant_context"
    assert out["bundle"] == fake_bundle
    # 3 symbols across 2 files
    assert "3 relevant symbols" in out["answer"]
    assert "2 files" in out["answer"]
    assert out["sources"] == [
        "/repo/auth/login.py",
        "/repo/auth/session.py",
    ]


def test_handle_query_handles_coordinator_exception(monkeypatch):
    def _boom(query):
        raise RuntimeError("mongo down")

    monkeypatch.setattr(omegaclaw.coordinator, "handle_user_query", _boom)
    out = omegaclaw.handle_query("explain auth", "abc123")
    assert out["error"].startswith("coordinator error:")
    assert "mongo down" in out["error"]


def test_extract_sources_dedup_and_merges_kinds():
    bundle = {
        "query_type": "find_exemplars",
        "result": {
            "relevant_symbols": [
                {"file_path": "/a.py"},
                {"file_path": "/a.py"},  # duplicate
            ],
            "exemplars": [{"file_path": "/b.py"}],
            "member_files": ["/c.py", "/a.py"],
            "files": [{"file_path": "/d.py"}],
        },
    }
    sources = omegaclaw._extract_sources(bundle)
    assert sources == ["/a.py", "/b.py", "/c.py", "/d.py"]


def test_skill_manifest_has_required_keys():
    assert omegaclaw.SKILL_MANIFEST["name"] == "cartographer"
    assert "input_schema" in omegaclaw.SKILL_MANIFEST
    assert omegaclaw.SKILL_MANIFEST["input_schema"]["required"] == [
        "question",
        "repo_hash",
    ]
