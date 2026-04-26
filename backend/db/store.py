"""MongoDB-backed storage layer for the Cartographer index.

A single MongoDB database (default ``cartographer``, overridable via the
``MONGODB_DB_NAME`` env var) holds the control plane and all four index layers
across every registered repository. Every document carries a ``repo_hash``
field so the database can serve multiple repos.

Connection settings come from ``MONGODB_URI`` (default
``mongodb://localhost:27017``). The :class:`MongoClient` is constructed lazily
on first use so importing this module never touches the network.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

logger = logging.getLogger(__name__)

from bson import Binary, ObjectId
from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient, TEXT, UpdateOne
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError, OperationFailure

# Load env from the repo root so CLI / agent / FastAPI processes share the
# same configuration. Precedence (highest wins): OS env > .env.local > .env.
# We load with ``override=False`` and process .env.local FIRST so values it
# sets are never replaced by the .env load that follows. This also means
# anything already in os.environ (e.g. an explicit ``MONGODB_URI=...`` set
# by a shell or by pytest's conftest) wins over both files — which is what
# the test suite's sentinel relies on.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
for _name in (".env.local", ".env"):
    _path = _REPO_ROOT / _name
    if _path.exists():
        load_dotenv(_path, override=False)


# ---------------------------------------------------------------------------
# Connection helpers (lazy)
# ---------------------------------------------------------------------------


_client: Optional[MongoClient] = None


def _mongo_uri() -> str:
    return os.getenv("MONGODB_URI", "mongodb://localhost:27017")


def _db_name() -> str:
    return os.getenv("MONGODB_DB_NAME", "cartographer")


def get_client() -> MongoClient:
    """Return a process-wide cached :class:`MongoClient`."""
    global _client
    if _client is None:
        # Log the host:port portion only — never the full URI, which can
        # carry credentials in the userinfo segment.
        uri = _mongo_uri()
        try:
            from urllib.parse import urlparse

            parsed = urlparse(uri)
            host_disp = parsed.hostname or "unknown"
            if parsed.port:
                host_disp = "%s:%d" % (host_disp, parsed.port)
        except Exception:
            host_disp = "unknown"
        logger.info("mongo: initialising client host=%s db=%s", host_disp, _db_name())
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    return _client


def get_db() -> Database:
    return get_client()[_db_name()]


def get_control_db() -> Database:
    """Backwards-compatible alias for :func:`get_db`."""
    return get_db()


def get_repo_db(repo_hash: str) -> Database:
    """All repos share one database; ``repo_hash`` is a per-document key."""
    return get_db()


# ---------------------------------------------------------------------------
# Schema initialisation (index management)
# ---------------------------------------------------------------------------


def _ensure_control_indexes(db: Database) -> None:
    db["repos"].create_index([("hash", ASCENDING)], unique=True, name="repos_hash_unique")
    db["index_jobs"].create_index(
        [("job_id", ASCENDING)], unique=True, name="index_jobs_job_id_unique"
    )
    db["index_jobs"].create_index(
        [("repo_hash", ASCENDING), ("layer", ASCENDING)],
        name="index_jobs_repo_layer",
    )


def _ensure_repo_indexes(db: Database) -> None:
    db["files"].create_index(
        [("repo_hash", ASCENDING), ("file_path", ASCENDING)],
        unique=True,
        name="files_repo_path_unique",
    )

    db["symbols"].create_index(
        [
            ("repo_hash", ASCENDING),
            ("qualified_name", ASCENDING),
            ("file_path", ASCENDING),
            ("line_start", ASCENDING),
        ],
        unique=True,
        name="symbols_unique",
    )
    db["symbols"].create_index(
        [("repo_hash", ASCENDING), ("qualified_name", ASCENDING)],
        name="symbols_repo_qname",
    )
    db["symbols"].create_index(
        [("repo_hash", ASCENDING), ("file_path", ASCENDING), ("line_start", ASCENDING)],
        name="symbols_repo_file_line",
    )
    # Layer 2's flow builder filters symbols to function/method kinds only;
    # without this index that filter scans every symbol per repo. SPEC §9.2
    # sub-200ms p95 budget for direct queries depends on it.
    db["symbols"].create_index(
        [("repo_hash", ASCENDING), ("kind", ASCENDING)],
        name="symbols_repo_kind",
    )
    # Text index for replacing FTS5. Mongo allows only one text index per
    # collection but multiple fields can participate.
    try:
        db["symbols"].create_index(
            [("qualified_name", TEXT), ("signature", TEXT)],
            name="symbols_text",
            default_language="english",
        )
    except Exception:
        # If a text index already exists with different fields, leave it.
        pass

    db["refs"].create_index(
        [("repo_hash", ASCENDING), ("source_symbol_id", ASCENDING)],
        name="refs_repo_source",
    )
    db["refs"].create_index(
        [("repo_hash", ASCENDING), ("target_symbol_id", ASCENDING)],
        name="refs_repo_target",
    )

    db["symbol_embeddings"].create_index(
        [("symbol_id", ASCENDING)], unique=True, name="symbol_embeddings_symbol_unique"
    )
    # symbol_embeddings_repo (single-field on repo_hash) was redundant: every
    # access path joins via the unique symbol_id index. Drop it defensively
    # on existing deployments so the orphan doesn't keep getting maintained.
    try:
        db["symbol_embeddings"].drop_index("symbol_embeddings_repo")
    except OperationFailure:
        pass
    except Exception:
        pass

    try:
        db["flows"].drop_index("flows_repo")
    except Exception:
        pass
    db["flows"].create_index(
        [("repo_hash", ASCENDING), ("source_symbol_id", ASCENDING)],
        name="flows_repo_source",
    )
    db["flows"].create_index(
        [("repo_hash", ASCENDING), ("sink_symbol_id", ASCENDING)],
        name="flows_repo_sink",
    )
    db["flows"].create_index(
        [("repo_hash", ASCENDING), ("path", ASCENDING)],
        name="flows_repo_path",
    )
    db["flows"].create_index(
        [("repo_hash", ASCENDING), ("sensitivity", ASCENDING)],
        sparse=True,
        name="flows_repo_sensitivity",
    )
    # Drop legacy single-field index name if it exists from a prior schema.
    try:
        db["cluster_dependencies"].drop_index("cluster_deps_repo")
    except OperationFailure:
        pass
    except Exception:
        pass
    db["clusters"].create_index(
        [("repo_hash", ASCENDING)],
        name="clusters_repo",
    )
    db["cluster_dependencies"].create_index(
        [("repo_hash", ASCENDING), ("source_cluster_id", ASCENDING)],
        name="cluster_deps_repo_source",
    )
    db["cluster_dependencies"].create_index(
        [("repo_hash", ASCENDING), ("target_cluster_id", ASCENDING)],
        name="cluster_deps_repo_target",
    )
    db["files"].create_index(
        [("repo_hash", ASCENDING), ("cluster_id", ASCENDING)],
        sparse=True,
        name="files_repo_cluster",
    )
    db["invariants"].create_index(
        [("repo_hash", ASCENDING), ("target_symbol_id", ASCENDING)],
        name="invariants_repo_target",
    )
    db["invariants"].create_index(
        [("repo_hash", ASCENDING), ("source_kind", ASCENDING)],
        name="invariants_repo_source_kind",
    )
    db["invariants"].create_index(
        [("repo_hash", ASCENDING), ("confidence", DESCENDING)],
        name="invariants_repo_confidence",
    )

    # Agent runs: per-repo dispatch records for the agent runner. ``run_id`` is
    # uuid4 hex and unique; ``created_at`` descending powers the most-recent
    # listings shown in the frontend.
    db["agent_runs"].create_index(
        [("run_id", ASCENDING)], unique=True, name="agent_runs_run_id_unique"
    )
    db["agent_runs"].create_index(
        [("repo_hash", ASCENDING), ("created_at", DESCENDING)],
        name="agent_runs_repo_created",
    )
    db["agent_runs"].create_index(
        [("repo_hash", ASCENDING), ("status", ASCENDING)],
        name="agent_runs_repo_status",
    )


def init_control_db() -> None:
    """Idempotently create control-plane indexes."""
    logger.info("mongo: ensuring control-plane indexes db=%s", _db_name())
    _ensure_control_indexes(get_db())


def init_repo_db(repo_hash: str) -> None:
    """Idempotently create per-repo collection indexes.

    All repos share collections; ``repo_hash`` is here for API compatibility
    with the previous SQLite store.
    """
    logger.debug("mongo: ensuring per-repo indexes repo=%s", repo_hash)
    _ensure_repo_indexes(get_db())


# ---------------------------------------------------------------------------
# Control plane CRUD
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_repo(
    hash: str,
    name: str,
    git_url: Optional[str] = None,
    local_path: Optional[str] = None,
    status: str = "pending",
) -> None:
    db = get_db()
    db["repos"].update_one(
        {"hash": hash},
        {
            "$set": {
                "hash": hash,
                "name": name,
                "git_url": git_url,
                "local_path": local_path,
                "status": status,
            },
            "$setOnInsert": {"created_at": _now_iso()},
        },
        upsert=True,
    )


def list_repos() -> list[dict]:
    db = get_db()
    return list(db["repos"].find({}, {"_id": 0}).sort("created_at", -1))


def count_symbols(repo_hash: str) -> int:
    """Return how many Layer 1 symbols are stored for ``repo_hash``.

    Backed by the ``(repo_hash, qualified_name, file_path, line_start)``
    compound index so it stays cheap even on large repos. Used by the dashboard
    to render per-repo symbol counts without a per-tile round trip.
    """
    return get_db()["symbols"].count_documents({"repo_hash": repo_hash})


def delete_repo(repo_hash: str) -> None:
    """Wipe every trace of ``repo_hash`` from the index store.

    Removes Layer 1–4 rows, index-job history, and the registration record
    itself. Idempotent: missing rows are silently no-op'd. Called by
    ``DELETE /api/repos/{repo_hash}``.
    """
    db = get_db()
    # Layer 4: invariants.
    db["invariants"].delete_many({"repo_hash": repo_hash})
    # Layer 3: clusters + dependencies + (cluster_id is set on files which
    # are wiped below by reset_layer1, so no explicit unset needed).
    db["clusters"].delete_many({"repo_hash": repo_hash})
    db["cluster_dependencies"].delete_many({"repo_hash": repo_hash})
    # Layer 2: flows.
    db["flows"].delete_many({"repo_hash": repo_hash})
    # Layer 1: files / symbols / refs / embeddings.
    db["files"].delete_many({"repo_hash": repo_hash})
    db["symbols"].delete_many({"repo_hash": repo_hash})
    db["refs"].delete_many({"repo_hash": repo_hash})
    db["symbol_embeddings"].delete_many({"repo_hash": repo_hash})
    # Job history + repo registration row.
    db["index_jobs"].delete_many({"repo_hash": repo_hash})
    db["repos"].delete_one({"hash": repo_hash})


def get_repo(repo_hash: str) -> Optional[dict]:
    db = get_db()
    return db["repos"].find_one({"hash": repo_hash}, {"_id": 0})


def set_repo_status(repo_hash: str, status: str) -> None:
    db = get_db()
    db["repos"].update_one({"hash": repo_hash}, {"$set": {"status": status}})


def upsert_index_job(
    job_id: str,
    repo_hash: str,
    layer: str,
    state: str,
    count: int = 0,
    started_at: Optional[str] = None,
    ended_at: Optional[str] = None,
) -> None:
    db = get_db()
    db["index_jobs"].update_one(
        {"job_id": job_id},
        {
            "$set": {
                "job_id": job_id,
                "repo_hash": repo_hash,
                "layer": layer,
                "state": state,
                "count": count,
                "started_at": started_at,
                "ended_at": ended_at,
            }
        },
        upsert=True,
    )


def jobs_for_repo(repo_hash: str) -> list[dict]:
    db = get_db()
    return list(
        db["index_jobs"].find({"repo_hash": repo_hash}, {"_id": 0}).sort("layer", 1)
    )


def iter_index_jobs(repo_hash: str) -> list[dict]:
    return jobs_for_repo(repo_hash)


# ---------------------------------------------------------------------------
# Layer 1: files / symbols / refs / embeddings
# ---------------------------------------------------------------------------


def insert_file(
    repo_hash: str,
    file_path: str,
    last_modified: Optional[str] = None,
    cluster_id: Optional[Any] = None,
) -> None:
    db = get_db()
    set_doc: dict[str, Any] = {"repo_hash": repo_hash, "file_path": file_path}
    if last_modified is not None:
        set_doc["last_modified"] = last_modified
    if cluster_id is not None:
        set_doc["cluster_id"] = cluster_id
    db["files"].update_one(
        {"repo_hash": repo_hash, "file_path": file_path},
        {"$set": set_doc},
        upsert=True,
    )


def upsert_file(
    repo_hash: str,
    file_path: str,
    cluster_id: Optional[Any] = None,
    last_modified: Optional[str] = None,
) -> None:
    """Backwards-compatible name; same shape as the legacy SQLite helper."""
    insert_file(
        repo_hash,
        file_path=file_path,
        last_modified=last_modified,
        cluster_id=cluster_id,
    )


def iter_files(repo_hash: str) -> list[dict]:
    db = get_db()
    return list(db["files"].find({"repo_hash": repo_hash}))


def insert_symbol(
    repo_hash: str,
    qualified_name: str,
    file_path: str,
    line_start: int,
    line_end: int,
    kind: str,
    signature: Optional[str] = None,
) -> ObjectId:
    """Insert one symbol; return its ObjectId (existing or new)."""
    db = get_db()
    doc = {
        "repo_hash": repo_hash,
        "qualified_name": qualified_name,
        "file_path": file_path,
        "line_start": int(line_start),
        "line_end": int(line_end),
        "kind": kind,
        "signature": signature,
    }
    try:
        res = db["symbols"].insert_one(doc)
        return res.inserted_id
    except DuplicateKeyError:
        existing = db["symbols"].find_one(
            {
                "repo_hash": repo_hash,
                "qualified_name": qualified_name,
                "file_path": file_path,
                "line_start": int(line_start),
            },
            {"_id": 1},
        )
        return existing["_id"] if existing else ObjectId()


def bulk_insert_symbols(
    repo_hash: str, rows: Sequence[dict]
) -> list[ObjectId]:
    """Insert many symbols. Each row dict must carry the symbol fields.

    Returns the resulting ObjectId list aligned with ``rows``.
    """
    if not rows:
        return []
    out: list[ObjectId] = []
    for row in rows:
        sid = insert_symbol(
            repo_hash,
            qualified_name=row["qualified_name"],
            file_path=row["file_path"],
            line_start=int(row["line_start"]),
            line_end=int(row["line_end"]),
            kind=row["kind"],
            signature=row.get("signature"),
        )
        out.append(sid)
    return out


def bulk_upsert_symbols(
    repo_hash: str, rows: Sequence[dict]
) -> list[ObjectId]:
    """Upsert many symbols in one ``bulk_write`` round-trip.

    For each row we issue an ``UpdateOne`` with ``$setOnInsert`` keyed by the
    symbols-unique tuple ``(repo_hash, qualified_name, file_path, line_start)``.
    After the bulk write we fetch the resulting ``_id``s in one ``find`` and
    return ObjectIds aligned with ``rows``.
    """
    if not rows:
        return []
    db = get_db()
    ops: list[UpdateOne] = []
    for row in rows:
        key = {
            "repo_hash": repo_hash,
            "qualified_name": row["qualified_name"],
            "file_path": row["file_path"],
            "line_start": int(row["line_start"]),
        }
        doc = {
            **key,
            "line_end": int(row["line_end"]),
            "kind": row["kind"],
            "signature": row.get("signature"),
        }
        ops.append(UpdateOne(key, {"$setOnInsert": doc}, upsert=True))
    if ops:
        db["symbols"].bulk_write(ops, ordered=False)

    # Reconciliation filter narrowed to the same 4-tuple set used in upsert.
    # ``qualified_name`` alone over-fetched: a qname shared across files (e.g.
    # ``__init__`` on two classes) returned every doc with that name. Adding
    # file_path and line_start as additional ``$in`` clauses keeps the index
    # path on ``symbols_unique`` and prunes the cross-product server-side; the
    # ``by_key`` dict still pins the final alignment.
    qnames = list({row["qualified_name"] for row in rows})
    file_paths = list({row["file_path"] for row in rows})
    line_starts = list({int(row["line_start"]) for row in rows})
    by_key: dict[tuple[str, str, int], ObjectId] = {}
    cursor = db["symbols"].find(
        {
            "repo_hash": repo_hash,
            "qualified_name": {"$in": qnames},
            "file_path": {"$in": file_paths},
            "line_start": {"$in": line_starts},
        },
        {"_id": 1, "qualified_name": 1, "file_path": 1, "line_start": 1},
    )
    for doc in cursor:
        by_key[
            (doc["qualified_name"], doc["file_path"], int(doc["line_start"]))
        ] = doc["_id"]

    out: list[ObjectId] = []
    for row in rows:
        sid = by_key.get(
            (row["qualified_name"], row["file_path"], int(row["line_start"]))
        )
        out.append(sid if sid is not None else ObjectId())
    return out


def bulk_upsert_embeddings(repo_hash: str, rows: Sequence[dict]) -> None:
    """Bulk version of :func:`upsert_symbol_embedding`.

    Each row: ``{"symbol_id": ObjectId, "vector": bytes}``.
    """
    if not rows:
        return
    db = get_db()
    ops: list[UpdateOne] = []
    for row in rows:
        sid = row["symbol_id"]
        vec = row.get("vector") or b""
        ops.append(
            UpdateOne(
                {"symbol_id": sid},
                {
                    "$set": {
                        "symbol_id": sid,
                        "repo_hash": repo_hash,
                        "vector": Binary(vec or b""),
                    }
                },
                upsert=True,
            )
        )
    if ops:
        db["symbol_embeddings"].bulk_write(ops, ordered=False)


def insert_ref(
    repo_hash: str,
    source_symbol_id: ObjectId,
    target_symbol_id: ObjectId,
    edge_kind: str,
) -> ObjectId:
    db = get_db()
    res = db["refs"].insert_one(
        {
            "repo_hash": repo_hash,
            "source_symbol_id": source_symbol_id,
            "target_symbol_id": target_symbol_id,
            "edge_kind": edge_kind,
        }
    )
    return res.inserted_id


def bulk_insert_refs(repo_hash: str, rows: Sequence[dict]) -> list[ObjectId]:
    if not rows:
        return []
    db = get_db()
    docs = [
        {
            "repo_hash": repo_hash,
            "source_symbol_id": r["source_symbol_id"],
            "target_symbol_id": r["target_symbol_id"],
            "edge_kind": r["edge_kind"],
        }
        for r in rows
    ]
    res = db["refs"].insert_many(docs)
    return list(res.inserted_ids)


def upsert_symbol_embedding(
    repo_hash: str, symbol_id: ObjectId, vector: bytes
) -> None:
    db = get_db()
    db["symbol_embeddings"].update_one(
        {"symbol_id": symbol_id},
        {
            "$set": {
                "symbol_id": symbol_id,
                "repo_hash": repo_hash,
                "vector": Binary(vector or b""),
            }
        },
        upsert=True,
    )


def bulk_insert_embeddings(repo_hash: str, rows: Sequence[dict]) -> None:
    """Each row: ``{"symbol_id": ObjectId, "vector": bytes}``.

    Backwards-compatible alias for :func:`bulk_upsert_embeddings`.
    """
    bulk_upsert_embeddings(repo_hash, rows)


def iter_symbols(repo_hash: str) -> list[dict]:
    db = get_db()
    return list(db["symbols"].find({"repo_hash": repo_hash}))


def iter_refs(repo_hash: str) -> list[dict]:
    db = get_db()
    return list(db["refs"].find({"repo_hash": repo_hash}))


def get_symbol(
    repo_hash: str,
    qualified_name: Optional[str] = None,
    _id: Optional[ObjectId] = None,
) -> Optional[dict]:
    db = get_db()
    query: dict[str, Any] = {"repo_hash": repo_hash}
    if _id is not None:
        query["_id"] = _id
    if qualified_name is not None:
        query["qualified_name"] = qualified_name
    if len(query) == 1:
        return None
    return db["symbols"].find_one(query)


def get_symbols_by_ids(
    repo_hash: str, symbol_ids: Sequence[ObjectId]
) -> list[dict]:
    if not symbol_ids:
        return []
    db = get_db()
    return list(
        db["symbols"].find(
            {"repo_hash": repo_hash, "_id": {"$in": list(symbol_ids)}}
        )
    )


def text_search_symbols(
    repo_hash: str, query: str, limit: int = 50
) -> list[dict]:
    """Mongo $text search replacement for FTS5.

    Falls back to a substring (``$regex``) match on ``qualified_name`` if the
    text query yields no results.
    """
    db = get_db()
    try:
        cursor = (
            db["symbols"]
            .find(
                {"repo_hash": repo_hash, "$text": {"$search": query}},
                {"score": {"$meta": "textScore"}},
            )
            .sort([("score", {"$meta": "textScore"})])
            .limit(limit)
        )
        results = list(cursor)
        if results:
            return results
    except Exception:
        pass

    # Fallback: substring search.
    import re

    safe = re.escape(query.strip().split()[0]) if query.strip() else ""
    if not safe:
        return []
    return list(
        db["symbols"]
        .find({"repo_hash": repo_hash, "qualified_name": {"$regex": safe, "$options": "i"}})
        .limit(limit)
    )


def find_symbol_embeddings(
    repo_hash: str, symbol_ids: Optional[Sequence[ObjectId]] = None
) -> list[dict]:
    db = get_db()
    query: dict[str, Any] = {"repo_hash": repo_hash}
    if symbol_ids is not None:
        query["symbol_id"] = {"$in": list(symbol_ids)}
    return list(db["symbol_embeddings"].find(query))


# ---------------------------------------------------------------------------
# Layer 2: flows
# ---------------------------------------------------------------------------


def insert_flow(
    repo_hash: str,
    source_symbol_id: Optional[ObjectId],
    sink_symbol_id: Optional[ObjectId],
    path: list[ObjectId],
    flow_kind: str,
    sensitivity: Optional[str] = None,
) -> ObjectId:
    db = get_db()
    res = db["flows"].insert_one(
        {
            "repo_hash": repo_hash,
            "source_symbol_id": source_symbol_id,
            "sink_symbol_id": sink_symbol_id,
            "path": list(path or []),
            "flow_kind": flow_kind,
            "sensitivity": sensitivity,
        }
    )
    return res.inserted_id


def bulk_insert_flows(repo_hash: str, rows: Sequence[dict]) -> list[ObjectId]:
    """Insert many flow documents."""
    if not rows:
        return []
    db = get_db()
    docs = [
        {
            "repo_hash": repo_hash,
            "source_symbol_id": r.get("source_symbol_id"),
            "sink_symbol_id": r.get("sink_symbol_id"),
            "path": list(r.get("path") or []),
            "flow_kind": r["flow_kind"],
            "sensitivity": r.get("sensitivity"),
        }
        for r in rows
    ]
    res = db["flows"].insert_many(docs)
    return list(res.inserted_ids)


def iter_flows(repo_hash: str) -> list[dict]:
    """All flows for a repo."""
    db = get_db()
    return list(db["flows"].find({"repo_hash": repo_hash}))


def flows_from_symbol(
    repo_hash: str, symbol_id: ObjectId, max_depth: int = 3
) -> list[dict]:
    """Flows whose source is ``symbol_id`` and whose **edge count** is at most
    ``max_depth``.

    The stored ``path`` field is intermediates-only (endpoints excluded), so a
    flow with ``e`` edges has ``e - 1`` intermediates. The filter is therefore
    ``$size <= max_depth - 1``. Audit found the previous formulation
    (``$size <= max_depth``) was always satisfied because the builder caps at
    ``max_depth=3`` and stores at most 2 intermediates.
    """
    db = get_db()
    intermediate_cap = max(0, int(max_depth) - 1)
    cursor = db["flows"].find(
        {
            "repo_hash": repo_hash,
            "source_symbol_id": symbol_id,
            "$expr": {"$lte": [{"$size": "$path"}, intermediate_cap]},
        }
    )
    return list(cursor)


def flows_to_symbol(
    repo_hash: str, symbol_id: ObjectId, max_depth: int = 3
) -> list[dict]:
    """Flows whose sink is ``symbol_id`` and whose **edge count** is at most
    ``max_depth`` — see :func:`flows_from_symbol` for the path-vs-edge
    accounting that justifies the ``- 1``."""
    db = get_db()
    intermediate_cap = max(0, int(max_depth) - 1)
    cursor = db["flows"].find(
        {
            "repo_hash": repo_hash,
            "sink_symbol_id": symbol_id,
            "$expr": {"$lte": [{"$size": "$path"}, intermediate_cap]},
        }
    )
    return list(cursor)


def flows_touching_symbols(
    repo_hash: str, symbol_ids: Sequence[ObjectId]
) -> list[dict]:
    """Flows where any of ``symbol_ids`` appears as source, sink, or anywhere
    in the intermediate path. Single $or query — see ``flows_repo_source``,
    ``flows_repo_sink``, and the multikey ``flows_repo_path`` indexes."""
    if not symbol_ids:
        return []
    db = get_db()
    ids = list(symbol_ids)
    return list(
        db["flows"].find(
            {
                "repo_hash": repo_hash,
                "$or": [
                    {"source_symbol_id": {"$in": ids}},
                    {"sink_symbol_id": {"$in": ids}},
                    {"path": {"$in": ids}},
                ],
            }
        )
    )


def count_flows(repo_hash: str) -> int:
    """Total flow count for the repo."""
    db = get_db()
    return db["flows"].count_documents({"repo_hash": repo_hash})


# ---------------------------------------------------------------------------
# Layer 3: clusters
# ---------------------------------------------------------------------------


def insert_cluster(
    repo_hash: str,
    role_description: str,
    naming_convention: Optional[str],
    code_shape: Any,
) -> ObjectId:
    """Insert one cluster doc; still supported, new code prefers ``bulk_insert_clusters``."""
    db = get_db()
    res = db["clusters"].insert_one(
        {
            "repo_hash": repo_hash,
            "role_description": role_description,
            "naming_convention": naming_convention,
            "code_shape": code_shape,
        }
    )
    return res.inserted_id


def insert_cluster_dependency(
    repo_hash: str,
    source_cluster_id: ObjectId,
    target_cluster_id: ObjectId,
    kind: str,
) -> None:
    """Insert a single cluster dependency edge; still supported alongside bulk variants."""
    db = get_db()
    db["cluster_dependencies"].insert_one(
        {
            "repo_hash": repo_hash,
            "source_cluster_id": source_cluster_id,
            "target_cluster_id": target_cluster_id,
            "kind": kind,
        }
    )


def fetch_cluster(repo_hash: str, cluster_id: ObjectId) -> Optional[dict]:
    """Fetch one cluster by id; still supported alongside ``iter_clusters``."""
    db = get_db()
    return db["clusters"].find_one({"repo_hash": repo_hash, "_id": cluster_id})


def fetch_cluster_member_files(repo_hash: str, cluster_id: ObjectId) -> list[str]:
    """Deprecated alias kept for one release; new code uses
    :func:`cluster_member_files`. Will be removed once external callers
    are migrated."""
    return cluster_member_files(repo_hash, cluster_id)


def bulk_insert_clusters(repo_hash: str, rows: Sequence[dict]) -> list[ObjectId]:
    """Insert many cluster docs; returns inserted ids aligned with ``rows``.

    ``member_files`` on a row is dropped here — assign cluster_id on each file
    via ``update_file_cluster``/``bulk_update_file_clusters`` after insertion.
    """
    if not rows:
        return []
    db = get_db()
    docs = [
        {
            "repo_hash": repo_hash,
            "role_description": r["role_description"],
            "naming_convention": r.get("naming_convention"),
            "code_shape": r.get("code_shape"),
        }
        for r in rows
    ]
    res = db["clusters"].insert_many(docs, ordered=False)
    return list(res.inserted_ids)


def iter_clusters(repo_hash: str) -> list[dict]:
    """All clusters for a repo."""
    db = get_db()
    return list(db["clusters"].find({"repo_hash": repo_hash}))


def iter_cluster_dependencies(repo_hash: str) -> list[dict]:
    """All cluster_dependencies edges for a repo."""
    db = get_db()
    return list(db["cluster_dependencies"].find({"repo_hash": repo_hash}))


def update_file_cluster(
    repo_hash: str, file_path: str, cluster_id: Optional[ObjectId]
) -> None:
    """Set or clear ``cluster_id`` on a single file row."""
    db = get_db()
    if cluster_id is None:
        db["files"].update_one(
            {"repo_hash": repo_hash, "file_path": file_path},
            {"$unset": {"cluster_id": ""}},
        )
    else:
        db["files"].update_one(
            {"repo_hash": repo_hash, "file_path": file_path},
            {"$set": {"cluster_id": cluster_id}},
        )


def bulk_update_file_clusters(
    repo_hash: str, assignments: Sequence[tuple[str, Optional[ObjectId]]]
) -> None:
    """Bulk version of ``update_file_cluster`` over (file_path, cluster_id) pairs."""
    if not assignments:
        return
    db = get_db()
    ops: list[UpdateOne] = []
    for file_path, cluster_id in assignments:
        flt = {"repo_hash": repo_hash, "file_path": file_path}
        if cluster_id is None:
            ops.append(UpdateOne(flt, {"$unset": {"cluster_id": ""}}))
        else:
            ops.append(UpdateOne(flt, {"$set": {"cluster_id": cluster_id}}))
    if ops:
        db["files"].bulk_write(ops, ordered=False)


def get_cluster_for_file(repo_hash: str, file_path: str) -> Optional[dict]:
    """Resolve a file's cluster doc via ``files.cluster_id`` -> ``clusters._id``."""
    db = get_db()
    file_doc = db["files"].find_one(
        {"repo_hash": repo_hash, "file_path": file_path},
        {"cluster_id": 1},
    )
    if not file_doc:
        return None
    cid = file_doc.get("cluster_id")
    if cid is None:
        return None
    return db["clusters"].find_one({"repo_hash": repo_hash, "_id": cid})


