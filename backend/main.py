"""FastAPI entry point for the Cartographer backend."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.store import get_db, init_control_db
from backend.routes import auth, graph, index, query, repos, stream

# Load .env first as the canonical config (matches .env.example), then let
# .env.local override any values for local-dev customization without editing
# the tracked file. python-dotenv silently no-ops when a file is absent.
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / ".env.local", override=True)

app = FastAPI(title="Codebase Cartographer Backend", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth")
app.include_router(repos.router, prefix="/api/repos")
app.include_router(index.router, prefix="/api/repos")
app.include_router(graph.router, prefix="/api/repos")
app.include_router(query.router, prefix="/api/query")
app.include_router(stream.router, prefix="/api/stream")


@app.on_event("startup")
def _on_startup() -> None:
    try:
        init_control_db()
    except Exception as exc:  # pragma: no cover
        # Defer connection failure to first use so the service still imports
        # cleanly when MongoDB is unreachable at startup.
        import logging

        logging.getLogger(__name__).warning(
            "MongoDB unreachable at startup (%s); will retry on first request",
            exc,
        )


@app.get("/health")
def health_check() -> dict:
    """Liveness + Mongo reachability probe.

    Returns ``{"status": "ok", "mongo": "reachable"}`` when the DB is up,
    or ``{"status": "ok", "mongo": "unreachable", "error": <msg>}`` so a
    monitoring system can distinguish "process alive but DB down" from a
    plain crash. The HTTP status stays 200 either way — clients should
    inspect ``mongo`` to decide.
    """
    try:
        get_db().command("ping")
        return {"status": "ok", "mongo": "reachable"}
    except Exception as exc:  # pragma: no cover
        return {"status": "ok", "mongo": "unreachable", "error": str(exc)[:200]}
