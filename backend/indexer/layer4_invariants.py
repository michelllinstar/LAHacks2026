"""Layer 4 invariant extractor — implicit-constraint mining.

Implements SPEC §4.4. Mines three sources of implicit invariants over Python
sources in an indexed repo:

* **Tests** (confidence 0.85): assertions in ``test_*.py`` / ``*_test.py`` /
  ``tests/`` files mapped back to the most recently invoked production symbol
  in the enclosing function body.
* **Defensive checks** (confidence 0.60): early-return-on-falsy patterns,
  intra-body asserts, and parameter-validating raises inside function bodies.
* **Comment-derived** (confidence 0.35, optional): when ``ANTHROPIC_API_KEY``
  is set, run a small Claude prompt over functions whose docstring/comment
  block sits within ``comment_distance_lines`` of a risky construct
  (``raise``/``try``/``return None``).

All candidates are validated against Layer 1 — invariants whose target symbol
cannot be resolved are rejected and counted. Surviving rows are bulk-inserted
via ``db_store.bulk_insert_invariants`` and emitted as Layer 4 graph deltas
(``node_added`` for the invariant, ``edge_added`` of kind ``constrains`` for
the symbol attachment) so the visualization frontend can render them as
SPEC §8.3 prescribes.
"""

from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Optional

from bson import ObjectId

from backend.db import store as db_store
from backend.lib import llm

from .treesitter_loader import get_python_parser
from .walker import walk_repo

logger = logging.getLogger(__name__)

EmitFn = Callable[[str, dict], None]

_FUNCTION_KINDS = {"function", "method"}

_TEST_CONFIDENCE = 0.85
_DEFENSIVE_CONFIDENCE = 0.60
_COMMENT_CONFIDENCE = 0.35

_SOURCE_PRIORITY = {"test": 0, "defensive": 1, "comment": 2}