def clusters_for_files(
    repo_hash: str, file_paths: Sequence[str]
) -> dict[str, dict]:
    """Batch version of :func:`get_cluster_for_file` for many file paths.

    Two queries: one over ``files`` to get each file's ``cluster_id``, one
    over ``clusters`` to fetch the cluster docs. Returns a mapping from
    ``file_path`` to its cluster doc; files without a cluster are omitted.
    """
    if not file_paths:
        return {}
    db = get_db()
    rows = list(
        db["files"].find(
            {
                "repo_hash": repo_hash,
                "file_path": {"$in": list(file_paths)},
                "cluster_id": {"$exists": True},
            },
            {"file_path": 1, "cluster_id": 1, "_id": 0},
        )
    )
    cluster_ids = list({r["cluster_id"] for r in rows})
    cluster_docs = {
        c["_id"]: c
        for c in db["clusters"].find(
            {"repo_hash": repo_hash, "_id": {"$in": cluster_ids}}
        )
    }
    out: dict[str, dict] = {}
    for r in rows:
        cdoc = cluster_docs.get(r["cluster_id"])
        if cdoc is not None:
            out[r["file_path"]] = cdoc
    return out


def cluster_member_files(repo_hash: str, cluster_id: ObjectId) -> list[str]:
    """Files assigned to ``cluster_id``, sorted by path. Uses the sparse
    ``files_repo_cluster`` index."""
    db = get_db()
    return [
        doc["file_path"]
        for doc in db["files"]
        .find({"repo_hash": repo_hash, "cluster_id": cluster_id})
        .sort("file_path", 1)
    ]


