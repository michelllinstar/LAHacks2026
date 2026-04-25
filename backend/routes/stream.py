"""Server-Sent-Events stream of indexing/agent activity for a repo."""

from __future__ import annotations

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Query
from sse_starlette.sse import EventSourceResponse

from backend.lib import events as event_bus

router = APIRouter()


@router.get("")
async def stream(repo: str = Query(..., description="repo hash to subscribe to")):
    async def _events() -> AsyncGenerator[dict, None]:
        async for item in event_bus.subscribe(repo):
            yield {
                "event": item["event"],
                "data": json.dumps(item["data"], default=str),
            }

    return EventSourceResponse(_events())
