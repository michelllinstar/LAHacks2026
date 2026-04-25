"""Tests for backend.lib.repo_hash.hash_repo (deterministic 12-hex)."""

from __future__ import annotations

import re

import pytest

from backend.lib.repo_hash import hash_repo


_HEX12 = re.compile(r"^[0-9a-f]{12}$")


def test_hash_is_12_hex_chars():
    h = hash_repo(git_url="https://github.com/foo/bar.git")
    assert _HEX12.match(h), f"expected 12 hex chars, got {h!r}"
    assert len(h) == 12


def test_hash_is_deterministic_for_same_inputs():
    a = hash_repo(git_url="https://github.com/foo/bar.git", local_path="/tmp/bar")
    b = hash_repo(git_url="https://github.com/foo/bar.git", local_path="/tmp/bar")
    assert a == b


def test_hash_changes_when_inputs_change():
    a = hash_repo(git_url="https://github.com/foo/bar.git")
    b = hash_repo(git_url="https://github.com/foo/baz.git")
    c = hash_repo(local_path="/tmp/bar")
    assert a != b
    assert a != c
    assert b != c


def test_hash_with_only_local_path_is_valid():
    h = hash_repo(local_path="/some/abs/path")
    assert _HEX12.match(h)


def test_both_none_raises_value_error():
    with pytest.raises(ValueError):
        hash_repo()
    with pytest.raises(ValueError):
        hash_repo(git_url=None, local_path=None)
    with pytest.raises(ValueError):
        hash_repo(git_url="", local_path="")
