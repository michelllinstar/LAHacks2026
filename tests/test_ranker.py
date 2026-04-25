"""Tests for backend.query.ranker._normalize and helpers."""

from __future__ import annotations

import math

from backend.query.ranker import _normalize, _is_test_path


def test_normalize_empty_returns_empty():
    assert _normalize({}) == {}


def test_normalize_single_value_returns_zero():
    # min == max → degenerate, all-zero per implementation contract
    out = _normalize({"a": 5.0})
    assert out == {"a": 0.0}


def test_normalize_all_equal_returns_zero():
    out = _normalize({"a": 1.0, "b": 1.0, "c": 1.0})
    assert out == {"a": 0.0, "b": 0.0, "c": 0.0}


def test_normalize_scales_to_unit_interval():
    out = _normalize({"a": 0.0, "b": 5.0, "c": 10.0})
    assert math.isclose(out["a"], 0.0)
    assert math.isclose(out["b"], 0.5)
    assert math.isclose(out["c"], 1.0)


def test_is_test_path_recognizes_common_layouts():
    assert _is_test_path("tests/test_foo.py")
    assert _is_test_path("backend/test/something.py")
    assert _is_test_path("pkg/test_module.py")
    assert _is_test_path("pkg/something_test.py")
    assert not _is_test_path("backend/lib/repo_hash.py")
    assert not _is_test_path("src/contest_winner.py")
