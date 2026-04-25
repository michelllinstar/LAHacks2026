"""Repository walker — yields source files the indexer should parse."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

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

# MVP supports Python only.
_SUPPORTED_SUFFIXES = {".py"}


def walk_repo(root: str | Path) -> Iterator[Path]:
    """Yield supported source files beneath ``root`` in deterministic order."""
    root_path = Path(root).resolve()
    if not root_path.exists():
        return
    for path in _iter(root_path):
        if path.suffix in _SUPPORTED_SUFFIXES:
            yield path


def _iter(root: Path) -> Iterator[Path]:
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir(), key=lambda p: p.name)
        except (PermissionError, FileNotFoundError):
            continue
        for entry in entries:
            if entry.is_symlink():
                continue
            if entry.is_dir():
                if entry.name in _SKIP_DIRS or entry.name.startswith("."):
                    continue
                stack.append(entry)
            elif entry.is_file():
                yield entry
