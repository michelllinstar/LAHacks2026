"""FastAPI route exposing the OmegaClaw skill entry point (SPEC §7.3).

POST /api/omegaclaw/query  — called by OmegaClaw / external skill runners.
GET  /api/omegaclaw/manifest — returns the skill manifest for registration.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.lib.omegaclaw import SKILL_MANIFEST, handle_query

router = APIRouter()


class SkillRequest(BaseModel):
    question: str
    repo_hash: str
    extras: dict | None = None


@router.post("/query")
def omegaclaw_query(req: SkillRequest) -> dict:
    return handle_query(req.question, req.repo_hash, extras=req.extras)


@router.get("/manifest")
def omegaclaw_manifest() -> dict:
    return SKILL_MANIFEST