def cluster_member_symbols(
    repo_hash: str, cluster_id: ObjectId
) -> list[dict]:
    """Symbols whose ``file_path`` resolves to this cluster."""
    file_paths = cluster_member_files(repo_hash, cluster_id)
    if not file_paths:
        return []
    db = get_db()
    return list(
        db["symbols"].find(
            {"repo_hash": repo_hash, "file_path": {"$in": file_paths}}
        )
    )


def reset_clusters(repo_hash: str) -> None:
    """Delete clusters/cluster_dependencies and clear ``cluster_id`` on files."""
    db = get_db()
    db["clusters"].delete_many({"repo_hash": repo_hash})
    db["cluster_dependencies"].delete_many({"repo_hash": repo_hash})
    db["files"].update_many(
        {"repo_hash": repo_hash, "cluster_id": {"$exists": True}},
        {"$unset": {"cluster_id": ""}},
    )


def reset_flows(repo_hash: str) -> None:
    """Delete all Layer 2 flows for the repo. Without this, re-indexing
    accumulates duplicates because the ``flows`` collection has no unique
    constraint to absorb them."""
    db = get_db()
    db["flows"].delete_many({"repo_hash": repo_hash})


def reset_layer1(repo_hash: str) -> None:
    """Delete every Layer 1 row (files, symbols, refs, symbol_embeddings).
    Clears the foundation so a re-index produces a clean slate; without this,
    deleted-or-renamed symbols persist forever (the unique index dedupes
    re-inserts but never expunges stale rows)."""
    db = get_db()
    db["files"].delete_many({"repo_hash": repo_hash})
    db["symbols"].delete_many({"repo_hash": repo_hash})
    db["refs"].delete_many({"repo_hash": repo_hash})
    db["symbol_embeddings"].delete_many({"repo_hash": repo_hash})


