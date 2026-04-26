"""Cached tree-sitter parser loader.

Falls back to ``None`` if the optional tree-sitter language dependencies are
not installed; the indexer runner should log a warning and skip indexing in
that case rather than crashing the server.

SPEC §10 mandates Python + TypeScript. We expose a per-language accessor and a
``get_parser_for(file_path)`` router so the runner can dispatch parsing on a
per-file basis without knowing about grammars itself.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_python_parser: Optional[Any] = None
_python_load_attempted = False

_typescript_parser: Optional[Any] = None
_typescript_load_attempted = False

_tsx_parser: Optional[Any] = None
_tsx_load_attempted = False


def _try_get_parser(language: str) -> Optional[Any]:
    """Best-effort tree-sitter parser load; returns None on any failure."""
    try:
        from tree_sitter import Language, Parser  # type: ignore
        if language == "python":
            import tree_sitter_python as tspython  # type: ignore
            lang = Language(tspython.language())
        elif language in ("typescript", "tsx"):
            import tree_sitter_typescript as tstype  # type: ignore
            lang = Language(tstype.language_typescript() if language == "typescript" else tstype.language_tsx())
        else:
            return None
        parser = Parser(lang)
        return parser
    except Exception as exc:
        logger.warning("tree-sitter parser unavailable for %s (%s); indexing disabled", language, exc)
        return None


def get_python_parser() -> Optional[Any]:
    """Return a cached tree-sitter Python parser, or ``None`` on import failure."""
    global _python_parser, _python_load_attempted
    if _python_parser is not None:
        return _python_parser
    if _python_load_attempted:
        return None
    _python_load_attempted = True
    _python_parser = _try_get_parser("python")
    return _python_parser


def get_typescript_parser() -> Optional[Any]:
    """Return a cached tree-sitter TypeScript parser, or ``None`` if unavailable."""
    global _typescript_parser, _typescript_load_attempted
    if _typescript_parser is not None:
        return _typescript_parser
    if _typescript_load_attempted:
        return None
    _typescript_load_attempted = True
    _typescript_parser = _try_get_parser("typescript")
    return _typescript_parser


def get_tsx_parser() -> Optional[Any]:
    """Return a cached tree-sitter TSX parser, or ``None`` if unavailable."""
    global _tsx_parser, _tsx_load_attempted
    if _tsx_parser is not None:
        return _tsx_parser
    if _tsx_load_attempted:
        return None
    _tsx_load_attempted = True
    _tsx_parser = _try_get_parser("tsx")
    return _tsx_parser


def get_parser_for(file_path: str):
    """Return the tree-sitter parser for a source file's extension, or None
    if no parser is available (e.g. SDK missing)."""
    ext = file_path.lower().rsplit(".", 1)[-1] if "." in file_path else ""
    if ext == "py":
        return get_python_parser()
    if ext == "tsx":
        return get_tsx_parser()
    if ext == "ts":
        return get_typescript_parser()
    return None
