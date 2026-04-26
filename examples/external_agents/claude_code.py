"""External-agent wrapper around the Claude Code CLI.

The Cartographer website (POST /api/agents/external/{id}/run) speaks the
following wire contract:

    request   ← { "prompt": str, "repo_hash": str, "context_bundle": {...} }
    response  → { "summary": str, "citations": [str], "warnings": [str] }

This script exposes the contract as a tiny HTTP server. On each request it
formats the prompt + bundle into a Claude Code prompt, shells out to
``claude -p ...`` (headless mode), and returns Claude's stdout as the
``summary``. ``citations`` come from the ranked symbols in the bundle.

Run it:
    pip install flask
    python -m examples.external_agents.claude_code --port 5050

Then register in the Cartographer Agents panel:
    Name:           Claude Code
    Endpoint URL:   http://127.0.0.1:5050
    Auth header:    (leave blank)

Flags:
    --port N           default 5050
    --bin /path/claude override the ``claude`` CLI lookup
    --timeout SEC      per-call upper bound (default 120s)
    --stub             skip the CLI; return a deterministic fake summary
                       (useful for testing the wiring without spending tokens)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
from typing import Any

try:
    from flask import Flask, jsonify, request
except ImportError:
    print("flask is required: pip install flask", file=sys.stderr)
    raise SystemExit(2)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s claude-code-agent: %(message)s",
)
logger = logging.getLogger("claude-code-agent")

# Default port for the first agent. Each subsequent ``npm run claude-agent``
# probes upward and picks the first free port — so two terminals running the
# wrapper end up on 5050 and 5051 automatically.
DEFAULT_PORT = 5050

# Default names assigned in port order so each running instance is easily
# identifiable (Alice on :5050, Bob on :5051, etc.). Cycles past index 25.
DEFAULT_NAMES = [
    "Alice", "Bob", "Charlie", "Dave", "Eve", "Frank", "Grace",
    "Heidi", "Ivan", "Judy", "Kate", "Leo", "Mallory", "Niaj",
    "Oscar", "Peggy", "Quinn", "Rupert", "Sybil", "Trent", "Uma",
    "Victor", "Walter", "Xena", "Yvonne", "Zara",
]


def _is_port_free(host: str, port: int) -> bool:
    """Probe whether ``(host, port)`` is bindable right now."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
        except OSError:
            return False
    return True


def _pick_free_port(host: str, start: int, span: int = 100) -> int:
    """Return the first free port at or after ``start``. Raises if none free."""
    for offset in range(span):
        port = start + offset
        if _is_port_free(host, port):
            return port
    raise RuntimeError(f"no free port in {start}..{start + span - 1}")


def _name_for_port(port: int, base: int = DEFAULT_PORT) -> str:
    """Return the default name for ``port`` keyed off the offset from base."""
    offset = port - base
    if 0 <= offset < len(DEFAULT_NAMES):
        return DEFAULT_NAMES[offset]
    # Past the alphabet — wrap around with a numeric suffix so two cycles
    # don't collide.
    cycle, idx = divmod(offset, len(DEFAULT_NAMES))
    return f"{DEFAULT_NAMES[idx]}-{cycle + 1}" if offset >= 0 else f"Agent-{port}"


def _format_prompt(user_task: str, bundle: dict[str, Any]) -> str:
    """Build a Claude Code prompt from the user's task + Cartographer bundle.

    Bundle shape comes from backend/models.py::ContextBundle. We surface the
    region role, top-ranked symbols, exemplars, and any notes — enough for
    Claude to reason about the request without re-querying.
    """
    region = bundle.get("region") or {}
    role = region.get("role") or "(role not inferred)"
    conventions = region.get("conventions") or {}
    symbols = bundle.get("relevant_symbols") or []
    exemplars = bundle.get("exemplars") or []
    notes = bundle.get("notes") or []

    sym_lines = []
    for s in symbols[:10]:
        sig = (s.get("signature") or "").strip()
        sig_part = f" — `{sig}`" if sig else ""
        sym_lines.append(
            f"- {s.get('qualified_name','?')}  "
            f"({s.get('file_path','?')}:{s.get('line_start','?')}){sig_part}"
        )
    sym_block = "\n".join(sym_lines) or "(none)"

    ex_block = "\n".join(f"- {e.get('file_path','?')} — {e.get('reason','')}" for e in exemplars[:5]) or "(none)"
    notes_block = "\n".join(f"- {n}" for n in notes) or "(none)"
    conv_block = json.dumps(conventions, indent=2) if conventions else "(none)"

    return f"""You are an external coding agent invoked by the Codebase Cartographer.
You have been given a focused context bundle that was already resolved by
Cartographer's Query Engine — you do NOT need to re-query.

User task:
{user_task}

Architectural region: {role}

Conventions for this region:
{conv_block}

Top-ranked relevant symbols:
{sym_block}

Exemplar files to model after:
{ex_block}

Notes / caveats from Cartographer:
{notes_block}

Reply with a 2-4 sentence plan or summary. Cite symbols by their qualified
name where relevant. Do not write code unless the task explicitly asks for it.
"""


