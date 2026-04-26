"""Tests for the demo harness (backend/demo/harness.py).

The harness is a thin wrapper over ``db_store.iter_files`` and
``QueryEngine.find_relevant_context``; we mock both so these tests run
without a live Mongo. The goal is to lock in the public API shape and
the chars/4 token math so the demo-day numbers stay reproducible.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.demo import harness
from backend.demo.harness import (
    baseline_metrics,
    cartographer_metrics,
    estimate_tokens,
    run_all,
    run_scenario,
)
from backend.models import (
    ContextBundle,
    Exemplar,
    FlowPath,
    Region,
    RelevantSymbol,
)


def _make_bundle(
    *,
    notes: list[str] | None = None,
    symbols: list[RelevantSymbol] | None = None,
) -> ContextBundle:
    return ContextBundle(
        region=Region(role="api", conventions={}, dependencies={}),
        exemplars=[Exemplar(file_path="/tmp/a.py", reason="seed")],
        relevant_symbols=symbols or [],
        flows=[],
        notes=notes or [],
    )


def test_estimate_tokens():
    # Empty string -> 0 (no work to do).
    assert estimate_tokens("") == 0
    # Floor of len/4, with a 1-token minimum for anything non-empty.
    assert estimate_tokens("a") == 1
    assert estimate_tokens("abc") == 1
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("a" * 8) == 2
    assert estimate_tokens("a" * 100) == 25


def test_baseline_metrics_empty_repo():
    """No files in the index → zero tokens and zero files; never raises."""
    with patch.object(harness.db_store, "iter_files", return_value=[]):
        out = baseline_metrics("deadbeef0000", "anything")
    assert out == {"tokens": 0, "files_read": 0, "files_total": 0}


def test_run_scenario_aggregates(tmp_path):
    """Per-scenario shape + ratio = baseline / cartographer."""
    # Stage two real files on disk so baseline reads can succeed.
    f1 = tmp_path / "one.py"
    f2 = tmp_path / "two.py"
    f1.write_text("x" * 400)  # 100 tokens
    f2.write_text("y" * 800)  # 200 tokens

    fake_files = [
        {"file_path": str(f1), "last_modified": 2},
        {"file_path": str(f2), "last_modified": 1},
    ]

    fake_bundle = _make_bundle(notes=["region scoping applied"])

    with patch.object(harness.db_store, "iter_files", return_value=fake_files):
        with patch(
            "backend.demo.harness.QueryEngine.find_relevant_context",
            return_value=fake_bundle,
        ):
            res = run_scenario(
                "deadbeef0000",
                {"id": "demo", "task": "do the thing"},
            )

    assert res["id"] == "demo"
    assert res["task"] == "do the thing"
    assert "baseline" in res and "cartographer" in res
    assert res["baseline"]["tokens"] == 300  # 100 + 200
    assert res["baseline"]["files_read"] == 2
    assert res["baseline"]["files_total"] == 2
    # Ratio is exactly baseline / max(1, cartographer).
    expected_ratio = res["baseline"]["tokens"] / max(
        1, res["cartographer"]["tokens"]
    )
    assert res["ratio"] == pytest.approx(expected_ratio)
    assert res["cartographer"]["tokens"] > 0


def test_run_all_handles_errors():
    """One failing scenario must not crash the suite; sentinel error returned."""
    scenarios = [
        {"id": "ok", "task": "first"},
        {"id": "boom", "task": "second"},
    ]

    fake_bundle = _make_bundle()

    call_count = {"n": 0}

    def flaky_find(self, req):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("simulated engine failure")
        return fake_bundle

    with patch.object(harness.db_store, "iter_files", return_value=[]):
        with patch(
            "backend.demo.harness.QueryEngine.find_relevant_context",
            new=flaky_find,
        ):
            report = run_all("deadbeef0000", scenarios)

    assert report["repo_hash"] == "deadbeef0000"
    assert len(report["scenarios"]) == 2

    ok = report["scenarios"][0]
    assert "error" not in ok
    assert ok["id"] == "ok"

    # The failing scenario is captured as a sentinel error inside
    # cartographer_metrics rather than bubbling out of run_scenario; either
    # the scenario carries an "error" key OR its cartographer block does.
    boom = report["scenarios"][1]
    assert boom["id"] == "boom"
    cart_errored = isinstance(boom.get("cartographer"), dict) and boom[
        "cartographer"
    ].get("error")
    scenario_errored = "error" in boom
    assert cart_errored or scenario_errored

    # Aggregate is always present and finite.
    assert "aggregate" in report
    assert report["aggregate"]["scenarios_run"] == 2
