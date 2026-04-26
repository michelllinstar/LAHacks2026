"""Symbol Analyst uAgent — wraps the Layer 1 retrieval/ranking pipeline."""

from __future__ import annotations

import logging
import os
from typing import Optional

from backend.models import FindContextRequest
from backend.query.engine import QueryEngine

from .protocols import SymbolGraph, SymbolQuery

logger = logging.getLogger(__name__)


def handle_symbol_query(query: SymbolQuery) -> SymbolGraph:
    """Synchronous helper used both by the uAgent handler and the Coordinator."""
    engine = QueryEngine(query.repo_hash)
    bundle = engine.find_relevant_context(
        FindContextRequest(
            task=query.task,
            seed_symbol=query.seed_symbol,
            repo_hash=query.repo_hash,
        )
    )
    return SymbolGraph(symbols=[s.model_dump() for s in bundle.relevant_symbols])


def build_agent(seed: Optional[str] = None, port: int = 8002):
    """Construct (but do not run) the Symbol Analyst uAgent."""
    from uagents import Agent, Context  # type: ignore

    agent = Agent(
        name="cartographer_symbol_analyst",
        seed=seed or os.getenv("SYMBOL_ANALYST_SEED", "cartographer-symbol-analyst-seed"),
        port=port,
        mailbox=False,
    )

    @agent.on_message(model=SymbolQuery, replies=SymbolGraph)
    async def _on_query(ctx: Context, sender: str, msg: SymbolQuery) -> None:
        try:
            reply = handle_symbol_query(msg)
        except Exception as exc:  # pragma: no cover
            logger.exception("Symbol Analyst error: %s", exc)
            reply = SymbolGraph(symbols=[])
        await ctx.send(sender, reply)

    return agent
