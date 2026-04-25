"""Cached tree-sitter parser loader.

Falls back to ``None`` if the optional ``tree_sitter_languages`` dependency is
not installed; the indexer runner should log a warning and skip indexing in
that case rather than crashing the server.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_parser: Optional[Any] = None
_load_attempted = False


def get_python_parser() -> Optional[Any]:
    """Return a cached tree-sitter Python parser, or ``None`` on import failure."""
    global _parser, _load_attempted
    if _parser is not None:
        return _parser
    if _load_attempted:
        return None
    _load_attempted = True
    try:
        from tree_sitter_languages import get_parser  # type: ignore
    except Exception as exc:  # pragma: no cover - exercised in dep-less envs
        logger.warning("tree_sitter_languages unavailable (%s); indexing disabled", exc)
        return None
    try:
        _parser = get_parser("python")
    except Exception as exc:  # pragma: no cover
        logger.warning("failed to load tree-sitter python grammar: %s", exc)
        _parser = None
    return _parser
