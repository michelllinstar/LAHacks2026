"""Bureau entry point that runs the three Cartographer uAgents together."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(_ROOT / ".env.local")

from . import (
    architecture_analyst,
    coordinator,
    flow_analyst,
    indexer_agent,
    invariant_reporter,
    symbol_analyst,
)

logger = logging.getLogger(__name__)


def run() -> None:
    try:
        from uagents import Bureau  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise SystemExit(f"uagents SDK is required to run the bureau: {exc}") from exc

    bureau = Bureau(
        endpoint=os.getenv("AGENT_BUREAU_ENDPOINT", "http://127.0.0.1:8001/submit"),
        port=int(os.getenv("AGENT_BUREAU_PORT", "8001")),
    )
    bureau.add(coordinator.build_agent())
    bureau.add(symbol_analyst.build_agent())
    bureau.add(indexer_agent.build_agent())
    bureau.add(flow_analyst.build_agent())
    bureau.add(architecture_analyst.build_agent())
    bureau.add(invariant_reporter.build_agent())
    bureau.run()


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    run()
