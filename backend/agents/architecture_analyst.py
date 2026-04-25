"""Architecture Analyst uAgent — wraps Layer 3 ``describe_architecture`` and
``find_exemplars`` queries.

Mirrors :mod:`backend.agents.flow_analyst`: synchronous helpers used both
in-process by the Coordinator (per SPEC §7.2.5) and by the registered uAgent
``on_message`` handler. ``uagents`` is imported lazily inside ``build_agent``
so this module can be imported even when the SDK is not installed.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from backend.models import ArchRequest, ExemplarRequest
from backend.query.engine import QueryEngine

from .protocols import ArchGraph, ArchQuery

logger = logging.getLogger(__name__)


def handle_arch_query(repo_hash: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Synchronous helper for ``describe_architecture``.

    Accepts ``{"repo_hash": ..., "path": ..., "cluster_id": ...}``. The
    explicit ``repo_hash`` argument takes precedence over ``payload``.
    """
    path = payload.get("path")
    cluster_id = payload.get("cluster_id")
    if cluster_id is not None:
        cluster_id = str(cluster_id)
    engine = QueryEngine(repo_hash)
    req = ArchRequest(path=path, cluster_id=cluster_id, repo_hash=repo_hash)
    response = engine.describe_architecture(req)
    return {
        "cluster": response.cluster.model_dump(),
        "member_files": list(response.member_files),
    }


def handle_exemplar_query(repo_hash: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Synchronous helper for ``find_exemplars``.

    Accepts ``{"repo_hash": ..., "task": ..., "cluster_id": ...}``.
    """
    task = payload.get("task") or ""
    cluster_id = payload.get("cluster_id")
    if cluster_id is None:
        return {"files": []}
    engine = QueryEngine(repo_hash)
    req = ExemplarRequest(task=task, cluster_id=str(cluster_id), repo_hash=repo_hash)
    response = engine.find_exemplars(req)
    return {"files": [exemplar.model_dump() for exemplar in response.files]}


def build_agent(seed: Optional[str] = None, port: int = 8005):
    """Construct (but do not run) the Architecture Analyst uAgent."""
    from uagents import Agent, Context  # type: ignore

    agent = Agent(
        name="cartographer_architecture_analyst",
        seed=seed
        or os.getenv("ARCH_ANALYST_SEED", "cartographer-architecture-analyst-seed"),
        port=port,
        mailbox=True,
    )

    @agent.on_message(model=ArchQuery, replies=ArchGraph)
    async def _on_query(ctx: Context, sender: str, msg: ArchQuery) -> None:
        try:
            result = handle_arch_query(
                msg.repo_hash,
                {
                    "path": msg.path,
                    "cluster_id": msg.cluster_id,
                },
            )
            reply = ArchGraph(
                cluster=result.get("cluster", {}),
                member_files=list(result.get("member_files", [])),
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Architecture Analyst error: %s", exc)
            reply = ArchGraph(cluster={}, member_files=[])
        await ctx.send(sender, reply)

    return agent
