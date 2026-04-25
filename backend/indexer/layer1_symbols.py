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
    kind: str  # "function" | "class" | "method" | "variable"
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
    """Convert ``repo_root/pkg/mod.py`` to ``pkg.mod``."""
    from pathlib import Path

    p = Path(file_path).resolve()
    try:
        rel = p.relative_to(Path(repo_root).resolve())
    except ValueError:
        rel = Path(p.name)
    parts = list(rel.with_suffix("").parts)
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts) if parts else p.stem


def extract_symbols(
    file_path: str,
    source_bytes: bytes,
    tree: Any,
    module_qname: Optional[str] = None,
) -> tuple[list[SymbolRow], list[RefRow]]:
    """Walk a tree-sitter root node and return symbol + ref rows."""
    if tree is None:
        return [], []
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
