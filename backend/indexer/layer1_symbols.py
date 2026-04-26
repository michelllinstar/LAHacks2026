"""Layer 1 symbol & reference extraction from a tree-sitter Python tree.

Extracts function/class definitions and top-level assignments, then walks call
expressions to produce reference edges keyed by qualified name. Resolution to
target qualified names is best-effort and static-only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class SymbolRow:
    qualified_name: str
    file_path: str
    line_start: int
    line_end: int
    kind: str  # "function" | "class" | "method" | "variable" | "type"
    # ("type" is emitted by the TypeScript extractor for interface, type
    # alias, and enum declarations. Layers 2 and 4 filter to function/method
    # only, so type symbols are correctly ignored downstream.)
    signature: str = ""


@dataclass
class RefRow:
    source_qname: str
    target_qname: str
    edge_kind: str  # "calls" | "imports" | "inherits"


@dataclass
class _ScopeState:
    module_qname: str
    file_path: str
    symbols: list[SymbolRow] = field(default_factory=list)
    refs: list[RefRow] = field(default_factory=list)
    # Local alias map: name -> qualified name (best-effort).
    aliases: dict[str, str] = field(default_factory=dict)


def module_qname_for(repo_root: str, file_path: str) -> str:
    """Convert ``repo_root/pkg/mod.py`` to ``pkg.mod``.

    Also handles ``.ts``/``.tsx``: ``with_suffix('')`` strips the single
    trailing extension for any of these.
    """
    from pathlib import Path

    p = Path(file_path).resolve()
    try:
        rel = p.relative_to(Path(repo_root).resolve())
    except ValueError:
        rel = Path(p.name)
    parts = list(rel.with_suffix("").parts)
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    # ``index.ts``/``index.tsx`` is the JS/TS analogue of ``__init__.py`` —
    # collapse it so a top-level export looks like ``pkg.foo`` rather than
    # ``pkg.index.foo``.
    if parts and parts[-1] == "index" and file_path.lower().endswith((".ts", ".tsx")):
        parts = parts[:-1]
    return ".".join(parts) if parts else p.stem


def extract_symbols(
    file_path: str,
    source_bytes: bytes,
    tree: Any,
    module_qname: Optional[str] = None,
) -> tuple[list[SymbolRow], list[RefRow]]:
    """Walk a tree-sitter root node and return symbol + ref rows.

    Dispatches to the per-language extractor by file extension. Both
    extractors return identically-shaped ``SymbolRow``/``RefRow`` lists so
    Layer 2/3/4 builders are language-agnostic.
    """
    if tree is None:
        return [], []
    lower = file_path.lower()
    if lower.endswith((".ts", ".tsx")):
        return _extract_symbols_typescript(file_path, source_bytes, tree, module_qname)
    return _extract_symbols_python(file_path, source_bytes, tree, module_qname)


def _extract_symbols_python(
    file_path: str,
    source_bytes: bytes,
    tree: Any,
    module_qname: Optional[str] = None,
) -> tuple[list[SymbolRow], list[RefRow]]:
    root = tree.root_node
    state = _ScopeState(
        module_qname=module_qname or "",
        file_path=file_path,
    )
    _collect_imports(root, source_bytes, state)
    _walk(root, source_bytes, state, parent_qname=state.module_qname)
    return state.symbols, state.refs


# ---------------------------------------------------------------------------
# Tree walking
# ---------------------------------------------------------------------------


def _node_text(node: Any, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _child_by_field(node: Any, name: str) -> Optional[Any]:
    try:
        return node.child_by_field_name(name)
    except Exception:
        return None


def _qualified(parent: str, name: str) -> str:
    return f"{parent}.{name}" if parent else name


def _collect_imports(root: Any, source: bytes, state: _ScopeState) -> None:
    for child in _iter_descendants(root):
        if child.type == "import_statement":
            # `import x` or `import x as y` or `import x.y`
            for sub in child.named_children:
                if sub.type == "dotted_name":
                    name = _node_text(sub, source)
                    state.aliases[name.split(".")[0]] = name
                elif sub.type == "aliased_import":
                    target = _child_by_field(sub, "name")
                    alias = _child_by_field(sub, "alias")
                    if target and alias:
                        state.aliases[_node_text(alias, source)] = _node_text(target, source)
        elif child.type == "import_from_statement":
            module_node = _child_by_field(child, "module_name")
            module_name = _node_text(module_node, source) if module_node else ""
            for sub in child.named_children:
                if sub is module_node:
                    continue
                if sub.type == "dotted_name":
                    leaf = _node_text(sub, source)
                    state.aliases[leaf] = f"{module_name}.{leaf}" if module_name else leaf
                elif sub.type == "aliased_import":
                    target = _child_by_field(sub, "name")
                    alias = _child_by_field(sub, "alias")
                    if target and alias:
                        leaf = _node_text(target, source)
                        alias_name = _node_text(alias, source)
                        state.aliases[alias_name] = (
                            f"{module_name}.{leaf}" if module_name else leaf
                        )


def _iter_descendants(node: Any):
    stack = [node]
    while stack:
        current = stack.pop()
        yield current
        for child in current.children:
            stack.append(child)


def _walk(node: Any, source: bytes, state: _ScopeState, parent_qname: str) -> None:
    """Recursively scan ``node`` collecting symbol/ref rows."""
    for child in node.children:
        if child.type == "function_definition":
            _emit_function(child, source, state, parent_qname)
        elif child.type == "class_definition":
            _emit_class(child, source, state, parent_qname)
        elif child.type == "decorated_definition":
            inner = child.named_children[-1] if child.named_children else None
            if inner is None:
                continue
            if inner.type == "function_definition":
                _emit_function(inner, source, state, parent_qname)
            elif inner.type == "class_definition":
                _emit_class(inner, source, state, parent_qname)
        elif child.type == "expression_statement" and parent_qname == state.module_qname:
            _maybe_emit_top_level_assignment(child, source, state, parent_qname)


def _emit_function(node: Any, source: bytes, state: _ScopeState, parent_qname: str) -> None:
    name_node = _child_by_field(node, "name")
    if name_node is None:
        return
    name = _node_text(name_node, source)
    qname = _qualified(parent_qname, name)
    params_node = _child_by_field(node, "parameters")
    signature = f"{name}{_node_text(params_node, source)}" if params_node else f"{name}()"
    kind = "method" if parent_qname != state.module_qname and parent_qname else "function"
    state.symbols.append(
        SymbolRow(
            qualified_name=qname,
            file_path=state.file_path,
            line_start=node.start_point[0] + 1,
            line_end=node.end_point[0] + 1,
            kind=kind,
            signature=signature,
        )
    )
    body = _child_by_field(node, "body")
    if body is not None:
        _scan_calls(body, source, state, current_qname=qname)
        _walk(body, source, state, parent_qname=qname)


def _emit_class(node: Any, source: bytes, state: _ScopeState, parent_qname: str) -> None:
    name_node = _child_by_field(node, "name")
    if name_node is None:
        return
    name = _node_text(name_node, source)
    qname = _qualified(parent_qname, name)
    sup_node = _child_by_field(node, "superclasses")
    signature = f"class {name}{_node_text(sup_node, source) if sup_node else ''}"
    state.symbols.append(
        SymbolRow(
            qualified_name=qname,
            file_path=state.file_path,
            line_start=node.start_point[0] + 1,
            line_end=node.end_point[0] + 1,
            kind="class",
            signature=signature.strip(),
        )
    )
    # Inheritance edges
    if sup_node is not None:
        for arg in sup_node.named_children:
            base_text = _node_text(arg, source).strip()
            base_qname = state.aliases.get(base_text.split(".")[0], base_text)
            state.refs.append(
                RefRow(
                    source_qname=qname,
                    target_qname=base_qname,
                    edge_kind="inherits",
                )
            )
    body = _child_by_field(node, "body")
    if body is not None:
        _walk(body, source, state, parent_qname=qname)


def _maybe_emit_top_level_assignment(
    node: Any, source: bytes, state: _ScopeState, parent_qname: str
) -> None:
    if not node.named_children:
        return
    inner = node.named_children[0]
    if inner.type != "assignment":
        return
    left = _child_by_field(inner, "left")
    if left is None or left.type != "identifier":
        return
    name = _node_text(left, source)
    qname = _qualified(parent_qname, name)
    state.symbols.append(
        SymbolRow(
            qualified_name=qname,
            file_path=state.file_path,
            line_start=node.start_point[0] + 1,
            line_end=node.end_point[0] + 1,
            kind="variable",
            signature=name,
        )
    )


def _scan_calls(node: Any, source: bytes, state: _ScopeState, current_qname: str) -> None:
    """Collect ``calls`` edges from any call expression beneath ``node``."""
    for descendant in _iter_descendants(node):
        if descendant.type != "call":
            continue
        func = _child_by_field(descendant, "function")
        if func is None:
            continue
        target_text = _node_text(func, source).strip()
        if not target_text:
            continue
        head = target_text.split(".")[0]
        resolved_head = state.aliases.get(head, head)
        if "." in target_text:
            target_qname = resolved_head + target_text[len(head) :]
        else:
            target_qname = resolved_head
        state.refs.append(
            RefRow(
                source_qname=current_qname,
                target_qname=target_qname,
                edge_kind="calls",
            )
        )


# ---------------------------------------------------------------------------
# TypeScript extractor
# ---------------------------------------------------------------------------
#
# Walks the tree-sitter-typescript / tree-sitter-tsx grammar. The grammars
# share most node types (tsx is a superset). Best-effort qualified-name
# resolution mirrors the Python extractor:
#   * Top-level declarations -> ``module.name``
#   * Methods                -> ``module.ClassName.method``
#   * Arrow functions bound in ``const foo = () => ...`` -> ``module.foo``
# Refs that don't resolve to a known symbol get dropped by the runner.


_TS_TYPE_NODES = {
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
}


def _extract_symbols_typescript(
    file_path: str,
    source_bytes: bytes,
    tree: Any,
    module_qname: Optional[str] = None,
) -> tuple[list[SymbolRow], list[RefRow]]:
    root = tree.root_node
    state = _ScopeState(
        module_qname=module_qname or "",
        file_path=file_path,
    )
    _collect_ts_imports(root, source_bytes, state)
    _walk_ts(root, source_bytes, state, parent_qname=state.module_qname)
    return state.symbols, state.refs


def _collect_ts_imports(root: Any, source: bytes, state: _ScopeState) -> None:
    """Populate the alias map from ``import_statement`` nodes.

    Handles named imports (``import { foo, bar as baz } from 'm'``),
    default imports (``import Foo from 'm'``), and namespace imports
    (``import * as ns from 'm'``). Module specifiers stay as strings —
    the resolver doesn't need a strict canonical form to match local
    qualified names.
    """
    for child in _iter_descendants(root):
        if child.type != "import_statement":
            continue
        # Find the source string.
        module_name = ""
        for sub in child.children:
            if sub.type == "string":
                # string node has string_fragment child(ren).
                for s in sub.named_children:
                    if s.type == "string_fragment":
                        module_name = _node_text(s, source)
                        break
                break
        for clause in child.named_children:
            if clause.type != "import_clause":
                continue
            for spec in _iter_descendants(clause):
                if spec.type == "import_specifier":
                    name_node = _child_by_field(spec, "name")
                    alias_node = _child_by_field(spec, "alias")
                    if name_node is None:
                        continue
                    name = _node_text(name_node, source)
                    alias = _node_text(alias_node, source) if alias_node else name
                    state.aliases[alias] = (
                        f"{module_name}.{name}" if module_name else name
                    )
                elif spec.type == "namespace_import":
                    # `* as ns` — the local binding is the trailing identifier.
                    ident = None
                    for c in spec.children:
                        if c.type == "identifier":
                            ident = c
                    if ident is not None:
                        state.aliases[_node_text(ident, source)] = module_name or "*"
                elif spec.type == "identifier" and spec.parent is clause:
                    # Default import: `import Foo from 'm'`.
                    state.aliases[_node_text(spec, source)] = (
                        f"{module_name}.default" if module_name else "default"
                    )


def _walk_ts(node: Any, source: bytes, state: _ScopeState, parent_qname: str) -> None:
    """Recursively scan a TypeScript AST collecting symbol/ref rows."""
    for child in node.children:
        t = child.type
        if t == "function_declaration":
            _emit_ts_function(child, source, state, parent_qname)
        elif t == "class_declaration":
            _emit_ts_class(child, source, state, parent_qname)
        elif t in _TS_TYPE_NODES and parent_qname == state.module_qname:
            _emit_ts_type(child, source, state, parent_qname)
        elif t == "lexical_declaration" or t == "variable_declaration":
            # ``const foo = () => ...`` and ``const foo = function() {}``.
            for declarator in child.named_children:
                if declarator.type != "variable_declarator":
                    continue
                _maybe_emit_ts_arrow(declarator, source, state, parent_qname)
        elif t == "export_statement":
            # Recurse: the actual decl is a child.
            _walk_ts(child, source, state, parent_qname)


def _emit_ts_function(
    node: Any, source: bytes, state: _ScopeState, parent_qname: str
) -> None:
    name_node = _child_by_field(node, "name")
    if name_node is None:
        # Find first identifier child as a fallback.
        for c in node.children:
            if c.type == "identifier":
                name_node = c
                break
    if name_node is None:
        return
    name = _node_text(name_node, source)
    qname = _qualified(parent_qname, name)
    params_node = _child_by_field(node, "parameters")
    signature = (
        f"{name}{_node_text(params_node, source)}" if params_node else f"{name}()"
    )
    kind = "method" if parent_qname != state.module_qname and parent_qname else "function"
    state.symbols.append(
        SymbolRow(
            qualified_name=qname,
            file_path=state.file_path,
            line_start=node.start_point[0] + 1,
            line_end=node.end_point[0] + 1,
            kind=kind,
            signature=signature,
        )
    )
    body = _child_by_field(node, "body")
    if body is not None:
        _scan_ts_calls(body, source, state, current_qname=qname)


def _emit_ts_class(
    node: Any, source: bytes, state: _ScopeState, parent_qname: str
) -> None:
    name_node = _child_by_field(node, "name")
    if name_node is None:
        for c in node.children:
            if c.type == "type_identifier":
                name_node = c
                break
    if name_node is None:
        return
    name = _node_text(name_node, source)
    qname = _qualified(parent_qname, name)
    state.symbols.append(
        SymbolRow(
            qualified_name=qname,
            file_path=state.file_path,
            line_start=node.start_point[0] + 1,
            line_end=node.end_point[0] + 1,
            kind="class",
            signature=f"class {name}",
        )
    )
    # ``extends_clause`` — emit ``inherits`` ref edges.
    for desc in _iter_descendants(node):
        if desc.type == "extends_clause":
            for child in desc.named_children:
                base_text = _node_text(child, source).strip()
                if not base_text:
                    continue
                head = base_text.split(".")[0]
                resolved_head = state.aliases.get(head, head)
                target = (
                    resolved_head + base_text[len(head):]
                    if "." in base_text
                    else resolved_head
                )
                state.refs.append(
                    RefRow(
                        source_qname=qname,
                        target_qname=target,
                        edge_kind="inherits",
                    )
                )
            break
    # Methods.
    body_node = None
    for c in node.children:
        if c.type == "class_body":
            body_node = c
            break
    if body_node is None:
        return
    for member in body_node.named_children:
        if member.type != "method_definition":
            continue
        m_name_node = None
        for c in member.children:
            if c.type in ("property_identifier", "identifier"):
                m_name_node = c
                break
        if m_name_node is None:
            continue
        m_name = _node_text(m_name_node, source)
        m_qname = _qualified(qname, m_name)
        params_node = _child_by_field(member, "parameters")
        signature = (
            f"{m_name}{_node_text(params_node, source)}"
            if params_node
            else f"{m_name}()"
        )
        state.symbols.append(
            SymbolRow(
                qualified_name=m_qname,
                file_path=state.file_path,
                line_start=member.start_point[0] + 1,
                line_end=member.end_point[0] + 1,
                kind="method",
                signature=signature,
            )
        )
        m_body = _child_by_field(member, "body")
        if m_body is not None:
            _scan_ts_calls(m_body, source, state, current_qname=m_qname)


def _emit_ts_type(
    node: Any, source: bytes, state: _ScopeState, parent_qname: str
) -> None:
    name_node = None
    for c in node.children:
        if c.type in ("type_identifier", "identifier"):
            name_node = c
            break
    if name_node is None:
        return
    name = _node_text(name_node, source)
    qname = _qualified(parent_qname, name)
    state.symbols.append(
        SymbolRow(
            qualified_name=qname,
            file_path=state.file_path,
            line_start=node.start_point[0] + 1,
            line_end=node.end_point[0] + 1,
            kind="type",
            signature=name,
        )
    )


def _maybe_emit_ts_arrow(
    declarator: Any, source: bytes, state: _ScopeState, parent_qname: str
) -> None:
    """Treat ``const foo = () => ...`` / ``const foo = function() {}`` as a
    named function symbol bound to ``foo``."""
    name_node = None
    value_node = None
    for c in declarator.children:
        if c.type == "identifier" and name_node is None:
            name_node = c
        elif c.type in ("arrow_function", "function_expression", "function"):
            value_node = c
    if name_node is None or value_node is None:
        return
    name = _node_text(name_node, source)
    qname = _qualified(parent_qname, name)
    params_node = _child_by_field(value_node, "parameters")
    signature = (
        f"{name}{_node_text(params_node, source)}" if params_node else f"{name}()"
    )
    state.symbols.append(
        SymbolRow(
            qualified_name=qname,
            file_path=state.file_path,
            line_start=declarator.start_point[0] + 1,
            line_end=declarator.end_point[0] + 1,
            kind="function",
            signature=signature,
        )
    )
    body = _child_by_field(value_node, "body")
    if body is not None:
        _scan_ts_calls(body, source, state, current_qname=qname)


def _scan_ts_calls(
    node: Any, source: bytes, state: _ScopeState, current_qname: str
) -> None:
    """Collect ``calls`` edges from any ``call_expression`` beneath ``node``."""
    for descendant in _iter_descendants(node):
        if descendant.type != "call_expression":
            continue
        func = _child_by_field(descendant, "function")
        if func is None:
            # Fallback: first non-arguments child.
            for c in descendant.children:
                if c.type != "arguments":
                    func = c
                    break
        if func is None:
            continue
        target_text = _node_text(func, source).strip()
        if not target_text:
            continue
        head = target_text.split(".")[0]
        resolved_head = state.aliases.get(head, head)
        if "." in target_text:
            target_qname = resolved_head + target_text[len(head):]
        else:
            target_qname = resolved_head
        state.refs.append(
            RefRow(
                source_qname=current_qname,
                target_qname=target_qname,
                edge_kind="calls",
            )
        )
