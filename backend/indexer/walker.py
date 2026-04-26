"""Repository walker — yields source files the indexer should parse."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

# Directories we never descend into.
_SKIP_DIRS = {
    "__pycache__",
    ".git",
    ".venv",
    "venv",
    "node_modules",
    ".next",
    ".mypy_cache",
    ".pytest_cache",
    ".tox",
    "dist",
    "build",
    ".idea",
    ".vscode",
}

# SPEC §10 — Python + TypeScript. ``.d.ts`` / ``.d.tsx`` declaration files
# are skipped explicitly because they contain only type signatures, no
# executable code.
_SUPPORTED_SUFFIXES = {".py", ".ts", ".tsx"}
_DECLARATION_SUFFIXES = (".d.ts", ".d.tsx")


def walk_repo(root: str | Path) -> Iterator[Path]:
    """Yield supported source files beneath ``root`` in deterministic order."""
    root_path = Path(root).resolve()
    if not root_path.exists():
        logger.warning("walk_repo: root does not exist root=%s", str(root_path))
        return
    logger.info("walk_repo: starting walk root=%s", str(root_path))
    total_seen = 0
    skipped_ext = 0
    skipped_decl = 0
    yielded = 0
    for path in _iter(root_path):
        total_seen += 1
        if path.suffix not in _SUPPORTED_SUFFIXES:
            skipped_ext += 1
            logger.debug("walk_repo: skip (unsupported suffix) path=%s", str(path))
            continue
        if path.name.endswith(_DECLARATION_SUFFIXES):
            skipped_decl += 1
            logger.debug("walk_repo: skip (declaration file) path=%s", str(path))
            continue
        yielded += 1
        logger.debug("walk_repo: yield path=%s", str(path))
        yield path
    logger.info(
        "walk_repo: complete root=%s seen=%d yielded=%d skipped_ext=%d skipped_decl=%d",
        str(root_path),
        total_seen,
        yielded,
        skipped_ext,
        skipped_decl,
    )


def _iter(root: Path) -> Iterator[Path]:
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir(), key=lambda p: p.name)
        except (PermissionError, FileNotFoundError) as exc:
            logger.warning("walk_repo: cannot list dir path=%s reason=%s", str(current), exc)
            continue
        for entry in entries:
            if entry.is_symlink():
                logger.debug("walk_repo: skip (symlink) path=%s", str(entry))
                continue
            if entry.is_dir():
                if entry.name in _SKIP_DIRS or entry.name.startswith("."):
                    logger.debug("walk_repo: skip dir name=%s", entry.name)
                    continue
                stack.append(entry)
            elif entry.is_file():
                yield entry
