"""Query decomposition (SPEC §5.2).

Issues a small Gemini call to classify the user's coding task and lift
topic keywords. Falls back to a deterministic heuristic when the API key is
absent or the LLM call fails — so the rest of the pipeline can keep running
during the hackathon without depending on a live Gemini key.

Public return shape (stable):

    {"task_type": str, "keywords": list[str], "constraints": list[str]}

``task_type`` is one of ``{"add new code", "modify existing", "understand"}``
to match the task-type discriminator used by ``backend/query/weights.json``.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import TypedDict

from backend.lib import llm

logger = logging.getLogger(__name__)


class Decomposition(TypedDict):
    task_type: str
    keywords: list[str]
    constraints: list[str]


_TASK_TYPES = {"add new code", "modify existing", "understand"}

_SYSTEM_PROMPT = (
    "Classify the user's coding task and extract topic keywords. Reply with "
    "STRICT JSON only — no prose, no markdown fences. Schema: "
    '{"task_type": "add new code"|"modify existing"|"understand", '
    '"keywords": [list of 3-8 short topic words, lowercased], '
    '"constraints": [list of 0-3 constraint phrases, optional]}'
)

# Heuristic stopword list — broader than strictly necessary so the fallback
# returns clean keyword lists even on chatty prompts. Mirrors the prior stub's
# behaviour so existing tests in ``tests/test_decomposer.py`` keep passing.
_HEURISTIC_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for",
    "with", "by", "is", "are", "be", "this", "that", "these", "those",
    "it", "its", "i", "you", "we", "they", "how", "what", "where", "when",
    "why", "find", "show", "make", "add", "use",
}

_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]+")


def _heuristic(task: str) -> Decomposition:
    """Deterministic fallback used when the LLM is unavailable.

    Tokenises on word characters (so punctuation is dropped cleanly), filters
    stopwords, and infers ``task_type`` from leading verbs.
    """
    tokens = [t.lower() for t in _WORD.findall(task or "")]
    keywords = [t for t in tokens if t not in _HEURISTIC_STOPWORDS]
    if not tokens:
        return Decomposition(task_type="modify existing", keywords=[], constraints=[])

    lowered = (task or "").lower()
    if any(v in lowered for v in ("add ", "create ", "build ", "introduce ", "implement ")):
        task_type = "add new code"
    elif any(
        v in lowered
        for v in ("explain", "understand", "describe", "what does", "how does")
    ):
        task_type = "understand"
    else:
        task_type = "modify existing"
    return Decomposition(
        task_type=task_type,
        keywords=keywords or tokens,
        constraints=[],
    )


def _strip_fences(text: str) -> str:
    """Remove ```json fences if Claude wraps the JSON despite the prompt."""
    text = text.strip()
    if text.startswith("```"):
        # Drop the opening fence line.
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


def decompose(task: str) -> Decomposition:
    if not (task or "").strip():
        return Decomposition(task_type="modify existing", keywords=[], constraints=[])
    if not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
        return _heuristic(task)
    try:
        # 200-token cap keeps this well under SPEC §9.2's 3s p95 budget for
        # find_relevant_context.
        raw = llm.complete(_SYSTEM_PROMPT, task, max_tokens=200)
        if not raw:
            return _heuristic(task)
        parsed = json.loads(_strip_fences(raw))
        task_type = parsed.get("task_type", "modify existing")
        if task_type not in _TASK_TYPES:
            task_type = "modify existing"
        keywords = parsed.get("keywords") or []
        constraints = parsed.get("constraints") or []
        if not isinstance(keywords, list):
            keywords = []
        if not isinstance(constraints, list):
            constraints = []
        return Decomposition(
            task_type=task_type,
            keywords=[str(k).lower() for k in keywords[:8]],
            constraints=[str(c) for c in constraints[:3]],
        )
    except Exception as exc:
        logger.warning(
            "decomposer LLM call failed: %s — falling back to heuristic", exc
        )
        return _heuristic(task)
