"""Phase 1 agent runner — a Gemini-driven ReAct loop over the Cartographer
query toolbelt.

Phase 2 owns persistence and SSE: it spawns ``run_agent`` from a
``BackgroundTask`` and provides an ``emit`` callback that handles both the
DB write and the SSE fan-out. Phase 3 owns ``backend.query.scope`` and is
imported lazily so this module still works in isolation if scope hasn't
landed yet.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from backend.mcp.server import TOOLS
from backend.models import (
    ArchRequest,
    ExemplarRequest,
    FindContextRequest,
    FlowRequest,
    InvariantRequest,
)

from . import templates as _templates_mod
from .templates import TEMPLATES, TemplateConfig

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Phase 3 import (scope) — degrade gracefully if missing.
# ---------------------------------------------------------------------------

try:  # pragma: no cover - import guard
    from backend.query.scope import ResolvedScope, clamp_args  # type: ignore
except Exception as _scope_exc:  # pragma: no cover
    logger.warning(
        "backend.query.scope unavailable (%s); running with pass-through clamp",
        _scope_exc,
    )

    ResolvedScope = Any  # type: ignore[misc, assignment]

    def clamp_args(  # type: ignore[no-redef]
        scope: Optional[Any], tool_name: str, args: dict
    ) -> tuple[bool, dict, Optional[str]]:
        return True, dict(args or {}), None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_TOOL_REQUEST_MODELS: dict[str, type] = {
    "find_relevant_context": FindContextRequest,
    "trace_data_flow": FlowRequest,
    "find_invariants": InvariantRequest,
    "describe_architecture": ArchRequest,
    "find_exemplars": ExemplarRequest,
}

_TOOL_DESCRIPTIONS: dict[str, str] = {
    "find_relevant_context": (
        "Retrieve a ranked bundle of symbols, exemplars, flows, and notes "
        "relevant to a natural-language task. Use this to discover entry "
        "points when you don't yet have a specific symbol."
    ),
    "trace_data_flow": (
        "Trace data flow forward (default) or backward from a qualified "
        "symbol name up to the requested depth, returning the chain of "
        "callers/callees and any sensitivity tags."
    ),
    "find_invariants": (
        "List implicit invariants attached to a symbol or cluster, filtered "
        "by minimum confidence. Useful for surfacing tested or defended "
        "preconditions."
    ),
    "describe_architecture": (
        "Describe the architectural role and conventions of a path or "
        "cluster, returning a Region plus its member files."
    ),
    "find_exemplars": (
        "Find exemplar files inside a cluster that best embody the "
        "conventions used for a given task."
    ),
}

# Cap the JSON-serialised tool result we feed back to the model. Full result
# still flows through `emit` so the UI can show everything.
_TOOL_RESULT_CHAR_CAP = 6000


# ---------------------------------------------------------------------------
# Tool schema construction
# ---------------------------------------------------------------------------


def _tool_param_schema(tool_name: str) -> dict[str, Any]:
    """Derive a JSONSchema for a tool's args from its Pydantic model.

    The runner injects ``repo_hash`` itself, so it is stripped from
    ``properties`` and ``required`` before being handed to Gemini. The
    resulting schema is normalised to the small dialect that
    ``google.genai`` accepts (drop ``$defs``, ``title``, ``default``,
    ``anyOf``-with-null collapses, etc.).
    """
    model = _TOOL_REQUEST_MODELS[tool_name]
    schema = model.model_json_schema()
    schema.pop("$defs", None)
    schema.pop("title", None)
    props = dict(schema.get("properties", {}) or {})
    props.pop("repo_hash", None)
    required = [r for r in (schema.get("required") or []) if r != "repo_hash"]
    cleaned_props: dict[str, Any] = {}
    for name, prop in props.items():
        cleaned_props[name] = _clean_prop(prop)
    return {
        "type": "object",
        "properties": cleaned_props,
        "required": required,
    }


def _clean_prop(prop: dict[str, Any]) -> dict[str, Any]:
    """Normalise a single property schema for genai consumption."""
    out: dict[str, Any] = {}
    # Collapse ``anyOf: [{type: X}, {type: 'null'}]`` -> ``type: X`` (genai
    # tolerates a missing ``type`` for nullable, but a bare ``anyOf`` with
    # ``null`` causes 400s on some SDK builds).
    any_of = prop.get("anyOf")
    if isinstance(any_of, list):
        non_null = [a for a in any_of if a.get("type") != "null"]
        if len(non_null) == 1:
            prop = {**prop, **non_null[0]}
            prop.pop("anyOf", None)
    for k, v in prop.items():
        if k in ("title", "default", "$ref"):
            continue
        out[k] = v
    # Collapse Pydantic's ``enum`` Literal lowering: keep ``enum``+``type``.
    return out


def _build_genai_tool(allowed_tools: list[str]):
    """Build a single ``google.genai`` ``Tool`` covering all allowed tools.

    Returns ``(tool_obj, types_module)`` so the caller can build
    ``GenerateContentConfig`` with the same types module. Returns
    ``(None, None)`` if the SDK is unavailable.
    """
    try:
        from google.genai import types  # type: ignore
    except ImportError:  # pragma: no cover
        return None, None

    decls = []
    for name in allowed_tools:
        if name not in _TOOL_REQUEST_MODELS:
            logger.warning("runner: skipping unknown tool %r", name)
            continue
        params = _tool_param_schema(name)
        decls.append(
            types.FunctionDeclaration(
                name=name,
                description=_TOOL_DESCRIPTIONS.get(name, name),
                parameters=params,
            )
        )
    if not decls:
        return None, types
    return types.Tool(function_declarations=decls), types


# ---------------------------------------------------------------------------
# Emit helper
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_emit(emit: Callable[[dict], None], event: dict) -> None:
    try:
        emit(event)
    except Exception:  # pragma: no cover - emit must never crash the runner
        logger.exception("emit callback raised; continuing")


# ---------------------------------------------------------------------------
# Citation extraction (best-effort)
# ---------------------------------------------------------------------------


def _collect_citations(transcript: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Walk the recorded tool results and extract symbol/file citations.

    Strictly best-effort: returns whatever ``qualified_name`` / ``file_path``
    fields we encountered, deduplicated.
    """
    seen: set[tuple[str, str]] = set()
    citations: list[dict[str, Any]] = []

    def _visit(node: Any) -> None:
        if isinstance(node, dict):
            qn = node.get("qualified_name")
            fp = node.get("file_path")
            if qn or fp:
                key = (str(qn or ""), str(fp or ""))
                if key not in seen:
                    seen.add(key)
                    cite: dict[str, Any] = {}
                    if qn:
                        cite["qualified_name"] = qn
                    if fp:
                        cite["file_path"] = fp
                    if "line_start" in node:
                        cite["line_start"] = node["line_start"]
                    citations.append(cite)
            for v in node.values():
                _visit(v)
        elif isinstance(node, list):
            for v in node:
                _visit(v)

    for entry in transcript:
        _visit(entry.get("result"))
    return citations


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def run_agent(
    repo_hash: str,
    run_id: str,
    template_id: str,
    scope: Optional["ResolvedScope"],
    prompt: str,
    cancel_event: Any,
    emit: Callable[[dict], None],
) -> None:
    """Execute a ReAct loop until completion, cancellation, or step cap."""

    template: Optional[TemplateConfig] = TEMPLATES.get(template_id)
    if template is None:
        _safe_emit(
            emit,
            {
                "step": 0,
                "role": "final",
                "payload": {
                    "markdown": (
                        "**Agent run aborted.** Unknown template `%s`. "
                        "Known templates: %s."
                        % (template_id, ", ".join(sorted(TEMPLATES.keys())))
                    ),
                    "citations": [],
                },
                "ts": _now_iso(),
            },
        )
        return

    scope_summary = getattr(scope, "summary", None) if scope is not None else None
    logger.info(
        "agent run start run_id=%s template=%s scope=%s prompt_len=%d",
        run_id,
        template_id,
        scope_summary or "<unscoped>",
        len(prompt or ""),
    )

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        _safe_emit(
            emit,
            {
                "step": 0,
                "role": "final",
                "payload": {
                    "markdown": (
                        "**Agent cannot run.** `GEMINI_API_KEY` (or "
                        "`GOOGLE_API_KEY`) is not set in the backend "
                        "environment, so no LLM is reachable."
                    ),
                    "citations": [],
                },
                "ts": _now_iso(),
            },
        )
        logger.info("agent run end run_id=%s reason=no_api_key", run_id)
        return

    try:
        from google import genai  # type: ignore
    except ImportError:  # pragma: no cover
        _safe_emit(
            emit,
            {
                "step": 0,
                "role": "final",
                "payload": {
                    "markdown": (
                        "**Agent cannot run.** `google-genai` SDK is not "
                        "installed in the backend image."
                    ),
                    "citations": [],
                },
                "ts": _now_iso(),
            },
        )
        return

    tool_obj, types = _build_genai_tool(template.allowed_tools)
    if tool_obj is None or types is None:
        _safe_emit(
            emit,
            {
                "step": 0,
                "role": "final",
                "payload": {
                    "markdown": (
                        "**Agent cannot run.** Failed to build tool schemas "
                        "for template `%s`." % template_id
                    ),
                    "citations": [],
                },
                "ts": _now_iso(),
            },
        )
        return

    client = genai.Client(api_key=api_key)
    model = template.model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    config_kwargs: dict[str, Any] = {
        "system_instruction": template.system_prompt,
        "temperature": template.temperature,
        "tools": [tool_obj],
    }
    if hasattr(types, "ThinkingConfig") and model.startswith("gemini-"):
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
    gen_config = types.GenerateContentConfig(**config_kwargs)

    # ------------------------------------------------------------------
    # Build the initial user turn: scope summary + the user prompt.
    # ------------------------------------------------------------------
    scope_block = (
        "Agent scope: %s. Tool calls touching anything outside this slice "
        "will be refused.\n\n" % scope_summary
        if scope_summary
        else "Agent scope: <unscoped>.\n\n"
    )
    allowed_block = "Allowed tools: %s.\n" % ", ".join(template.allowed_tools)
    step_cap_block = (
        "You may take at most %d tool-using steps before producing the final "
        "Markdown report.\n\n" % template.max_steps
    )
    initial_user = scope_block + allowed_block + step_cap_block + (
        "User prompt:\n" + (prompt or "").strip()
    )

    contents: list[Any] = [
        types.Content(role="user", parts=[types.Part.from_text(text=initial_user)]),
    ]

    # Transcript captures full tool results for citation extraction at the
    # end. ``emit`` already handed previews to the UI; this is internal.
    transcript: list[dict[str, Any]] = []

    final_emitted = False
    step = 0
    while step < template.max_steps:
        if hasattr(cancel_event, "is_set") and cancel_event.is_set():
            logger.info(
                "agent run cancelled run_id=%s step=%d", run_id, step
            )
            return

        step += 1
        t0 = time.monotonic()
        try:
            resp = client.models.generate_content(
                model=model,
                contents=contents,
                config=gen_config,
            )
        except Exception as exc:
            logger.exception("LLM error run_id=%s step=%d", run_id, step)
            _safe_emit(
                emit,
                {
                    "step": step,
                    "role": "tool_result",
                    "payload": {"error": "llm_error: %s" % exc},
                    "ts": _now_iso(),
                },
            )
            # One-shot break — surfaces a final so the run terminates with a
            # result the UI can render.
            _safe_emit(
                emit,
                {
                    "step": step,
                    "role": "final",
                    "payload": {
                        "markdown": (
                            "**Agent run aborted.** LLM call failed: `%s`."
                            % exc
                        ),
                        "citations": _collect_citations(transcript),
                    },
                    "ts": _now_iso(),
                },
            )
            final_emitted = True
            break

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        candidates = getattr(resp, "candidates", None) or []
        if not candidates:
            _safe_emit(
                emit,
                {
                    "step": step,
                    "role": "final",
                    "payload": {
                        "markdown": (
                            "**Agent run ended.** LLM returned no candidates."
                        ),
                        "citations": _collect_citations(transcript),
                    },
                    "ts": _now_iso(),
                },
            )
            final_emitted = True
            break

        content = getattr(candidates[0], "content", None)
        parts = list(getattr(content, "parts", None) or [])

        function_calls: list[Any] = []
        text_chunks: list[str] = []
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc and getattr(fc, "name", None):
                function_calls.append(fc)
                continue
            t = getattr(part, "text", None)
            if t:
                text_chunks.append(t)

        # Append the model's turn to the transcript (preserve the original
        # ``Content`` so the next ``generate_content`` call sees the same
        # function_call parts the SDK emitted).
        if content is not None:
            contents.append(content)

        # The model sometimes returns a thought alongside a function call.
        if function_calls and text_chunks:
            _safe_emit(
                emit,
                {
                    "step": step,
                    "role": "thought",
                    "payload": {"text": "".join(text_chunks)},
                    "ts": _now_iso(),
                },
            )

        if not function_calls:
            # Pure-text response → final report.
            final_text = "".join(text_chunks).strip() or "(empty response)"
            _safe_emit(
                emit,
                {
                    "step": step,
                    "role": "final",
                    "payload": {
                        "markdown": final_text,
                        "citations": _collect_citations(transcript),
                    },
                    "ts": _now_iso(),
                },
            )
            final_emitted = True
            logger.info(
                "agent run step run_id=%s step=%d kind=final elapsed_ms=%d",
                run_id,
                step,
                elapsed_ms,
            )
            break

        # ------------------------------------------------------------------
        # Execute every requested function call and append their responses.
        # ------------------------------------------------------------------
        response_parts: list[Any] = []
        for fc in function_calls:
            tool_name = fc.name
            raw_args = dict(getattr(fc, "args", None) or {})

            _safe_emit(
                emit,
                {
                    "step": step,
                    "role": "tool_call",
                    "payload": {"tool": tool_name, "args": raw_args},
                    "ts": _now_iso(),
                },
            )
            logger.info(
                "agent run step run_id=%s step=%d tool=%s elapsed_ms=%d",
                run_id,
                step,
                tool_name,
                elapsed_ms,
            )

            if tool_name not in template.allowed_tools or tool_name not in TOOLS:
                reason = (
                    "tool %r is not allowed for template %r"
                    % (tool_name, template.id)
                )
                _safe_emit(
                    emit,
                    {
                        "step": step,
                        "role": "tool_result",
                        "payload": {"tool": tool_name, "error": reason},
                        "ts": _now_iso(),
                    },
                )
                response_parts.append(
                    types.Part.from_function_response(
                        name=tool_name, response={"error": reason}
                    )
                )
                continue

            ok, clamped, reason = clamp_args(scope, tool_name, raw_args)
            if not ok:
                _safe_emit(
                    emit,
                    {
                        "step": step,
                        "role": "tool_result",
                        "payload": {"tool": tool_name, "error": reason},
                        "ts": _now_iso(),
                    },
                )
                response_parts.append(
                    types.Part.from_function_response(
                        name=tool_name,
                        response={
                            "error": "refused by scope guard: %s" % reason,
                        },
                    )
                )
                continue

            # Inject repo_hash; do not let the model override it.
            tool_args = dict(clamped)
            tool_args["repo_hash"] = repo_hash

            tool_t0 = time.monotonic()
            try:
                result = TOOLS[tool_name](tool_args)
            except Exception as exc:
                logger.exception(
                    "tool error run_id=%s step=%d tool=%s",
                    run_id,
                    step,
                    tool_name,
                )
                err_msg = "tool_error: %s" % exc
                _safe_emit(
                    emit,
                    {
                        "step": step,
                        "role": "tool_result",
                        "payload": {"tool": tool_name, "error": err_msg},
                        "ts": _now_iso(),
                    },
                )
                response_parts.append(
                    types.Part.from_function_response(
                        name=tool_name, response={"error": err_msg}
                    )
                )
                continue

            tool_elapsed_ms = int((time.monotonic() - tool_t0) * 1000)
            try:
                serialised = json.dumps(result, default=str)
            except (TypeError, ValueError):
                serialised = str(result)
            full_size = len(serialised)
            preview = (
                serialised
                if full_size <= _TOOL_RESULT_CHAR_CAP
                else serialised[:_TOOL_RESULT_CHAR_CAP] + "...<truncated>"
            )
            transcript.append({"tool": tool_name, "result": result})
            _safe_emit(
                emit,
                {
                    "step": step,
                    "role": "tool_result",
                    "payload": {
                        "tool": tool_name,
                        "result_preview": preview,
                        "full_size": full_size,
                        "elapsed_ms": tool_elapsed_ms,
                    },
                    "ts": _now_iso(),
                },
            )

            # Feed the (possibly truncated) result back to the model. We
            # wrap it in a single-key dict so genai accepts it regardless
            # of whether ``result`` is dict / list / scalar.
            if full_size <= _TOOL_RESULT_CHAR_CAP and isinstance(result, dict):
                response_payload: Any = result
            elif full_size <= _TOOL_RESULT_CHAR_CAP:
                response_payload = {"result": result}
            else:
                response_payload = {
                    "result_preview": preview,
                    "truncated": True,
                    "full_size": full_size,
                }
            response_parts.append(
                types.Part.from_function_response(
                    name=tool_name, response=response_payload
                )
            )

        if response_parts:
            contents.append(types.Content(role="user", parts=response_parts))

    if not final_emitted:
        if hasattr(cancel_event, "is_set") and cancel_event.is_set():
            logger.info("agent run cancelled run_id=%s after_step=%d", run_id, step)
            return
        # Step cap reached without a textual final.
        _safe_emit(
            emit,
            {
                "step": step,
                "role": "final",
                "payload": {
                    "markdown": (
                        "**Step cap reached.** The agent did not produce a "
                        "final report within %d steps." % template.max_steps
                    ),
                    "citations": _collect_citations(transcript),
                },
                "ts": _now_iso(),
            },
        )

    logger.info(
        "agent run end run_id=%s template=%s steps=%d",
        run_id,
        template_id,
        step,
    )


# Keep the templates module re-exported under the ``runner`` namespace for
# callers that prefer ``from backend.agents.runner import TEMPLATES``.
__all__ = ["run_agent", "TEMPLATES", "_templates_mod"]
