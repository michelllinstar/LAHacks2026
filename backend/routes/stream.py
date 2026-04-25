"""Server-Sent-Events stream of indexing/agent activity for a repo."""

from __future__ import annotations

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Query
from sse_starlette.sse import EventSourceResponse

from backend.lib import events as event_bus
from backend.lib.auth_guard import require_session

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("")
async def stream(repo: str = Query(..., description="repo hash to subscribe to")):
    async def _events() -> AsyncGenerator[dict, None]:
        async for item in event_bus.subscribe(repo):
            yield {
                "event": item["event"],
                "data": json.dumps(item["data"], default=str),
            }

    return EventSourceResponse(_events())
