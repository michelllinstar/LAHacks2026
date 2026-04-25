"""Layer 3 _name_tokens tokenization tests."""

from __future__ import annotations

from backend.indexer.layer3_clusters import _name_tokens


def test_camel_case_split():
    tokens = _name_tokens("UserService.ts")
    assert "user" in tokens
    assert "service" in tokens


def test_snake_case_split():
    tokens = _name_tokens("user_service.py")
    assert "user" in tokens
    assert "service" in tokens


def test_kebab_case_split():
    tokens = _name_tokens("user-service.tsx")
    assert "user" in tokens
    assert "service" in tokens


def test_acronym_camel_case_split():
    # HTTPServer should split as HTTP + Server
    tokens = _name_tokens("HTTPServer.ts")
    assert "http" in tokens
    assert "server" in tokens


def test_extension_stripped():
    tokens = _name_tokens("auth.py")
    assert "py" not in tokens
    assert "auth" in tokens


def test_directory_components_ignored():
    # only the basename's tokens (without extension) are returned
    tokens = _name_tokens("backend/routes/repos.py")
    assert tokens == {"repos"}


def test_empty_path():
    assert _name_tokens("") == set()
