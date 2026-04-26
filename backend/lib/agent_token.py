"""Short-lived, scoped tokens for external agents to call back into Cartographer.

When the backend dispatches a registered external agent, it mints one of these
and embeds it in the POST body. The agent uses it to issue read-only queries
back to ``/api/agent-query/*`` during its reasoning loop. The token is bound
to a specific ``repo_hash`` and scope (only ``"read"`` exists today), and
expires in five minutes — well past the 30 s outer dispatch timeout.

This is deliberately separate from ``auth_guard.require_session``: that gate
expects a browser cookie and grants access to mutating routes (repo create,
agent runs, etc.). Agent tokens are for read-only callbacks from third-party
runtimes we do not trust to behave like a logged-in user.
"""

from __future__ import annotations

import os
import time
from typing import Literal

import jwt

Scope = Literal["read"]

_ISS = "cartographer-agent-token"
_TTL_SECONDS = 5 * 60


def _secret() -> str:
    """Reuse the platform JWT secret. Mirrors ``auth_guard._secret`` semantics
    so misconfigured deployments fail closed instead of silently signing with
    a default."""
    s = os.getenv("JWT_SECRET")
    if not s:
        if os.getenv("CARTOGRAPHER_DEV") == "1":
            return "dev-secret-token"
        raise RuntimeError(
            "JWT_SECRET is unset; refusing to mint/verify agent tokens"
        )
    return s


def mint(repo_hash: str, scope: Scope = "read", ttl_seconds: int = _TTL_SECONDS) -> str:
    now = int(time.time())
    claims = {
        "iss": _ISS,
        "iat": now,
        "exp": now + ttl_seconds,
        "repo_hash": repo_hash,
        "scope": scope,
    }
    return jwt.encode(claims, _secret(), algorithm="HS256")


def verify(token: str) -> dict:
    """Decode + validate. Raises ``jwt.PyJWTError`` on any failure (caller
    converts to an HTTP error). Confirms ``iss`` to keep these tokens from
    being confused with session JWTs signed by the same secret."""
    claims = jwt.decode(token, _secret(), algorithms=["HS256"])
    if claims.get("iss") != _ISS:
        raise jwt.InvalidTokenError("wrong issuer for agent token")
    if claims.get("scope") not in {"read"}:
        raise jwt.InvalidTokenError("unsupported scope")
    if not isinstance(claims.get("repo_hash"), str):
        raise jwt.InvalidTokenError("missing repo_hash")
    return claims