_MAX_TEXT_LEN = 500
_LABEL_TRUNC = 80
_DEDUPE_TEXT_KEY = 200


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build(
    repo_hash: str,
    repo_path: Optional[str] = None,
    *,
    max_invariants: int = 2000,
    max_comment_invariants: int = 200,
    comment_distance_lines: int = 3,
    emit: Optional[EmitFn] = None,
) -> dict:
    """Mine Layer 4 invariants for ``repo_hash``.

    Returns ``{"invariants": N, "by_source": {"test": A, "defensive": B,
    "comment": C}, "rejected": K, "capped": bool}``.
    """
    zero_stats = {
        "invariants": 0,
        "by_source": {"test": 0, "defensive": 0, "comment": 0},
        "rejected": 0,
        "capped": False,
    }

    symbols = list(db_store.iter_symbols(repo_hash))
    if not symbols:
        logger.info("layer 4: no Layer 1 symbols found; skipping invariant build")
        return zero_stats

    qname_to_id: dict[str, ObjectId] = {}
    valid_symbol_ids: set[ObjectId] = set()
    function_symbols_by_file: dict[str, list[dict]] = {}
    for sym in symbols:
        sid = sym.get("_id")
        qname = sym.get("qualified_name")
        if sid is None:
            continue
        valid_symbol_ids.add(sid)
        if qname:
            # Last writer wins is fine — text dedupe upstream.
            qname_to_id.setdefault(qname, sid)
        if sym.get("kind") in _FUNCTION_KINDS:
            function_symbols_by_file.setdefault(sym.get("file_path", ""), []).append(sym)
    for file_path, fns in function_symbols_by_file.items():
        fns.sort(key=lambda s: s.get("line_start", 0))

    db_store.reset_invariants(repo_hash)

    if repo_path is None:
        logger.warning("layer 4: repo_path missing; cannot read source files")
        return zero_stats

    parser = get_python_parser()
    if parser is None:
        logger.warning("layer 4: tree-sitter parser unavailable; skipping")
        return zero_stats

    candidates: list[dict] = []
    rejected = 0
    comment_budget = max_comment_invariants
    use_llm = bool(os.getenv("ANTHROPIC_API_KEY"))
    comment_tasks: list[dict] = []

    for path in walk_repo(repo_path):
        try:
            source_bytes = path.read_bytes()
        except OSError as exc:
            logger.warning("layer 4: could not read %s: %s", path, exc)
            continue
        try:
            tree = parser.parse(source_bytes)
        except Exception as exc:
            logger.warning("layer 4: parse failure for %s: %s", path, exc)
            continue
        if tree is None or tree.root_node is None:
            continue

        file_path_str = str(path)

        # 1) Test-derived invariants.
        if _is_test_path(path):
            test_cands, test_rejected = _extract_test_invariants(
                tree.root_node, source_bytes, file_path_str, qname_to_id
            )
            candidates.extend(test_cands)
            rejected += test_rejected

        # 2) Defensive-check invariants — over function symbols seen in this file.
        fn_syms = function_symbols_by_file.get(file_path_str, [])
        if fn_syms:
            def_cands = _extract_defensive_invariants(
                tree.root_node, source_bytes, file_path_str, fn_syms
            )
            candidates.extend(def_cands)

            # 3) Comment-derived (optional, capped). Collect prompts here;
            # we dispatch them concurrently after the per-file walk.
            if use_llm and comment_budget > 0:
                file_tasks = _collect_comment_tasks(
                    tree.root_node,
                    source_bytes,
                    file_path_str,
                    fn_syms,
                    comment_distance_lines=comment_distance_lines,
                    budget=comment_budget,
                )
                comment_tasks.extend(file_tasks)
                comment_budget -= len(file_tasks)

    # Execute the LLM-backed comment-derivation tasks concurrently. Cap at 4
    # in-flight calls (max_comment_invariants=200 budget already enforced).
    if comment_tasks:
        cm_cands = _run_comment_tasks(comment_tasks, max_workers=4)
        candidates.extend(cm_cands)

    # ------------------------------------------------------------------
    # Validate, normalize, dedupe.
    # ------------------------------------------------------------------
    cleaned: list[dict] = []
    seen_keys: set[tuple[ObjectId, str, str]] = set()
    for cand in candidates:
        target = cand.get("target_symbol_id")
        if target is None or target not in valid_symbol_ids:
            rejected += 1
            continue
        text = cand.get("text") or ""
        text = " ".join(text.split())  # collapse whitespace incl. newlines
        if not text:
            rejected += 1
            continue
        if len(text) > _MAX_TEXT_LEN:
            text = text[:_MAX_TEXT_LEN]
        key = (target, cand["source_kind"], text[:_DEDUPE_TEXT_KEY])
        if key in seen_keys:
            continue
        seen_keys.add(key)
        cleaned.append(
            {
                "target_symbol_id": target,
                "text": text,
                "source_kind": cand["source_kind"],
                "source_location": cand.get("source_location", ""),
                "confidence": float(cand.get("confidence", 0.0)),
            }
        )

    capped = False
    if len(cleaned) > max_invariants:
        capped = True
        logger.warning(
            "layer 4: collected %d invariants, capping to %d",
            len(cleaned),
            max_invariants,
        )
        cleaned.sort(
            key=lambda r: (
                -r["confidence"],
                _SOURCE_PRIORITY.get(r["source_kind"], 99),
            )
        )
        cleaned = cleaned[:max_invariants]

    # ------------------------------------------------------------------
    # Persist + emit.
    # ------------------------------------------------------------------
    inv_ids: list[ObjectId] = []
    if cleaned:
        inv_ids = db_store.bulk_insert_invariants(repo_hash, cleaned)

    by_source = {"test": 0, "defensive": 0, "comment": 0}
    for row in cleaned:
        by_source[row["source_kind"]] = by_source.get(row["source_kind"], 0) + 1

    if emit is not None:
        for inv_id, row in zip(inv_ids, cleaned):
            label = row["text"]
            if len(label) > _LABEL_TRUNC:
                label = label[: _LABEL_TRUNC - 1] + "…"
            target_id = row["target_symbol_id"]
            emit(
                "node_added",
                {
                    "layer": "invariant",
                    "node": {
                        "id": str(inv_id),
                        "kind": "invariant",
                        "label": label,
                        "layer": 4,
                        "metadata": {
                            "target_symbol_id": str(target_id),
                            "source_kind": row["source_kind"],
                            "source_location": row["source_location"],
                            "confidence": row["confidence"],
                        },
                    },
                },
            )
            emit(
                "edge_added",
                {
                    "layer": "invariant",
                    "edge": {
                        "id": f"inv-edge-{inv_id}",
                        "source": str(inv_id),
                        "target": str(target_id),
                        "kind": "constrains",
                        "weight": float(row["confidence"]),
                    },
                },
            )

    return {
        "invariants": len(cleaned),
        "by_source": by_source,
        "rejected": rejected,
        "capped": capped,
    }


