"""Tests for backend.query.decomposer.decompose."""

from __future__ import annotations

from backend.query.decomposer import decompose


def test_returns_required_keys():
    out = decompose("Add rate limiting to the API endpoints")
    assert set(out.keys()) >= {"task_type", "keywords", "constraints"}
    assert isinstance(out["keywords"], list)
    assert isinstance(out["constraints"], list)


def test_default_task_type_is_modify_existing():
    out = decompose("change the user model")
    assert out["task_type"] == "modify existing"


def test_keywords_filter_stopwords_and_lowercase():
    out = decompose("Add rate limiting to the API endpoints")
    # `add`, `to`, `the` should be dropped; remaining lowercased.
    assert "add" not in out["keywords"]
    assert "the" not in out["keywords"]
    assert "rate" in out["keywords"]
    assert "limiting" in out["keywords"]
    # all output keywords should be lowercase
    assert all(k == k.lower() for k in out["keywords"])


def test_empty_input_returns_empty_keywords():
    out = decompose("")
    assert out["keywords"] == []
    assert out["task_type"] == "modify existing"


def test_keywords_nonempty_for_meaningful_input():
    out = decompose("authentication password validation")
    assert len(out["keywords"]) >= 1
