"""Coordinator _classify keyword classifier tests (9-case audit suite)."""

from __future__ import annotations

import pytest

from backend.agents.coordinator import _classify


@pytest.mark.parametrize(
    "question, expected",
    [
        # 1. exemplar/template — beats everything else
        ("show me an exemplar handler", "find_exemplars"),
        ("give me a template for a new route", "find_exemplars"),
        # 2. invariant beats cluster (specificity ordering)
        ("what invariants apply to the user cluster?", "find_invariants"),
        ("list constraints on the auth module", "find_invariants"),
        # 3. architecture/convention/cluster/region beats flow
        ("describe the data flow architecture", "describe_architecture"),
        ("what conventions does this repo follow?", "describe_architecture"),
        # 4. flow/taint/trace fallback
        ("trace data flow from auth.login", "trace_data_flow"),
        ("show me the taint path for tokens", "trace_data_flow"),
        # 5. default
        ("how do I add rate limiting?", "find_relevant_context"),
    ],
)
def test_classifier_routes(question, expected):
    assert _classify(question) == expected


def test_empty_question_defaults_to_find_relevant_context():
    assert _classify("") == "find_relevant_context"
    assert _classify(None) == "find_relevant_context"
