"""Example Fetch.ai uAgent that bridges the uAgents protocol to Cartographer
via the webhook adapter pattern (option A in the planning discussion).

Run it standalone:

    python tests/fixtures/fetchai_agent_example.py

By default it binds the uAgent to port 8765 and exposes a REST POST endpoint
at ``http://localhost:8765/cartographer``. Register that URL in the
Cartographer website's "External agents" panel — backend will POST a
``{prompt, repo_hash, context_bundle}`` payload and expect this agent's
reply to match Cartographer's wire contract:

    response: {
        "summary":   str,
        "citations": list[str],
        "warnings":  list[str],
        "steps":     list[ReasoningStep],   # optional chain-of-reasoning
    }

A ``ReasoningStep`` is ``{kind, text, tool?, citations?, ts_ms?}`` where
``kind`` is one of ``thought | tool_call | tool_result | final``. The
website renders these as a collapsible thread under the activity entry.
Steps are optional — agents that omit them still work, just without an
expandable trace.

The agent ALSO retains its full uAgents identity: it has a public
``agent1q...`` address, registers in the Almanac if a network is reachable,
and could be messaged peer-to-peer via the standard uAgents protocol. The
HTTP webhook is purely the adapter Cartographer talks to today; the same
process can serve uAgents-network traffic via ``@agent.on_message`` if you
add handlers below.

What this example does on a request:
    1. Reads the top-K relevant_symbols out of the bundle Cartographer
       pre-fetched on its side (Layer 1 + ranker output).
    2. Returns a short Markdown summary citing those symbols' qualified
       names. Replace ``_summarize`` with your own LLM call to make it
       smart — the wire contract is identical.

This file is hackathon-quality demo code and is NOT imported by pytest. It
lives under tests/fixtures/ because that's where Cartographer keeps loopback
helpers, not because pytest collects it.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import requests

# uAgents 0.24+ ships @on_rest_post / @on_rest_get. Older releases need
# pip install -U uagents. We pin a clear error if the import fails.
try:
    from uagents import Agent, Context, Model  # type: ignore
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "uagents not installed. `pip install uagents>=0.20` and rerun.\n"
    )
    raise


# ---------------------------------------------------------------------------
# Wire contract (must match backend/routes/external_agents.py exactly).
# ---------------------------------------------------------------------------


class CartographerRequest(Model):
    prompt: str
    repo_hash: str
    # The Cartographer ContextBundle, serialized via model_dump(). We type it
    # loosely as a dict — the agent only needs to reach into a couple of
    # known keys to be useful.
    context_bundle: dict[str, Any]
    # Optional callback channel. When the dispatcher is the Cartographer
    # backend, these are populated so the agent can issue read-only queries
    # back into the platform during its reasoning loop. Both are optional so
    # the same agent can also be invoked from anywhere that doesn't have
    # them.
    cartographer_token: str | None = None
    cartographer_base_url: str | None = None


class ReasoningStep(Model):
    kind: str  # thought | tool_call | tool_result | final
    text: str
    tool: str | None = None
    citations: list[str] = []
    ts_ms: int | None = None


class CartographerResponse(Model):
    summary: str
    citations: list[str] = []
    warnings: list[str] = []
    steps: list[ReasoningStep] = []


# ---------------------------------------------------------------------------
# Agent identity. Seed is read from env so re-runs of this file produce a
# stable agent1q... address (handy when registering on Almanac / Agentverse).
# ---------------------------------------------------------------------------


_DEFAULT_PORT = int(os.getenv("CART_EXAMPLE_PORT", "8765"))
_SEED = os.getenv(
    "CART_EXAMPLE_SEED",
    "cartographer-example-fetchai-agent-seed-please-override",
)

agent = Agent(
    name="cartographer-example",
    seed=_SEED,
    port=_DEFAULT_PORT,
    # The endpoint URL we advertise in Almanac. For local dev, this is the
    # bind address; for cloud deploys, override via CART_EXAMPLE_ENDPOINT.
    endpoint=[
        os.getenv("CART_EXAMPLE_ENDPOINT", f"http://localhost:{_DEFAULT_PORT}/submit")
    ],
)


# ---------------------------------------------------------------------------
# Reply construction. Replace this with an LLM call to make it smart.
# ---------------------------------------------------------------------------


def _call_cartographer(
    req: CartographerRequest,
    tool: str,
    payload: dict[str, Any],
    timeout: float = 10.0,
) -> tuple[Any, str | None]:
    """Issue a read-only query against Cartographer's agent-query surface.

    Returns ``(result, error)`` — exactly one of the two is non-None. The
    function is best-effort: any HTTP / JSON failure surfaces as a string the
    caller can fold into a ``warnings`` entry rather than crashing the run.
    """
    base = req.cartographer_base_url
    token = req.cartographer_token
    if not base or not token:
        return None, "no callback channel; agent invoked without token"
    url = f"{base.rstrip('/')}/api/agent-query/{tool}"
    body = {"repo_hash": req.repo_hash, **payload}
    try:
        resp = requests.post(
            url,
            json=body,
            headers={
                "Content-Type": "application/json",
                "X-Cartographer-Agent-Token": token,
            },
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return None, f"network error calling {tool}: {exc}"
    if resp.status_code != 200:
        return None, f"{tool} returned HTTP {resp.status_code}: {resp.text[:200]}"
    try:
        return resp.json(), None
    except ValueError:
        return None, f"{tool} response was not JSON"


def _summarize(req: CartographerRequest) -> CartographerResponse:
    bundle = req.context_bundle or {}
    syms = bundle.get("relevant_symbols", []) or []
    region = bundle.get("region", {}) or {}
    role = region.get("role") or "unspecified region"

    # Top-5 qualified names become both citations (raw) and a markdown list.
    top = []
    for s in syms[:5]:
        qname = s.get("qualified_name")
        path = s.get("file_path")
        line = s.get("line_start")
        if qname:
            location = f" ({path}:{line})" if path and line is not None else ""
            top.append(f"`{qname}`{location}")

    if top:
        body = "\n".join(f"- {t}" for t in top)
        summary = (
            f"**Prompt:** {req.prompt}\n\n"
            f"**Region role:** {role}\n\n"
            f"**Top relevant symbols:**\n{body}\n"
        )
    else:
        summary = (
            f"**Prompt:** {req.prompt}\n\n"
            f"No symbols matched in repo `{req.repo_hash}` — is the repo "
            f"indexed? (Layer 1 returned no candidates.)"
        )

    citations = [s["qualified_name"] for s in syms[:5] if s.get("qualified_name")]
    warnings: list[str] = []
    if not syms:
        warnings.append("empty context_bundle.relevant_symbols")

    # Build the reasoning trace. When a callback channel is present we
    # actually exercise it (read-only) so the rendered thread reflects real
    # tool use, not a mock. Production agents would replace these synthetic
    # think/act steps with their own LLM-driven loop.
    steps: list[ReasoningStep] = [
        ReasoningStep(
            kind="thought",
            text=(
                f"Looking for symbols relevant to: {req.prompt!r}. "
                f"Region role is {role!r}."
            ),
        ),
        ReasoningStep(
            kind="tool_result",
            tool="find_relevant_context",
            text=(
                f"Pre-fetched bundle carried {len(syms)} ranked symbol(s); "
                f"taking top {len(citations)}."
            ),
            citations=citations,
        ),
    ]

    # Optional follow-up read: trace_data_flow on the top-ranked symbol so
    # the demo shows the agent doing something the bundle didn't already
    # contain.
    top_qname = citations[0] if citations else None
    if top_qname and req.cartographer_token:
        steps.append(
            ReasoningStep(
                kind="tool_call",
                tool="trace_data_flow",
                text=f'symbol={top_qname!r}, direction="forward", depth=2',
            )
        )
        result, err = _call_cartographer(
            req,
            "trace_data_flow",
            {"symbol": top_qname, "direction": "forward", "depth": 2},
        )
        if err:
            warnings.append(err)
            steps.append(
                ReasoningStep(
                    kind="tool_result",
                    tool="trace_data_flow",
                    text=f"call failed: {err}",
                )
            )
        else:
            flows = (result or {}).get("flows", []) if isinstance(result, dict) else []
            steps.append(
                ReasoningStep(
                    kind="tool_result",
                    tool="trace_data_flow",
                    text=(
                        f"flows returned: {len(flows)}\n"
                        + "\n".join(
                            f"- {f.get('source_symbol')} → {f.get('sink_symbol')} "
                            f"({f.get('flow_kind')})"
                            for f in flows[:5]
                        )
                    ),
                    citations=[
                        c
                        for f in flows[:5]
                        for c in (f.get("source_symbol"), f.get("sink_symbol"))
                        if c
                    ],
                )
            )

    steps.append(
        ReasoningStep(
            kind="final",
            text=summary,
            citations=citations,
        )
    )

    return CartographerResponse(
        summary=summary,
        citations=citations,
        warnings=warnings,
        steps=steps,
    )


# ---------------------------------------------------------------------------
# REST endpoint — what Cartographer's backend POSTs to.
# ---------------------------------------------------------------------------


@agent.on_rest_post("/cartographer", CartographerRequest, CartographerResponse)
async def handle_cartographer(ctx: Context, req: CartographerRequest) -> CartographerResponse:
    ctx.logger.info(
        "cartographer dispatch: prompt=%r repo=%s symbols=%d",
        req.prompt[:80],
        req.repo_hash,
        len(req.context_bundle.get("relevant_symbols", []) or []),
    )
    try:
        return _summarize(req)
    except Exception as exc:  # pragma: no cover
        ctx.logger.exception("summary failure: %s", exc)
        return CartographerResponse(
            summary=f"agent error: {exc}",
            citations=[],
            warnings=[f"agent raised: {type(exc).__name__}"],
        )


# ---------------------------------------------------------------------------
# Liveness probe — handy for sanity-checking from a browser.
# ---------------------------------------------------------------------------


class HealthReply(Model):
    status: str
    address: str


@agent.on_rest_get("/health", HealthReply)
async def health(ctx: Context) -> HealthReply:
    return HealthReply(status="ok", address=ctx.agent.address)


if __name__ == "__main__":
    print(f"Cartographer example uAgent")
    print(f"  uAgent address  : {agent.address}")
    print(f"  webhook (POST)  : http://localhost:{_DEFAULT_PORT}/cartographer")
    print(f"  health  (GET)   : http://localhost:{_DEFAULT_PORT}/health")
    print()
    print("Register the webhook URL in Cartographer's External Agents panel.")
    print("Press Ctrl-C to stop.")
    print()
    # Project root lives two levels up; nothing else needs the path, but
    # this keeps imports working if the agent grows to import backend.* in
    # the future for richer summaries.
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    agent.run()
