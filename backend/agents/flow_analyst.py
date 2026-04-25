"""Flow Analyst uAgent — wraps the Layer 2 trace_data_flow query.

Mirrors :mod:`backend.agents.symbol_analyst`: a synchronous helper used both
in-process by the Coordinator (per SPEC §7.2.5) and by the registered uAgent
``on_message`` handler. ``uagents`` is imported lazily inside ``build_agent``
so this module can be imported even when the SDK is not installed.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from backend.models import FlowRequest
from backend.query.engine import QueryEngine

from .protocols import FlowGraph, FlowQuery

logger = logging.getLogger(__name__)


def handle_flow_query(repo_hash: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Synchronous helper used both by the uAgent handler and the Coordinator.

    Accepts a payload of the form
    ``{"repo_hash": ..., "symbol": ..., "direction": "forward"|"backward", "depth": int}``.
    The ``repo_hash`` argument takes precedence over ``payload["repo_hash"]`` so
    callers can pass it explicitly without duplicating it in the payload.
    """
    symbol = payload.get("symbol") or ""
    direction = payload.get("direction") or "forward"
    if direction not in ("forward", "backward"):
        direction = "forward"
    depth = int(payload.get("depth") or 3)
    engine = QueryEngine(repo_hash)
    result = engine.trace_data_flow(
        FlowRequest(
            symbol=symbol,
            direction=direction,
            depth=depth,
            repo_hash=repo_hash,
        )
    )
    # Engine returns {"flows": [...]} already in FlowPath wire shape.
    return result


def build_agent(seed: Optional[str] = None, port: int = 8004):
    """Construct (but do not run) the Flow Analyst uAgent."""
    from uagents import Agent, Context  # type: ignore

    agent = Agent(
        name="cartographer_flow_analyst",
        seed=seed or os.getenv("FLOW_ANALYST_SEED", "cartographer-flow-analyst-seed"),
        port=port,
        mailbox=True,
    )

    @agent.on_message(model=FlowQuery, replies=FlowGraph)
    async def _on_query(ctx: Context, sender: str, msg: FlowQuery) -> None:
        try:
            result = handle_flow_query(
                msg.repo_hash,
                {
                    "symbol": msg.symbol,
                    "direction": msg.direction,
                    "depth": msg.depth,
                },
            )
            reply = FlowGraph(flows=list(result.get("flows", [])))
        except Exception as exc:  # pragma: no cover
            logger.exception("Flow Analyst error: %s", exc)
            reply = FlowGraph(flows=[])
        await ctx.send(sender, reply)

    return agent
