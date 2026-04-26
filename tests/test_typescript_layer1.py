"""Layer 1 TypeScript support tests.

SPEC §10 mandates Python + TypeScript. These tests cover walker file
selection, the per-file parser router, and the TypeScript-specific symbol
extractor. Each TypeScript-only test skips when the tree-sitter grammar
isn't shipped in the local ``tree_sitter_languages`` install.
"""

from __future__ import annotations

import pytest

pytest.importorskip("tree_sitter_languages")

from backend.indexer import layer1_symbols
from backend.indexer.treesitter_loader import (
    get_parser_for,
    get_python_parser,
    get_typescript_parser,
)
from backend.indexer.walker import walk_repo


def test_walker_includes_ts_files(tmp_path):
    """``walk_repo`` yields .ts/.tsx but never .d.ts or unrelated extensions."""
    (tmp_path / "a.py").write_text("x = 1\n")
    (tmp_path / "b.ts").write_text("export const x = 1;\n")
    (tmp_path / "c.tsx").write_text("export const X = () => null;\n")
    (tmp_path / "d.d.ts").write_text("export declare const x: number;\n")
    (tmp_path / "e.js").write_text("const x = 1;\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "skip.ts").write_text("export const y = 2;\n")

    found = {p.name for p in walk_repo(tmp_path)}
    assert "a.py" in found
    assert "b.ts" in found
    assert "c.tsx" in found
    assert "d.d.ts" not in found
    assert "e.js" not in found
    assert "skip.ts" not in found


def test_get_parser_for_dispatches():
    """``get_parser_for`` routes by extension and returns None for unknown."""
    # If a grammar is present we get a parser; if not, get_parser_for
    # mirrors the loader and returns None — both outcomes are valid here,
    # we just want to confirm dispatch behavior is consistent with the
    # individual loaders.
    assert get_parser_for("foo.py") is get_python_parser()
    assert get_parser_for("foo.ts") is get_typescript_parser()
    # tsx routes to its own parser; we just assert it doesn't go to
    # python and doesn't crash.
    tsx = get_parser_for("foo.tsx")
    assert tsx is not get_python_parser() or tsx is None
    assert get_parser_for("foo.rs") is None
    assert get_parser_for("README") is None


def test_extract_symbols_typescript_function():
    """A ``function_declaration`` becomes a ``function`` SymbolRow."""
    parser = get_typescript_parser()
    if parser is None:
        pytest.skip("typescript grammar not available")

    source = b"function add(a: number, b: number): number { return a + b; }\n"
    tree = parser.parse(source)
    symbols, _refs = layer1_symbols.extract_symbols(
        file_path="/repo/src/util.ts",
        source_bytes=source,
        tree=tree,
        module_qname="src.util",
    )
    funcs = [s for s in symbols if s.kind == "function"]
    assert len(funcs) == 1
    assert funcs[0].qualified_name == "src.util.add"
    assert "add" in funcs[0].signature


def test_extract_symbols_typescript_class_method():
    """A class with a method emits both a class and a method SymbolRow."""
    parser = get_typescript_parser()
    if parser is None:
        pytest.skip("typescript grammar not available")

    source = b"class Foo { bar() { return 1; } }\n"
    tree = parser.parse(source)
    symbols, _refs = layer1_symbols.extract_symbols(
        file_path="/repo/src/foo.ts",
        source_bytes=source,
        tree=tree,
        module_qname="src.foo",
    )
    qnames = {s.qualified_name: s.kind for s in symbols}
    assert qnames.get("src.foo.Foo") == "class"
    assert qnames.get("src.foo.Foo.bar") == "method"
