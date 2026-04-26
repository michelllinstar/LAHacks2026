"""Demo Harness package — head-to-head metrics for the Cartographer demo.

See SPEC §3.1 (component overview) and §11 (Demo Plan) for the role of this
module: a deterministic, token-count-proxy comparison between a baseline
grep-and-read agent and the Cartographer-enabled flow.
"""

from .harness import (
    baseline_metrics,
    cartographer_metrics,
    estimate_tokens,
    run_all,
    run_scenario,
)
from .scenarios import DEFAULT_SCENARIOS

__all__ = [
    "DEFAULT_SCENARIOS",
    "baseline_metrics",
    "cartographer_metrics",
    "estimate_tokens",
    "run_all",
    "run_scenario",
]
