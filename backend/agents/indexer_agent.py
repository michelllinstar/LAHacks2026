"""Indexer uAgent — receives ``IndexRepo`` and runs the indexer runner."""

from __future__ import annotations

import logging
import os
from typing import Optional

from backend.indexer.runner import run_index
from backend.lib import events as event_bus

from .protocols import IndexProgress, IndexRepo

logger = logging.getLogger(__name__)


def build_agent(seed: Optional[str] = None, port: int = 8003):
    from uagents import Agent, Context  # type: ignore

    agent = Agent(
        name="cartographer_indexer",
        seed=seed or os.getenv("INDEXER_SEED", "cartographer-indexer-seed"),
        port=port,
        mailbox=True,
    )

    @agent.on_message(model=IndexRepo, replies=IndexProgress)
    async def _on_index(ctx: Context, sender: str, msg: IndexRepo) -> None:
        emit = event_bus.make_emitter(msg.repo_hash)

        def _emit_and_forward(event_name: str, payload: dict) -> None:
            emit(event_name, payload)
            # Forward index_progress events back to the sender as IndexProgress.
            if event_name == "index_progress":
                # Fire-and-forget; we cannot await inside a sync emitter cleanly.
                ctx.logger.info(
                    "index_progress repo=%s layer=%s state=%s count=%s",
                    msg.repo_hash,
                    payload.get("layer"),
                    payload.get("state"),
                    payload.get("count"),
                )

        try:
            run_index(msg.repo_hash, msg.repo_path, emit=_emit_and_forward)
        except Exception as exc:  # pragma: no cover
            logger.exception("indexer agent failure: %s", exc)
        await ctx.send(
            sender,
            IndexProgress(
                repo_hash=msg.repo_hash,
                layer="invariant",
                state="done",
                count=0,
            ),
        )

    return agent