def count_clusters(repo_hash: str) -> int:
    """Total cluster count for the repo."""
    db = get_db()
    return db["clusters"].count_documents({"repo_hash": repo_hash})


def count_cluster_dependencies(repo_hash: str) -> int:
    """Total cluster dependency edges for the repo."""
    db = get_db()
    return db["cluster_dependencies"].count_documents({"repo_hash": repo_hash})


# ---------------------------------------------------------------------------
# Layer 4: invariants
# ---------------------------------------------------------------------------


def insert_invariant(
    repo_hash: str,
    target_symbol_id: Optional[ObjectId],
    text: str,
    source_kind: str,
    source_location: str,
    confidence: float,
    extracted_at: Optional[str] = None,
) -> ObjectId:
    db = get_db()
    res = db["invariants"].insert_one(
        {
            "repo_hash": repo_hash,
            "target_symbol_id": target_symbol_id,
            "text": text,
            "source_kind": source_kind,
            "source_location": source_location,
            "confidence": float(confidence),
            "extracted_at": extracted_at or _now_iso(),
        }
    )
    return res.inserted_id


def fetch_symbols_by_file(repo_hash: str, file_path: str) -> list[dict]:
    db = get_db()
    return list(
        db["symbols"]
        .find({"repo_hash": repo_hash, "file_path": file_path})
        .sort("line_start", 1)
    )


