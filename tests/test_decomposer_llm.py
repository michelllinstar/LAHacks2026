"""Tests for the LLM-backed decomposer (SPEC §5.2).

Covers the heuristic fallback path, the empty-input guard, and the LLM
success path with a mocked ``llm.complete`` so no live Gemini key is
required.
"""

from __future__ import annotations

import json

from backend.query import decomposer


def _clear_llm_keys(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)


def test_empty_input_returns_defaults(monkeypatch):
    _clear_llm_keys(monkeypatch)
    out = decomposer.decompose("")
    assert out["task_type"] == "modify existing"
    assert out["keywords"] == []
    assert out["constraints"] == []


def test_heuristic_when_no_api_key(monkeypatch):
    """Without GEMINI_API_KEY, must not call llm.complete and must
    return the heuristic shape with lowercased keywords + stopwords stripped."""
    _clear_llm_keys(monkeypatch)

    called = {"n": 0}

    def _boom(*args, **kwargs):
        called["n"] += 1
        raise AssertionError("llm.complete must not be called without API key")

    monkeypatch.setattr(decomposer.llm, "complete", _boom)

    out = decomposer.decompose("Add rate limiting to the API endpoints")
    assert called["n"] == 0
    assert out["task_type"] == "add new code"
    assert "rate" in out["keywords"]
    assert "limiting" in out["keywords"]
    assert "the" not in out["keywords"]
    assert all(k == k.lower() for k in out["keywords"])
    assert isinstance(out["constraints"], list)


def test_llm_path_parses_valid_json(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    payload = {
        "task_type": "understand",
        "keywords": ["Auth", "Session", "JWT"],
        "constraints": ["preserve API contract"],
    }
    monkeypatch.setattr(
        decomposer.llm,
        "complete",
        lambda system, user, max_tokens=200: json.dumps(payload),
    )
    out = decomposer.decompose("explain how auth sessions work")
    assert out["task_type"] == "understand"
    # keywords lowercased + truncated to 8.
    assert out["keywords"] == ["auth", "session", "jwt"]
    assert out["constraints"] == ["preserve API contract"]


def test_llm_path_falls_back_on_bad_json(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        decomposer.llm,
        "complete",
        lambda system, user, max_tokens=200: "not json at all {{{",
    )
    out = decomposer.decompose("change the user model")
    # Falls back to heuristic — no exception escapes.
    assert out["task_type"] in {"modify existing", "add new code", "understand"}
    assert isinstance(out["keywords"], list)


def test_llm_path_strips_markdown_fences(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    fenced = (
        "```json\n"
        '{"task_type": "add new code", "keywords": ["cache"], "constraints": []}\n'
        "```"
    )
    monkeypatch.setattr(
        decomposer.llm,
        "complete",
        lambda system, user, max_tokens=200: fenced,
    )
    out = decomposer.decompose("add a cache")
    assert out["task_type"] == "add new code"
    assert out["keywords"] == ["cache"]
