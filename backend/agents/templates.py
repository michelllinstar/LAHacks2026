"""Built-in agent templates for the Phase 1 ReAct runner.

Each template is a small bundle of (system prompt, allowed tools, model
parameters) that pre-configures a Gemini-driven ReAct loop over the existing
Cartographer query toolbelt. Phase 2 routes / DB code reads these as plain
constants (no side effects on import).
"""

from __future__ import annotations

from dataclasses import dataclass, field


# Canonical names of the five Cartographer query tools the runner exposes.
ALL_TOOLS: list[str] = [
    "find_relevant_context",
    "trace_data_flow",
    "find_invariants",
    "describe_architecture",
    "find_exemplars",
]


@dataclass
class TemplateConfig:
    id: str
    name: str
    description: str
    system_prompt: str
    allowed_tools: list[str] = field(default_factory=list)
    model: str = "gemini-2.5-flash"
    max_steps: int = 8
    temperature: float = 0.2


_REGION_AUDITOR_PROMPT = """\
You are the Region Auditor. You inspect a fixed slice of a Cartographer-indexed
repository and explain what it does, what implicit invariants govern it, and
where its test coverage looks thin. You have a strict scope: any tool call
that touches a symbol or file outside that scope will be REJECTED and returned
to you with a refusal message — re-plan inside the sandbox when that happens.
Iterate up to the step cap, calling the available tools to gather evidence,
then produce a Markdown report citing each symbol or file you inspected.
Prefer specific qualified names over vague paraphrases."""

_FLOW_TRACER_PROMPT = """\
You are the Flow Tracer. You start from a seed symbol inside the agent scope
and follow data through the repository to identify the sinks of concern
(network calls, persistence, logging, external IO). Use trace_data_flow as
your primary tool, falling back to find_relevant_context to discover seeds
when the user prompt is vague. Tool calls outside the scope are refused —
re-plan when that happens. Iterate up to the step cap, then produce a
Markdown report listing each path with its source, sink, and a one-line
risk note. Cite the qualified names you traced."""

_CONVENTION_SCOUT_PROMPT = """\
You are the Convention Scout. You characterise the architectural role of the
scoped region (controller / service / repository / utility / etc.) and call
out exemplar files that best embody its conventions. Use describe_architecture
first, then find_exemplars to surface concrete files. Tool calls outside the
scope will be refused — re-plan inside the sandbox. Iterate up to the step
cap, then deliver a Markdown report with the inferred role, the conventions
you observed, and a citation list of exemplar files."""

_REFACTOR_PLANNER_PROMPT = """\
You are the Refactor Planner. You propose a concrete, low-risk refactor plan
for the scoped region. Use the full toolbelt: discover the structure with
describe_architecture and find_relevant_context, ground the plan in
find_exemplars and find_invariants, and check ripple effects with
trace_data_flow. Tool calls outside the scope are refused; re-plan when that
happens. Iterate up to the step cap, then produce a Markdown plan with
ordered steps, each citing the exemplars / invariants that justify it."""


TEMPLATES: dict[str, TemplateConfig] = {
    "region-auditor": TemplateConfig(
        id="region-auditor",
        name="Region Auditor",
        description=(
            "Describe what this area does, surface implicit invariants, "
            "and flag test gaps."
        ),
        system_prompt=_REGION_AUDITOR_PROMPT,
        allowed_tools=list(ALL_TOOLS),
    ),
    "flow-tracer": TemplateConfig(
        id="flow-tracer",
        name="Flow Tracer",
        description=(
            "Trace where data from a seed symbol flows; report sinks of concern."
        ),
        system_prompt=_FLOW_TRACER_PROMPT,
        allowed_tools=["trace_data_flow", "find_relevant_context"],
    ),
    "convention-scout": TemplateConfig(
        id="convention-scout",
        name="Convention Scout",
        description=(
            "Identify the architectural role and exemplar code in this region."
        ),
        system_prompt=_CONVENTION_SCOUT_PROMPT,
        allowed_tools=["describe_architecture", "find_exemplars"],
    ),
    "refactor-planner": TemplateConfig(
        id="refactor-planner",
        name="Refactor Planner",
        description=(
            "Propose a refactor plan citing existing exemplars and invariants."
        ),
        system_prompt=_REFACTOR_PLANNER_PROMPT,
        allowed_tools=list(ALL_TOOLS),
    ),
}


__all__ = ["TemplateConfig", "TEMPLATES", "ALL_TOOLS"]
