"""Run the Cartographer demo harness against an indexed repo and print a report.

Usage:
    python scripts/run_demo.py <repo_hash>            # pretty table
    python scripts/run_demo.py <repo_hash> --json     # raw JSON
    python scripts/run_demo.py <repo_hash> --scenarios path/to/panel.json

The script wires SPEC §11's panel-of-five evaluation into a single command
so the demo can produce its closing-slide numbers in one shot. The repo
must already be indexed (``backend.indexer``) — the harness queries the
existing ``cartographer`` Mongo database and reads file contents off disk.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make the repo root importable when invoked as ``python scripts/run_demo.py``
# (without ``-m``). When invoked as ``python -m scripts.run_demo`` this is a
# no-op because the parent is already on sys.path.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.demo.harness import run_all  # noqa: E402
from backend.demo.scenarios import DEFAULT_SCENARIOS  # noqa: E402


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Cartographer demo harness against an indexed repo.",
    )
    parser.add_argument("repo_hash", help="The 12-hex repo hash to query")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of a human-readable table",
    )
    parser.add_argument(
        "--scenarios",
        help=(
            "Path to a JSON file with scenarios "
            "(defaults to backend/demo/scenarios.py:DEFAULT_SCENARIOS)"
        ),
    )
    return parser


def _print_table(report: dict) -> None:
    scenarios = report.get("scenarios", [])
    print(f"\nCartographer demo — {len(scenarios)} scenarios")
    print("=" * 80)
    for s in scenarios:
        if s.get("error"):
            print(f"  {s['id']:18s}  ERROR: {s['error']}")
            continue
        b = s["baseline"]
        c = s["cartographer"]
        r = s["ratio"]
        print(
            f"  {s['id']:18s}  baseline {b['tokens']:>8d} tok "
            f"({b['files_read']:>4d} files)  "
            f"cart {c['tokens']:>6d} tok ({c['files_read']:>3d} files)  "
            f"reduction {r:.1f}x"
        )
    print("=" * 80)
    agg = report.get("aggregate", {})
    print(
        f"  AGGREGATE          baseline {agg.get('baseline_tokens', 0):>8d} tok  "
        f"cart {agg.get('cartographer_tokens', 0):>6d} tok  "
        f"reduction {agg.get('ratio', 0.0):.1f}x\n"
    )


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    scenarios = DEFAULT_SCENARIOS
    if args.scenarios:
        with open(args.scenarios, "r", encoding="utf-8") as f:
            scenarios = json.load(f)

    report = run_all(args.repo_hash, scenarios)

    if args.json:
        print(json.dumps(report, indent=2, default=str))
    else:
        _print_table(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
