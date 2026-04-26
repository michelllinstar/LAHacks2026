"""Demo Harness — head-to-head metrics simulator (SPEC §3.1, §11, §14.1).

The harness drives a fixed panel of tasks against an indexed repository and
computes a token-count proxy for two paths:

  * **Baseline** — a grep-and-read agent that has to slurp file contents to
    find what's relevant. Modeled as the sum of ``len(file_contents) // 4``
    across every file recorded in the repo's ``files`` collection.
  * **Cartographer-enabled** — the Query Engine's ``find_relevant_context``
    bundle, serialized to JSON; the same ``// 4`` proxy applied.

This is intentionally a deterministic simulation rather than a live
two-agent shootout: a real shootout is too expensive and too noisy for
demo day, and the chars/4 proxy is what the §14.1 "≥5x token reduction"
headline number is reported against. Judges can verify the numbers by
re-running the script.

Public API:

* ``estimate_tokens`` — chars/4 token approximation.
* ``baseline_metrics`` — simulate grep-and-read cost for a repo + task.
* ``cartographer_metrics`` — query the engine and measure the bundle.
* ``run_scenario`` — run one scenario through both paths.
* ``run_all``       — run a panel of scenarios and aggregate.

Every function is defensive: on any failure (Mongo unreachable, repo not
indexed, file missing on disk) we record a sentinel error rather than
raising, so the demo can still produce a report.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

from backend.db import store as db_store
from backend.models import FindContextRequest
from backend.query.engine import QueryEngine

from .scenarios import DEFAULT_SCENARIOS

# Industry rule of thumb: ~4 characters per token for English source code.
# We deliberately do NOT pull in tiktoken — the proxy is what's reported.
_CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    """Cheap token approximation: ~4 chars per token (industry rule of thumb).

    Always returns at least 1 for any non-empty string so a tiny payload
    never collapses to a zero divisor downstream.
    """
    if not text:
        return 0
    return max(1, len(text) // _CHARS_PER_TOKEN)


def _read_file_text(path: str) -> Optional[str]:
    """Best-effort file read; returns None if the file is missing or binary."""
    if not path:
        return None
    try:
        # ``errors='ignore'`` keeps binary-ish files (rare in source repos)
        # from blowing up the harness; we under-count their tokens slightly,
        # which is fine for a demo proxy.
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except (OSError, ValueError):
        return None


def baseline_metrics(
    repo_hash: str,
    task: str,
    *,
    top_k: Optional[int] = None,
) -> dict[str, Any]:
    """Simulate a grep-and-read agent's exploration cost for ``task``.

    The model: a baseline agent without architectural awareness ends up
    reading most of the repository to figure out what's relevant. We sum
    the chars/4 token cost across every file recorded in the index's
    ``files`` collection.

    If ``top_k`` is provided, sample the K most-recently-modified files
    (closer to a "smarter" grep agent that follows recency hints). This
    exists for sensitivity analysis; the default panel runs without it.

    The ``task`` argument is accepted but unused — a baseline agent's
    exploration cost is roughly task-independent for our proxy. We keep
    the parameter so the signature mirrors ``cartographer_metrics``.

    Returns a dict with ``tokens`` (int), ``files_read`` (int — files we
    actually managed to open), and ``files_total`` (int — files in the
    index). On any error returns ``{"error": str, "tokens": 0, ...}``.
    """
    del task  # signature parity with cartographer_metrics; see docstring.

    try:
        files = db_store.iter_files(repo_hash)
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "error": f"iter_files failed: {exc}",
            "tokens": 0,
            "files_read": 0,
            "files_total": 0,
        }

    files_total = len(files)
    if not files:
        return {"tokens": 0, "files_read": 0, "files_total": 0}

    # Optional top-K-by-recency sample.
    if top_k is not None and top_k > 0 and len(files) > top_k:
        files = sorted(
            files,
            key=lambda f: f.get("last_modified") or 0,
            reverse=True,
        )[:top_k]

    total_tokens = 0
    files_read = 0
    for f in files:
        path = f.get("file_path") or ""
        text = _read_file_text(path)
        files_read += 1
        if text is None:
            # File moved/perms/etc — count as zero tokens but still
            # increment files_read since the agent tried to look.
            continue
        total_tokens += estimate_tokens(text)

    return {
        "tokens": total_tokens,
        "files_read": files_read,
        "files_total": files_total,
    }


def cartographer_metrics(repo_hash: str, task: str) -> dict[str, Any]:
    """Run ``find_relevant_context`` and measure the resulting bundle.

    Token cost is computed against the JSON-serialized bundle, which is
    what an MCP-connected coding agent actually receives.

    Returns ``tokens``, ``files_read`` (distinct ``file_path`` values in
    ``relevant_symbols``), ``bundle_summary`` (compact stats for the
    report), and ``notes`` from the engine. On any error returns a
    sentinel ``{"error": ...}`` dict so the suite keeps moving.
    """
    try:
        engine = QueryEngine(repo_hash)
        bundle = engine.find_relevant_context(
            FindContextRequest(task=task, repo_hash=repo_hash)
        )
    except Exception as exc:
        return {
            "error": f"find_relevant_context failed: {exc}",
            "tokens": 0,
            "files_read": 0,
            "bundle_summary": {},
            "notes": [],
        }

    try:
        # ``model_dump`` gives a JSON-safe dict; ``default=str`` is a belt-
        # and-braces guard for stray ObjectIds the engine forgot to stringify.
        payload = bundle.model_dump()
        serialized = json.dumps(payload, default=str)
    except Exception as exc:
        return {
            "error": f"bundle serialization failed: {exc}",
            "tokens": 0,
            "files_read": 0,
            "bundle_summary": {},
            "notes": [],
        }

    relevant = payload.get("relevant_symbols", []) or []
    distinct_files = {
        s.get("file_path", "") for s in relevant if s.get("file_path")
    }

    summary = {
        "relevant_symbols": len(relevant),
        "exemplars": len(payload.get("exemplars", []) or []),
        "flows": len(payload.get("flows", []) or []),
        "has_region": bool(
            payload.get("region", {}).get("cluster_id")
            or payload.get("region", {}).get("role")
        ),
        "bundle_chars": len(serialized),
    }

    return {
        "tokens": estimate_tokens(serialized),
        "files_read": len(distinct_files),
        "bundle_summary": summary,
        "notes": payload.get("notes", []) or [],
    }


def run_scenario(repo_hash: str, scenario: dict) -> dict[str, Any]:
    """Run one task through both paths and return per-scenario metrics.

    The returned dict always carries ``id`` and ``task`` for table
    rendering. On a fatal error the dict carries an ``error`` key
    instead of ``baseline``/``cartographer``/``ratio``.
    """
    sid = scenario.get("id", "unknown")
    task = scenario.get("task", "")
    if not task:
        return {"id": sid, "task": task, "error": "missing task"}

    try:
        baseline = baseline_metrics(repo_hash, task)
        cart = cartographer_metrics(repo_hash, task)
    except Exception as exc:  # pragma: no cover - defensive
        return {"id": sid, "task": task, "error": str(exc)}

    if "error" in baseline and "error" in cart:
        return {
            "id": sid,
            "task": task,
            "error": f"baseline+cart failed: {baseline['error']} / {cart['error']}",
        }

    b_tokens = int(baseline.get("tokens", 0) or 0)
    c_tokens = int(cart.get("tokens", 0) or 0)
    ratio = b_tokens / max(1, c_tokens)

    return {
        "id": sid,
        "task": task,
        "baseline": baseline,
        "cartographer": cart,
        "ratio": ratio,
    }


def run_all(
    repo_hash: str,
    scenarios: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """Run the full scenario suite and produce per-scenario + aggregate metrics.

    The aggregate is a sum-of-tokens-across-scenarios ratio rather than an
    average of ratios — this matches what the closing demo slide shows
    (total saved tokens, not "mean fold reduction").
    """
    panel = scenarios if scenarios is not None else DEFAULT_SCENARIOS
    results: list[dict] = []
    agg_baseline = 0
    agg_cart = 0

    for scn in panel:
        res = run_scenario(repo_hash, scn)
        results.append(res)
        if "error" in res:
            continue
        agg_baseline += int(res["baseline"].get("tokens", 0) or 0)
        agg_cart += int(res["cartographer"].get("tokens", 0) or 0)

    aggregate = {
        "baseline_tokens": agg_baseline,
        "cartographer_tokens": agg_cart,
        "ratio": agg_baseline / max(1, agg_cart),
        "scenarios_run": len(results),
        "scenarios_errored": sum(1 for r in results if "error" in r),
    }

    return {
        "repo_hash": repo_hash,
        "scenarios": results,
        "aggregate": aggregate,
    }