def fetch_invariants_for_symbol(
    repo_hash: str, symbol_id: ObjectId, min_confidence: float = 0.0
) -> list[dict]:
    db = get_db()
    return list(
        db["invariants"]
        .find(
            {
                "repo_hash": repo_hash,
                "target_symbol_id": symbol_id,
                "confidence": {"$gte": min_confidence},
            }
        )
        .sort("confidence", -1)
    )


def bulk_insert_invariants(
    repo_hash: str, rows: Sequence[dict]
) -> list[ObjectId]:
    """Insert many invariant docs; returns inserted ids aligned with ``rows``."""
    if not rows:
        return []
    db = get_db()
    now = _now_iso()
    docs = [
        {
            "repo_hash": repo_hash,
            "target_symbol_id": r.get("target_symbol_id"),
            "text": r["text"],
            "source_kind": r["source_kind"],
            "source_location": r["source_location"],
            "confidence": float(r["confidence"]),
            "extracted_at": r.get("extracted_at") or now,
        }
        for r in rows
    ]
    res = db["invariants"].insert_many(docs, ordered=False)
    return list(res.inserted_ids)


def iter_invariants(repo_hash: str) -> list[dict]:
    """All invariants for a repo, sorted by descending confidence."""
    db = get_db()
    return list(
        db["invariants"].find({"repo_hash": repo_hash}).sort("confidence", -1)
    )


