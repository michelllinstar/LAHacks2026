"""Unit tests for backend.lib.auth_guard."""
from __future__ import annotations

import jwt
import pytest
from fastapi import HTTPException

from backend.lib import auth_guard
from backend.lib.auth_guard import _DEFAULT_SECRET, _secret, require_session


def test_require_session_missing_cookie_raises_401():
    with pytest.raises(HTTPException) as exc:
        require_session(agentverse_session=None)
    assert exc.value.status_code == 401


def test_require_session_malformed_cookie_raises_401(monkeypatch):
    monkeypatch.setenv("CARTOGRAPHER_DEV", "1")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(HTTPException) as exc:
        require_session(agentverse_session="not-a-jwt")
    assert exc.value.status_code == 401


def test_require_session_returns_claims_for_valid_token(monkeypatch):
    monkeypatch.setenv("CARTOGRAPHER_DEV", "1")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    token = jwt.encode({"sub": "u1", "email": "a@b.c"}, _DEFAULT_SECRET, algorithm="HS256")
    claims = require_session(agentverse_session=token)
    assert claims["sub"] == "u1"
    assert claims["email"] == "a@b.c"


def test_secret_raises_when_jwt_secret_and_dev_unset(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("CARTOGRAPHER_DEV", raising=False)
    with pytest.raises(RuntimeError):
        _secret()
