"""Invariant Reporter uAgent — wraps the Layer 4 ``find_invariants`` query.

Mirrors :mod:`backend.agents.flow_analyst` and
:mod:`backend.agents.architecture_analyst`: a synchronous helper used both
in-process by the Coordinator (per SPEC §7.2.5) and by the registered uAgent
``on_message`` handler. ``uagents`` is imported lazily inside ``build_agent``
so this module can be imported even when the SDK is not installed.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from backend.models import InvariantRequest
from backend.query.engine import QueryEngine

from .protocols import InvariantGraph, InvariantQuery

logger = logging.getLogger(__name__)


def handle_invariant_query(repo_hash: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Synchronous helper for ``find_invariants``.

    Accepts ``{"repo_hash": ..., "symbol": ..., "cluster_id": ...,
    "min_confidence": ...}``. The explicit ``repo_hash`` argument takes
    precedence over ``payload``.
    """
    symbol = payload.get("symbol") or None
    cluster_id = payload.get("cluster_id")
    if cluster_id is not None:
        cluster_id = str(cluster_id)
    try:
        min_confidence = float(payload.get("min_confidence") or 0.0)
    except (TypeError, ValueError):
        min_confidence = 0.0
    engine = QueryEngine(repo_hash)
    req = InvariantRequest(
        symbol=symbol,
        cluster_id=cluster_id,
        min_confidence=min_confidence,
        repo_hash=repo_hash,
    )
    invariants = engine.find_invariants(req)
    return {"invariants": list(invariants)}


def build_agent(seed: Optional[str] = None, port: int = 8006):
    """Construct (but do not run) the Invariant Reporter uAgent."""
    from uagents import Agent, Context  # type: ignore

    agent = Agent(
        name="cartographer_invariant_reporter",
        seed=seed
        or os.getenv("INVARIANT_REPORTER_SEED", "cartographer-invariant-reporter-seed"),
        port=port,
        mailbox=True,
    )

    @agent.on_message(model=InvariantQuery, replies=InvariantGraph)
    async def _on_query(ctx: Context, sender: str, msg: InvariantQuery) -> None:
        try:
            result = handle_invariant_query(
                msg.repo_hash,
                {
                    "symbol": msg.symbol,
                    "cluster_id": msg.cluster_id,
                    "min_confidence": msg.min_confidence,
                },
            )
            reply = InvariantGraph(invariants=list(result.get("invariants", [])))
        except Exception as exc:  # pragma: no cover
            logger.exception("Invariant Reporter error: %s", exc)
            reply = InvariantGraph(invariants=[])
        await ctx.send(sender, reply)

    return agent
