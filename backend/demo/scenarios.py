"""Default demo scenarios — the SPEC §11 'panel of five tasks' shown on the
closing slide of the demo to demonstrate the result is not cherry-picked.

Each scenario is a plain dict with two keys:
  - ``id``: a short stable identifier used in tabular reports.
  - ``task``: a natural-language task description fed verbatim to the
    Query Engine's ``find_relevant_context`` and to the baseline simulator.

Callers are free to override this list (e.g. via a JSON file passed to
``scripts/run_demo.py``); these are the defaults used when none is provided.
"""

from __future__ import annotations

DEFAULT_SCENARIOS: list[dict] = [
    {
        "id": "rate_limit",
        "task": (
            "add request rate limiting to all public API endpoints, following "
            "the existing middleware conventions"
        ),
    },
    {
        "id": "log_redact",
        "task": "redact password fields from log statements",
    },
    {
        "id": "auth_refactor",
        "task": "extract the auth middleware into a reusable module",
    },
    {
        "id": "test_coverage",
        "task": "add unit tests for the user service module",
    },
    {
        "id": "feature_flag",
        "task": "add a feature flag for the new search endpoint",
    },
]
