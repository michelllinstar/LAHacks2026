"""Coordinator uAgent — public ASI:One entry point that aggregates specialists.

For the MVP, Architecture / Flow / Invariant logic is inlined as method calls
on :class:`backend.query.engine.QueryEngine` rather than dispatched out to
separate specialist agents (see SPEC §7.2.5 hackathon scope reduction).
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from backend.lib import events as event_bus
from backend.models import FindContextRequest
from backend.query.engine import QueryEngine

from .protocols import UserQuery, UserResponse

logger = logging.getLogger(__name__)


def _classify(question: str) -> str:
    q = (question or "").lower()
    if "flow" in q or "taint" in q:
        return "trace_data_flow"
    if "invariant" in q or "constraint" in q:
        return "find_invariants"
    if "architecture" in q or "convention" in q:
        return "describe_architecture"
    if "exemplar" in q or "template" in q:
        return "find_exemplars"
    return "find_relevant_context"


def handle_user_query(query: UserQuery) -> UserResponse:
    query_id = uuid.uuid4().hex
    query_type = _classify(query.question)
    engine = QueryEngine(query.repo_hash)

    if query_type == "find_relevant_context":
        bundle = engine.find_relevant_context(
            FindContextRequest(task=query.question, repo_hash=query.repo_hash)
        )
        symbol_ids = [s.qualified_name for s in bundle.relevant_symbols]
        event_bus.publish(
            query.repo_hash,
            "agent_activity",
            {
                "query_id": query_id,
                "query_type": query_type,
                "cluster_id": bundle.region.cluster_id,
                "symbol_ids": symbol_ids,
            },
        )
        if symbol_ids:
            event_bus.publish(
                query.repo_hash,
                "region_highlighted",
                {
                    "node_ids": symbol_ids,
                    "color": "#ffb347",
                    "ttl_ms": 4000,
                },
            )
        return UserResponse(bundle=bundle.model_dump())

    # All other types currently degrade to empty responses for the MVP.
    return UserResponse(bundle={"query_type": query_type, "result": None})


def build_agent(seed: Optional[str] = None, port: int = 8001):
    from uagents import Agent, Context  # type: ignore

    agent = Agent(
        name="cartographer_coordinator",
        seed=seed or os.getenv("COORDINATOR_SEED", "cartographer-coordinator-seed"),
        port=port,
        mailbox=True,
    )

    @agent.on_message(model=UserQuery, replies=UserResponse)
    async def _on_query(ctx: Context, sender: str, msg: UserQuery) -> None:
        try:
            reply = handle_user_query(msg)
        except Exception as exc:  # pragma: no cover
            logger.exception("Coordinator error: %s", exc)
            reply = UserResponse(bundle={"error": str(exc)})
        await ctx.send(sender, reply)

    return agent