def _run_claude(prompt: str, *, claude_bin: str, timeout: float) -> str:
    """Shell out to Claude Code in headless print mode and capture stdout."""
    cmd = [claude_bin, "-p", prompt]
    logger.info("invoking %s (prompt %d chars, timeout %.0fs)", claude_bin, len(prompt), timeout)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"claude CLI exceeded {timeout:.0f}s")
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()[:400]
        raise RuntimeError(f"claude CLI exit {proc.returncode}: {stderr}")
    out = (proc.stdout or "").strip()
    if not out:
        raise RuntimeError("claude CLI returned empty stdout")
    return out


def make_app(*, name: str, claude_bin: str, timeout: float, stub: bool) -> Flask:
    app = Flask(__name__)

    @app.get("/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "name": name,
                "stub": stub,
                "claude_bin": claude_bin if not stub else None,
                "claude_resolved": shutil.which(claude_bin) is not None if not stub else None,
            }
        )

    @app.post("/")
    def handle():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"summary": "", "warnings": ["request body was not JSON"]}), 400

        prompt = (body.get("prompt") or "").strip()
        bundle = body.get("context_bundle") or {}
        if not prompt:
            return jsonify({"summary": "", "warnings": ["empty prompt"]}), 400

        full = _format_prompt(prompt, bundle)
        symbols = bundle.get("relevant_symbols") or []
        citations = [s.get("qualified_name") for s in symbols[:5] if s.get("qualified_name")]

        if stub:
            n = len(symbols)
            summary = (
                f"[stub] Would have asked Claude Code to handle '{prompt}'. "
                f"Saw {n} ranked symbols in the bundle."
            )
            return jsonify({"summary": summary, "citations": citations, "warnings": ["stub mode — no real Claude call"]})

        try:
            summary = _run_claude(full, claude_bin=claude_bin, timeout=timeout)
        except RuntimeError as exc:
            logger.warning("claude invocation failed: %s", exc)
            return jsonify({"summary": "", "warnings": [str(exc)]}), 502

        return jsonify({"summary": summary, "citations": citations, "warnings": []})

    return app


def main() -> None:
    parser = argparse.ArgumentParser(prog="claude-code-agent")
    parser.add_argument(
        "--port", type=int, default=None,
        help=f"port to bind (default: first free at or after {DEFAULT_PORT})",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--name", default=None,
        help="display name shown in the banner (default: derived from port — Alice, Bob, …)",
    )
    parser.add_argument(
        "--bin",
        default=os.getenv("CLAUDE_CODE_BIN", "claude"),
        help="path or name of the claude CLI (default: 'claude' on PATH)",
    )
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--stub", action="store_true", help="don't invoke claude; return a fake summary")
    args = parser.parse_args()

    # Pick port: explicit --port wins; otherwise probe upward from DEFAULT_PORT
    # so each terminal session gets a unique slot without manual coordination.
    if args.port is None:
        try:
            port = _pick_free_port(args.host, DEFAULT_PORT)
        except RuntimeError as exc:
            logger.error("%s", exc)
            raise SystemExit(2)
    else:
        if not _is_port_free(args.host, args.port):
            logger.error("port %d is already in use on %s", args.port, args.host)
            raise SystemExit(2)
        port = args.port

    name = args.name or _name_for_port(port)

    if not args.stub:
        resolved = shutil.which(args.bin)
        if not resolved:
            logger.warning(
                "claude CLI not found on PATH (looked for %r). "
                "Run with --stub to test wiring, or install Claude Code first.",
                args.bin,
            )
        else:
            logger.info("claude CLI resolved to %s", resolved)

    app = make_app(name=name, claude_bin=args.bin, timeout=args.timeout, stub=args.stub)

    # Banner: print the name + registration URL prominently so the user can
    # copy them straight into the Agents panel without hunting through log
    # lines.
    url = f"http://{args.host}:{port}"
    mode = " (stub mode — no real Claude calls)" if args.stub else ""
    bar = "─" * 60
    print()
    print(f"  {bar}")
    print(f"    Claude Code agent: {name}{mode}")
    print()
    print(f"    Suggested name:  {name}")
    print(f"    Endpoint URL:    {url}")
    print()
    print(f"    Paste those into the website's Agents panel:")
    print(f"      Agents tab → fill Name + Endpoint URL → Register")
    print(f"  {bar}")
    print(flush=True)

    app.run(host=args.host, port=port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
