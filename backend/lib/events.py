"""In-process pub/sub event bus keyed by repo hash.

Used by the indexer runner, query engine, and agent layer to publish progress
updates that the SSE route fans out to the Visualization Frontend.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, AsyncGenerator


_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
_lock = asyncio.Lock()


async def subscribe(repo_hash: str) -> AsyncGenerator[dict[str, Any], None]:
    """Async generator yielding ``{"event": name, "data": payload}`` dicts."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=1024)
    async with _lock:
        _subscribers[repo_hash].append(queue)
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
    finally:
        async with _lock:
            if queue in _subscribers.get(repo_hash, []):
                _subscribers[repo_hash].remove(queue)


def publish(repo_hash: str, event_name: str, payload: dict[str, Any]) -> None:
    """Publish an event to all subscribers for ``repo_hash`` (non-blocking)."""
    item = {"event": event_name, "data": payload}
    for queue in list(_subscribers.get(repo_hash, [])):
        try:
            queue.put_nowait(item)
        except asyncio.QueueFull:
            pass


async def publish_async(repo_hash: str, event_name: str, payload: dict[str, Any]) -> None:
    """Async variant for use inside coroutines (same semantics as ``publish``)."""
    publish(repo_hash, event_name, payload)


def make_emitter(repo_hash: str):
    """Return a callable ``emit(event_name, payload)`` bound to ``repo_hash``."""

    def _emit(event_name: str, payload: dict[str, Any]) -> None:
        publish(repo_hash, event_name, payload)

    return _emit