# ---------------------------------------------------------------------------
# Helpers — file classification, AST traversal
# ---------------------------------------------------------------------------


def _is_test_path(path: Path) -> bool:
    name = path.name
    if name.startswith("test_") and name.endswith(".py"):
        return True
    if name.endswith("_test.py"):
        return True
    parts = {p.lower() for p in path.parts}
    return "tests" in parts


def _node_text(node: Any, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _child_by_field(node: Any, name: str) -> Optional[Any]:
    try:
        return node.child_by_field_name(name)
    except Exception:
        return None


def _iter_descendants(node: Any):
    stack = [node]
    while stack:
        current = stack.pop()
        yield current
        for child in current.children:
            stack.append(child)


def _enclosing_function_for_line(
    fn_syms: list[dict], line: int
) -> Optional[dict]:
    """Return the innermost function symbol whose [start, end] contains ``line``."""
    best: Optional[dict] = None
    for sym in fn_syms:
        start = sym.get("line_start", 0)
        end = sym.get("line_end", 0)
        if start <= line <= end:
            if best is None:
                best = sym
            else:
                # Innermost = larger start.
                if start >= best.get("line_start", 0):
                    best = sym
    return best


# ---------------------------------------------------------------------------
# Test-derived extraction
# ---------------------------------------------------------------------------


def _extract_test_invariants(
    root: Any,
    source: bytes,
    file_path: str,
    qname_to_id: dict[str, ObjectId],
) -> tuple[list[dict], int]:
    """Walk asserts in a test file; map each to the most recent prior call."""
    candidates: list[dict] = []
    rejected = 0

    # Walk function definitions in the file; for each, scan body order.
    for fn_node in _iter_descendants(root):
        if fn_node.type != "function_definition":
            continue
        body = _child_by_field(fn_node, "body")
        if body is None:
            continue
        # We need an ordered traversal of statements that yields both calls
        # and assert statements so "most recent prior call" is well-defined.
        last_call_qname: Optional[str] = None
        for stmt in body.named_children:
            # Pre-statement: collect any call expressions descended from it
            # before checking if the statement is an assert. This handles
            # patterns like ``result = foo(); assert result == 1``.
            if stmt.type == "assert_statement":
                if last_call_qname is None:
                    rejected += 1
                    continue
                target_id = qname_to_id.get(last_call_qname)
                if target_id is None:
                    # Try short-name fallback against any qname ending in .name.
                    target_id = _resolve_short_qname(last_call_qname, qname_to_id)
                if target_id is None:
                    rejected += 1
                    continue
                # The assert's "condition" is its first named child.
                cond = stmt.named_children[0] if stmt.named_children else None
                if cond is None:
                    rejected += 1
                    continue
                text = _node_text(cond, source).strip()
                if not text:
                    rejected += 1
                    continue
                candidates.append(
                    {
                        "target_symbol_id": target_id,
                        "text": text,
                        "source_kind": "test",
                        "source_location": f"{file_path}:{stmt.start_point[0] + 1}",
                        "confidence": _TEST_CONFIDENCE,
                    }
                )
            else:
                # Update last_call_qname to the deepest call within this stmt.
                call_q = _last_call_qname_within(stmt, source)
                if call_q is not None:
                    last_call_qname = call_q

    return candidates, rejected


def _last_call_qname_within(node: Any, source: bytes) -> Optional[str]:
    """Return the textual qname of the last (deepest, latest) call in node."""
    found: Optional[str] = None
    found_byte = -1
    for desc in _iter_descendants(node):
        if desc.type != "call":
            continue
        func = _child_by_field(desc, "function")
        if func is None:
            continue
        text = _node_text(func, source).strip()
        if not text:
            continue
        if desc.start_byte >= found_byte:
            found = text
            found_byte = desc.start_byte
    return found


def _resolve_short_qname(
    raw: str, qname_to_id: dict[str, ObjectId]
) -> Optional[ObjectId]:
    """Best-effort: match ``raw`` (or its tail) against qname_to_id endings."""
    if raw in qname_to_id:
        return qname_to_id[raw]
    # `obj.method(...)` forms — try the dotted suffix.
    candidate_tails = [raw]
    if "." in raw:
        # last token only
        candidate_tails.append(raw.rsplit(".", 1)[-1])
    for tail in candidate_tails:
        if not tail:
            continue
        for qn, sid in qname_to_id.items():
            if qn == tail or qn.endswith("." + tail):
                return sid
    return None


# ---------------------------------------------------------------------------
# Defensive-check extraction
# ---------------------------------------------------------------------------


def _extract_defensive_invariants(
    root: Any,
    source: bytes,
    file_path: str,
    fn_syms: list[dict],
) -> list[dict]:
    """Find early-return-on-falsy, intra-body asserts, and param-raises."""
    out: list[dict] = []

    for fn_node in _iter_descendants(root):
        if fn_node.type != "function_definition":
            continue
        body = _child_by_field(fn_node, "body")
        if body is None:
            continue
        line = fn_node.start_point[0] + 1
        owner = _enclosing_function_for_line(fn_syms, line)
        if owner is None:
            continue
        target_id = owner.get("_id")
        if target_id is None:
            continue

        for stmt in body.named_children:
            # (a) `if not x: return` / `if x is None: return` / `if cond: raise`
            if stmt.type == "if_statement":
                cond = _child_by_field(stmt, "condition")
                consequence = _child_by_field(stmt, "consequence")
                if cond is None or consequence is None:
                    continue
                if not _consequence_is_guard(consequence):
                    continue
                guard_text = _guard_text_from_condition(cond, source)
                if not guard_text:
                    continue
                out.append(
                    {
                        "target_symbol_id": target_id,
                        "text": guard_text,
                        "source_kind": "defensive",
                        "source_location": f"{file_path}:{stmt.start_point[0] + 1}",
                        "confidence": _DEFENSIVE_CONFIDENCE,
                    }
                )
            # (b) Intra-body assert: condition becomes a precondition invariant.
            elif stmt.type == "assert_statement":
                cond = stmt.named_children[0] if stmt.named_children else None
                if cond is None:
                    continue
                text = _node_text(cond, source).strip()
                if not text:
                    continue
                out.append(
                    {
                        "target_symbol_id": target_id,
                        "text": f"precondition: {text}",
                        "source_kind": "defensive",
                        "source_location": f"{file_path}:{stmt.start_point[0] + 1}",
                        "confidence": _DEFENSIVE_CONFIDENCE,
                    }
                )

    return out


def _consequence_is_guard(node: Any) -> bool:
    """True if the consequence block contains a return or raise as its first stmt."""
    if node is None:
        return False
    # node is typically a `block`. Inspect its first named child.
    if node.type in ("return_statement", "raise_statement"):
        return True
    for child in node.named_children:
        if child.type in ("return_statement", "raise_statement"):
            return True
        # Sometimes wrapped in an expression_statement.
        if child.type == "expression_statement":
            for sub in child.named_children:
                if sub.type in ("return_statement", "raise_statement"):
                    return True
        return False
    return False


def _guard_text_from_condition(cond: Any, source: bytes) -> str:
    """Render an English invariant from common guard conditions."""
    raw = _node_text(cond, source).strip()
    if not raw:
        return ""
    # Heuristic patterns over the textual form. Tree-sitter's typed condition
    # variants vary across grammar versions, so we keep this textual.
    stripped = raw
    # "not x"
    if stripped.startswith("not "):
        name = stripped[4:].strip()
        if name and _looks_like_identifier(name):
            return f"{name} must not be falsy/None"
    # "x is None"
    if stripped.endswith(" is None"):
        name = stripped[: -len(" is None")].strip()
        if name and _looks_like_identifier(name):
            return f"{name} must not be None"
    # "x is not None" — already-asserted form is not really a guard.
    # Fallback: keep the raw condition as the guard text.
    return f"guard: {raw}"


def _looks_like_identifier(text: str) -> bool:
    if not text:
        return False
    head = text.split(".")[0]
    return head.isidentifier()


# ---------------------------------------------------------------------------
# Comment-derived extraction (LLM, optional)
# ---------------------------------------------------------------------------


_COMMENT_SYSTEM = (
    "Extract a single short invariant statement (precondition/postcondition/"
    "required state) implied by the code. Reply with only the invariant text "
    "in plain English, no JSON."
)


def _collect_comment_tasks(
    root: Any,
    source: bytes,
    file_path: str,
    fn_syms: list[dict],
    *,
    comment_distance_lines: int,
    budget: int,
) -> list[dict]:
    """Build LLM prompt tasks for comment-derived invariants.

    Each task carries everything needed to materialize a candidate dict
    once the LLM returns. No network calls are issued here.
    """
    if budget <= 0:
        return []
    out: list[dict] = []
    source_lines = source.split(b"\n")

    for fn_node in _iter_descendants(root):
        if fn_node.type != "function_definition":
            continue
        if len(out) >= budget:
            break
        body = _child_by_field(fn_node, "body")
        if body is None:
            continue
        fn_start = fn_node.start_point[0] + 1
        owner = _enclosing_function_for_line(fn_syms, fn_start)
        if owner is None:
            continue
        target_id = owner.get("_id")
        if target_id is None:
            continue

        # Identify a docstring or a leading comment block.
        has_docstring = _has_docstring(body, source)
        has_leading_comment = _has_leading_comment(fn_node, source_lines)
        if not (has_docstring or has_leading_comment):
            continue

        # Find a "risky construct" (raise / try / return None) within distance.
        risky = _find_risky_construct(body)
        if risky is None:
            continue

        if has_docstring:
            comment_line = body.start_point[0] + 1
        else:
            comment_line = max(0, fn_start - 1)
        if abs(risky.start_point[0] + 1 - comment_line) > comment_distance_lines:
            # Risky construct further than allowed from the comment block.
            # Still allow if the function is short (<=30 lines).
            if (fn_node.end_point[0] - fn_node.start_point[0]) > 30:
                continue

        # Build prompt: signature + ~30 lines of source.
        sig_line = fn_node.start_point[0]
        end_line = min(len(source_lines), sig_line + 30)
        snippet = b"\n".join(source_lines[sig_line:end_line]).decode(
            "utf-8", errors="replace"
        )
        signature = owner.get("signature") or _node_text(fn_node, source).split("\n", 1)[0]

        user = f"Function: {signature}\n\nSource:\n```python\n{snippet}\n```"
        out.append(
            {
                "target_symbol_id": target_id,
                "signature": signature,
                "user_prompt": user,
                "source_location": f"{file_path}:{fn_start}",
            }
        )
        if len(out) >= budget:
            break

    return out


def _run_comment_tasks(tasks: list[dict], *, max_workers: int = 4) -> list[dict]:
    """Dispatch comment-derivation LLM calls concurrently.

    Uses a small ``ThreadPoolExecutor`` cap so we don't fan out to hundreds
    of in-flight requests against the Anthropic API. Works under both the
    FastAPI BackgroundTask runner and the standalone agent runtime — neither
    needs to own an asyncio event loop.
    """
    if not tasks:
        return []

    def _one(task: dict) -> Optional[dict]:
        try:
            text = llm.complete(_COMMENT_SYSTEM, task["user_prompt"], max_tokens=100)
        except Exception as exc:
            logger.warning(
                "layer 4: LLM call failed for %s: %s", task.get("signature"), exc
            )
            return None
        text = (text or "").strip()
        if not text:
            return None
        return {
            "target_symbol_id": task["target_symbol_id"],
            "text": text,
            "source_kind": "comment",
            "source_location": task["source_location"],
            "confidence": _COMMENT_CONFIDENCE,
        }

    out: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for cand in executor.map(_one, tasks):
            if cand is not None:
                out.append(cand)
    return out


def _extract_comment_invariants(
    root: Any,
    source: bytes,
    file_path: str,
    fn_syms: list[dict],
    *,
    comment_distance_lines: int,
    budget: int,
) -> list[dict]:
    """Backwards-compatible serial version (collect + run synchronously).

    Kept for callers/tests; ``build`` now uses the parallel pipeline.
    """
    tasks = _collect_comment_tasks(
        root,
        source,
        file_path,
        fn_syms,
        comment_distance_lines=comment_distance_lines,
        budget=budget,
    )
    return _run_comment_tasks(tasks, max_workers=4)


def _has_docstring(body: Any, source: bytes) -> bool:
    if body is None or not body.named_children:
        return False
    first = body.named_children[0]
    if first.type != "expression_statement":
        return False
    inner = first.named_children[0] if first.named_children else None
    return inner is not None and inner.type == "string"


def _has_leading_comment(fn_node: Any, source_lines: list[bytes]) -> bool:
    line_idx = fn_node.start_point[0] - 1
    while line_idx >= 0:
        line = source_lines[line_idx].strip()
        if not line:
            line_idx -= 1
            continue
        return line.startswith(b"#")
    return False


def _find_risky_construct(body: Any) -> Optional[Any]:
    for desc in _iter_descendants(body):
        if desc.type in ("raise_statement", "try_statement"):
            return desc
        if desc.type == "return_statement":
            # `return None` or bare `return`.
            if not desc.named_children:
                return desc
            child = desc.named_children[0]
            if child.type == "none":
                return desc
    return None