def invariants_for_symbols(
    repo_hash: str,
    symbol_ids: Sequence[ObjectId],
    min_confidence: float = 0.0,
) -> dict[ObjectId, list[dict]]:
    """Batch lookup grouped by ``target_symbol_id``."""
    if not symbol_ids:
        return {}
    db = get_db()
    cursor = (
        db["invariants"]
        .find(
            {
                "repo_hash": repo_hash,
                "target_symbol_id": {"$in": list(symbol_ids)},
                "confidence": {"$gte": min_confidence},
            }
        )
        .sort("confidence", -1)
    )
    grouped: dict[ObjectId, list[dict]] = {}
    for doc in cursor:
        grouped.setdefault(doc["target_symbol_id"], []).append(doc)
    return grouped


def invariants_for_file(
    repo_hash: str, file_path: str, min_confidence: float = 0.0
) -> list[dict]:
    """All invariants whose target symbol's ``file_path`` matches."""
    db = get_db()
    sym_ids = [
        d["_id"]
        for d in db["symbols"].find(
            {"repo_hash": repo_hash, "file_path": file_path}, {"_id": 1}
        )
    ]
    if not sym_ids:
        return []
    grouped = invariants_for_symbols(repo_hash, sym_ids, min_confidence)
    flat: list[dict] = []
    for docs in grouped.values():
        flat.extend(docs)
    flat.sort(key=lambda d: d.get("confidence", 0.0), reverse=True)
    return flat


