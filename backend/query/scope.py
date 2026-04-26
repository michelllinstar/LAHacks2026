"""Agent-runner scope resolution and tool-arg clamping.

Contract for the Phase 1 runner agent
-------------------------------------

This module is the *sandbox* for an AI agent that has been pointed at a
Cartographer-indexed repo. The runner accepts an optional :class:`Scope`
describing the slice of the repo the agent is allowed to look at
(a Layer 3 cluster, a folder prefix, a single file, or an explicit set of
qualified names) and uses :func:`resolve_scope` to materialise that into
two concrete sets:

* ``ResolvedScope.qnames`` — every fully-qualified symbol name the agent may
  legitimately ask about.
* ``ResolvedScope.file_paths`` — every file path those symbols live in.

Before each MCP tool call, the runner should call :func:`clamp_args` with
the tool's name and the agent-proposed arguments. ``clamp_args`` returns a
``(ok, clamped_args, reason)`` tuple:

* ``ok=True``  -> dispatch the tool with ``clamped_args``.
* ``ok=False`` -> refuse the call and feed ``reason`` back to the agent so
  it can re-plan inside its sandbox.

If ``scope`` is ``None`` the runner is unrestricted: ``resolve_scope``
returns ``None`` and ``clamp_args`` is a pass-through.

Notes / caveats
~~~~~~~~~~~~~~~
* ``find_relevant_context`` uses a vector seed that the engine retrieves
  from the *full* repo's symbol embeddings. We do not have a cheap way to
  restrict the candidate pool here, so the clamp only validates the seed
  symbol; the runner is expected to post-filter results to
  ``ResolvedScope.file_paths`` before showing them to the agent.
* ``cluster_id`` on requests / scope is the **stringified ObjectId** of a
  Layer 3 cluster — this matches ``backend.models`` (``InvariantRequest``,
  ``ArchRequest``, ``ExemplarRequest``). The spec sketch in the
  implementation plan called it an ``int``; we use ``str`` because the
  real store is ObjectId-keyed and an ``int`` would not round-trip.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Literal, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel, model_validator

from backend.db import store

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scope input model
# ---------------------------------------------------------------------------


class Scope(BaseModel):
    """Discriminated scope union.

    Exactly one descriptor field must be set per ``kind``:

    * ``kind="cluster"`` -> ``cluster_id`` (stringified ObjectId)
    * ``kind="folder"``  -> ``path`` (folder path, with or without trailing slash)
    * ``kind="file"``    -> ``path`` (full file path)
    * ``kind="symbols"`` -> ``qnames`` (non-empty list of qualified names)
    """

    kind: Literal["cluster", "folder", "file", "symbols"]
    cluster_id: Optional[str] = None
    path: Optional[str] = None
    qnames: Optional[list[str]] = None

    @model_validator(mode="after")
    def _validate(self) -> "Scope":
        if self.kind == "cluster":
            if not self.cluster_id:
                raise ValueError("scope kind='cluster' requires cluster_id")
            if self.path is not None or self.qnames is not None:
                raise ValueError(
                    "scope kind='cluster' must not set path or qnames"
                )
        elif self.kind in ("folder", "file"):
            if not self.path:
                raise ValueError("scope kind=%r requires path" % self.kind)
            if self.cluster_id is not None or self.qnames is not None:
                raise ValueError(
                    "scope kind=%r must not set cluster_id or qnames" % self.kind
                )
        elif self.kind == "symbols":
            if not self.qnames:
                raise ValueError(
                    "scope kind='symbols' requires a non-empty qnames list"
                )
            if self.cluster_id is not None or self.path is not None:
                raise ValueError(
                    "scope kind='symbols' must not set cluster_id or path"
                )
        return self


# ---------------------------------------------------------------------------
# Resolved scope
# ---------------------------------------------------------------------------


@dataclass
class ResolvedScope:
    qnames: set[str] = field(default_factory=set)
    file_paths: set[str] = field(default_factory=set)
    summary: str = ""


def _normalise_folder_prefix(path: str) -> str:
    """Normalise a folder path to a prefix that ends in a single ``/``.

    Trailing-slash semantics are intentional: ``"auth"`` should match
    ``"auth/login.py"`` but never ``"authorization/x.py"``.
    """
    p = path.strip()
    while p.endswith("/"):
        p = p[:-1]
    return p + "/"


def _file_in_folder(file_path: str, folder_prefix: str) -> bool:
    """``folder_prefix`` is expected to be the output of
    :func:`_normalise_folder_prefix` (i.e. ends in ``/``)."""
    return file_path.startswith(folder_prefix) or (
        # Allow root scope ``""`` -> ``"/"`` to match every path.
        folder_prefix == "/"
    )


def resolve_scope(
    repo_hash: str, scope: Optional[Scope]
) -> Optional[ResolvedScope]:
    """Materialise ``scope`` into concrete qnames + file paths.

    Returns ``None`` for an unscoped runner. Raises :class:`ValueError`
    when the scope is well-formed but cannot be resolved against the
    indexed repo (e.g. a cluster id that does not exist).
    """
    if scope is None:
        return None

    if scope.kind == "cluster":
        try:
            oid = ObjectId(str(scope.cluster_id))
        except (InvalidId, TypeError) as exc:
            raise ValueError(
                "cluster_id %r is not a valid ObjectId" % scope.cluster_id
            ) from exc
        cluster = store.fetch_cluster(repo_hash, oid)
        if cluster is None:
            raise ValueError(
                "cluster_id %s not found for repo %s" % (oid, repo_hash)
            )
        member_files = set(store.cluster_member_files(repo_hash, oid))
        if not member_files:
            logger.warning(
                "scope: cluster %s has no member files (repo=%s)",
                oid,
                repo_hash,
            )
        all_symbols = store.iter_symbols(repo_hash)
        qnames: set[str] = set()
        seen_files: set[str] = set()
        for sym in all_symbols:
            fp = sym.get("file_path")
            if fp in member_files:
                qn = sym.get("qualified_name")
                if qn:
                    qnames.add(qn)
                seen_files.add(fp)
        return ResolvedScope(
            qnames=qnames,
            file_paths=member_files,
            summary="cluster %s (%d files)" % (str(oid), len(member_files)),
        )

    if scope.kind == "folder":
        prefix = _normalise_folder_prefix(scope.path or "")
        all_symbols = store.iter_symbols(repo_hash)
        qnames = set()
        file_paths: set[str] = set()
        for sym in all_symbols:
            fp = sym.get("file_path") or ""
            if _file_in_folder(fp, prefix):
                qn = sym.get("qualified_name")
                if qn:
                    qnames.add(qn)
                file_paths.add(fp)
        # Strip the trailing "/" for the human-readable summary unless the
        # caller actually pointed us at the repo root.
        display = prefix[:-1] if prefix != "/" else "/"
        return ResolvedScope(
            qnames=qnames,
            file_paths=file_paths,
            summary="folder %s (%d files, %d symbols)"
            % (display, len(file_paths), len(qnames)),
        )

    if scope.kind == "file":
        target = scope.path or ""
        all_symbols = store.iter_symbols(repo_hash)
        qnames = set()
        file_paths = set()
        for sym in all_symbols:
            if sym.get("file_path") == target:
                qn = sym.get("qualified_name")
                if qn:
                    qnames.add(qn)
                file_paths.add(target)
        if not file_paths:
            logger.warning(
                "scope: file %s has no indexed symbols (repo=%s)",
                target,
                repo_hash,
            )
            file_paths = {target}
        return ResolvedScope(
            qnames=qnames,
            file_paths=file_paths,
            summary="file %s (%d symbols)" % (target, len(qnames)),
        )

    if scope.kind == "symbols":
        wanted = {q for q in (scope.qnames or []) if q}
        if not wanted:
            raise ValueError("scope kind='symbols' requires a non-empty qnames list")
        all_symbols = store.iter_symbols(repo_hash)
        qnames = set()
        file_paths = set()
        for sym in all_symbols:
            qn = sym.get("qualified_name")
            if qn in wanted:
                qnames.add(qn)
                fp = sym.get("file_path")
                if fp:
                    file_paths.add(fp)
        missing = wanted - qnames
        if missing:
            logger.warning(
                "scope: %d/%d requested symbols not found (repo=%s)",
                len(missing),
                len(wanted),
                repo_hash,
            )
        # Surface every requested qname even if some weren't matched, so
        # the agent's later tool calls referring to a missing qname are
        # rejected with a clear "unknown symbol" reason from the engine
        # rather than silently widening to no-scope.
        qnames |= wanted
        return ResolvedScope(
            qnames=qnames,
            file_paths=file_paths,
            summary="%d symbols" % len(wanted),
        )

    # Unreachable — Pydantic validates ``kind``.
    raise ValueError("unknown scope kind: %r" % scope.kind)


# ---------------------------------------------------------------------------
# Tool-arg clamping
# ---------------------------------------------------------------------------


def _cluster_member_files_str(repo_hash: str, cluster_id_str: str) -> Optional[set[str]]:
    """Resolve a stringified cluster id to its member-file set, or
    ``None`` when the id is malformed / unknown."""
    try:
        oid = ObjectId(str(cluster_id_str))
    except (InvalidId, TypeError):
        return None
    files = store.cluster_member_files(repo_hash, oid)
    return set(files) if files else set()


def _path_inside_scope(path: str, scope_files: set[str]) -> bool:
    """True if ``path`` is itself in scope, or is a folder-prefix of any
    file in scope (with ``/`` boundary), or any file in scope is under it.
    """
    if path in scope_files:
        return True
    folder = _normalise_folder_prefix(path)
    for fp in scope_files:
        if fp.startswith(folder):
            return True
        # Treat ``path`` as a parent folder of any in-scope file.
        if fp == path:
            return True
    return False


def clamp_args(
    scope: Optional[ResolvedScope],
    tool_name: str,
    args: dict,
) -> tuple[bool, dict, Optional[str]]:
    """Validate / restrict tool args against ``scope``.

    Returns ``(ok, clamped_args, reason)``. When ``ok`` is False the
    runner should refuse the call and surface ``reason`` to the agent.
    """
    if scope is None:
        return True, args, None

    args = dict(args or {})
    qnames = scope.qnames
    file_paths = scope.file_paths

    if tool_name == "find_relevant_context":
        # The engine retrieves a vector seed from the full repo's
        # embeddings, so we cannot prune the candidate pool here. We only
        # validate the seed; the runner must post-filter results to
        # ``scope.file_paths`` before showing them to the agent.
        seed = args.get("seed_symbol") or args.get("seed")
        if seed and seed not in qnames:
            return (
                False,
                args,
                "seed symbol %r is outside the agent scope" % seed,
            )
        return True, args, None

    if tool_name == "trace_data_flow":
        sym = args.get("symbol")
        if not sym:
            return False, args, "trace_data_flow requires a 'symbol' argument"
        if sym not in qnames:
            return (
                False,
                args,
                "symbol %r is outside the agent scope" % sym,
            )
        return True, args, None

    if tool_name == "find_invariants":
        sym = args.get("symbol")
        cid = args.get("cluster_id")
        if sym is not None:
            if sym not in qnames:
                return (
                    False,
                    args,
                    "symbol %r is outside the agent scope" % sym,
                )
        if cid is not None:
            members = _cluster_member_files_str(args.get("repo_hash") or "", cid)
            # We may not have repo_hash in args (the engine layer fills it
            # via _engine(repo_hash)). Re-derive from any file path stamped
            # on the scope: every file in scope shares one repo, and the
            # cluster lookup here only needs the cluster id. Fall back to
            # iter_files via clusters_for_files for safety.
            if members is None:
                return (
                    False,
                    args,
                    "cluster_id %r is malformed" % cid,
                )
            if not members.issubset(file_paths):
                return (
                    False,
                    args,
                    "cluster %s contains files outside the agent scope" % cid,
                )
        return True, args, None

    if tool_name == "describe_architecture":
        cid = args.get("cluster_id")
        path = args.get("path")
        if cid is not None:
            members = _cluster_member_files_str(args.get("repo_hash") or "", cid)
            if members is None:
                return False, args, "cluster_id %r is malformed" % cid
            if not (members & file_paths):
                return (
                    False,
                    args,
                    "cluster %s does not intersect the agent scope" % cid,
                )
        if path is not None and not _path_inside_scope(path, file_paths):
            return (
                False,
                args,
                "path %r is outside the agent scope" % path,
            )
        return True, args, None

    if tool_name == "find_exemplars":
        cid = args.get("cluster_id")
        if cid is not None:
            members = _cluster_member_files_str(args.get("repo_hash") or "", cid)
            if members is None:
                return False, args, "cluster_id %r is malformed" % cid
            if not (members & file_paths):
                return (
                    False,
                    args,
                    "cluster %s does not intersect the agent scope" % cid,
                )
        return True, args, None

    # Unknown tool -> let the runner decide; we don't fail closed here so
    # new tools added to ``backend.mcp.server.TOOLS`` don't break agents
    # silently. The runner can layer its own deny-list on top.
    logger.debug("clamp_args: no rule for tool=%s, passing through", tool_name)
    return True, args, None
