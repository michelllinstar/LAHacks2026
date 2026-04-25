"""Naive query decomposition stub.

The full implementation will issue a small LLM call (see SPEC §5.2) to classify
the task and lift topic keywords. For the MVP we default to ``modify existing``
and split the task on whitespace.
"""

from __future__ import annotations

import re
from typing import TypedDict


class Decomposition(TypedDict):
    task_type: str
    keywords: list[str]
    constraints: list[str]


_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]+")
_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with",
    "is", "are", "be", "this", "that", "these", "those", "it", "its",
    "i", "you", "we", "they", "how", "what", "where", "when", "why",
    "find", "show", "make", "add", "use",
}


def decompose(task: str) -> Decomposition:
    tokens = [t.lower() for t in _WORD.findall(task or "")]
    keywords = [t for t in tokens if t not in _STOPWORDS]
    return Decomposition(
        task_type="modify existing",
        keywords=keywords or tokens,
        constraints=[],
    )