def invariants_for_cluster(
    repo_hash: str, cluster_id: ObjectId, min_confidence: float = 0.0
) -> list[dict]:
    """All invariants whose target symbol belongs to a file in this cluster."""
    file_paths = cluster_member_files(repo_hash, cluster_id)
    if not file_paths:
        return []
    db = get_db()
    sym_ids = [
        d["_id"]
        for d in db["symbols"].find(
            {"repo_hash": repo_hash, "file_path": {"$in": file_paths}},
            {"_id": 1},
        )
    ]
    if not sym_ids:
        return []
    grouped = invariants_for_symbols(repo_hash, sym_ids, min_confidence)
    flat: list[dict] = []
    for docs in grouped.values():
        flat.extend(docs)
    flat.sort(key=lambda d: d.get("confidence", 0.0), reverse=True)
    return flat


def reset_invariants(repo_hash: str) -> None:
    """Delete all invariants for this repo."""
    db = get_db()
    db["invariants"].delete_many({"repo_hash": repo_hash})


def count_invariants(repo_hash: str) -> int:
    """Total invariant count for the repo."""
    db = get_db()
    return db["invariants"].count_documents({"repo_hash": repo_hash})


# ---------------------------------------------------------------------------
# Agent runs (Phase 2 — agent runner persistence)
# ---------------------------------------------------------------------------


