"""JWT cookie guard for the protected REST surface."""
from __future__ import annotations

import os
from typing import Optional

import jwt
from fastapi import Cookie, HTTPException

_DEFAULT_SECRET = "dev-secret-token"


def _secret() -> str:
    """Return the JWT signing secret, fail-closed when unset.

    The dev default is only accepted when ``CARTOGRAPHER_DEV=1`` is set so
    accidental missing-env deployments don't silently authenticate everyone.
    """
    s = os.getenv("JWT_SECRET")
    if not s:
        if os.getenv("CARTOGRAPHER_DEV") == "1":
            return _DEFAULT_SECRET
        raise RuntimeError(
            "JWT_SECRET is unset; refusing to issue/validate tokens"
        )
    return s


def require_session(
    agentverse_session: Optional[str] = Cookie(default=None),
) -> dict:
    """FastAPI dependency: return decoded JWT claims or raise 401."""
    if not agentverse_session:
        raise HTTPException(status_code=401, detail="not authenticated")
    try:
        claims = jwt.decode(agentverse_session, _secret(), algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=401, detail=f"invalid session: {exc}"
        ) from None
    # Defence in depth: agent-callback tokens are signed with the same secret
    # but issued for a different audience. Reject them here so they can't be
    # replayed as a session cookie to reach mutating routes.
    if claims.get("iss") == "cartographer-agent-token":
        raise HTTPException(
            status_code=401, detail="agent token cannot be used as a session"
        )
    return claims