import uuid as _uuid


def create_agent_run(
    repo_hash: str,
    template_id: str,
    scope: Optional[dict],
    prompt: str,
    created_by: Optional[str],
) -> str:
    """Insert a new agent run with status='queued'; return its uuid4 hex run_id.

    The transcript starts empty and is appended to via
    :func:`append_agent_run_step`. The unique ``run_id`` index defends against
    the (vanishingly unlikely) uuid4 collision and lets DELETE / GET look the
    document up without an ObjectId round-trip.
    """
    db = get_db()
    run_id = _uuid.uuid4().hex
    db["agent_runs"].insert_one(
        {
            "run_id": run_id,
            "repo_hash": repo_hash,
            "template_id": template_id,
            "scope": scope,
            "prompt": prompt,
            "status": "queued",
            "created_by": created_by,
            "created_at": _now_iso(),
            "started_at": None,
            "finished_at": None,
            "transcript": [],
            "result": None,
            "error": None,
        }
    )
    return run_id


def update_agent_run_status(
    repo_hash: str, run_id: str, status: str, **fields: Any
) -> None:
    """Set status and optional ``finished_at`` / ``error`` / ``result`` / ``started_at``.

    Status must be one of: queued | running | succeeded | failed | cancelled.
    Unknown ``fields`` are passed through verbatim so the caller can stamp
    things like ``started_at`` without us hard-coding every transition.
    """
    allowed = {"queued", "running", "succeeded", "failed", "cancelled"}
    if status not in allowed:
        raise ValueError("invalid agent run status: %s" % status)
    set_doc: dict[str, Any] = {"status": status}
    for k, v in fields.items():
        set_doc[k] = v
    db = get_db()
    db["agent_runs"].update_one(
        {"repo_hash": repo_hash, "run_id": run_id},
        {"$set": set_doc},
    )


def append_agent_run_step(repo_hash: str, run_id: str, step: dict) -> None:
    """Atomically ``$push`` ``step`` onto the run's transcript array."""
    db = get_db()
    db["agent_runs"].update_one(
        {"repo_hash": repo_hash, "run_id": run_id},
        {"$push": {"transcript": step}},
    )


def get_agent_run(repo_hash: str, run_id: str) -> Optional[dict]:
    """Return the full run document (including transcript) or None."""
    db = get_db()
    return db["agent_runs"].find_one(
        {"repo_hash": repo_hash, "run_id": run_id}, {"_id": 0}
    )


def list_agent_runs(
    repo_hash: str, limit: int = 50, status: Optional[str] = None
) -> list[dict]:
    """Most-recent first, transcript projected away to keep the payload small."""
    db = get_db()
    query: dict[str, Any] = {"repo_hash": repo_hash}
    if status is not None:
        query["status"] = status
    cursor = (
        db["agent_runs"]
        .find(query, {"_id": 0, "transcript": 0})
        .sort("created_at", -1)
        .limit(int(limit))
    )
    return list(cursor)
