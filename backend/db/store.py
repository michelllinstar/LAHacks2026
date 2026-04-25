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

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

from bson import Binary, ObjectId
from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient, TEXT
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

# Load env from the repo-root .env.local so CLI/agent processes get the same
# configuration the FastAPI app uses.
_ROOT_ENV = Path(__file__).resolve().parent.parent.parent / ".env.local"
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV)


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
        _client = MongoClient(_mongo_uri(), serverSelectionTimeoutMS=5000)
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
    db["symbol_embeddings"].create_index(
        [("repo_hash", ASCENDING)], name="symbol_embeddings_repo"
    )

    db["flows"].create_index([("repo_hash", ASCENDING)], name="flows_repo")
    db["clusters"].create_index([("repo_hash", ASCENDING)], name="clusters_repo")
    db["cluster_dependencies"].create_index(
        [("repo_hash", ASCENDING)], name="cluster_deps_repo"
    )
    db["invariants"].create_index(
        [("repo_hash", ASCENDING), ("target_symbol_id", ASCENDING)],
        name="invariants_repo_target",
    )


def init_control_db() -> None:
    """Idempotently create control-plane indexes."""
    _ensure_control_indexes(get_db())


def init_repo_db(repo_hash: str) -> None:
    """Idempotently create per-repo collection indexes.

    All repos share collections; ``repo_hash`` is here for API compatibility
    with the previous SQLite store.
    """
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
    """Each row: ``{"symbol_id": ObjectId, "vector": bytes}``."""
    if not rows:
        return
    for row in rows:
        upsert_symbol_embedding(repo_hash, row["symbol_id"], row["vector"])


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


# ---------------------------------------------------------------------------
# Layer 3: clusters
# ---------------------------------------------------------------------------


def insert_cluster(
    repo_hash: str,
    role_description: str,
    naming_convention: Optional[str],
    code_shape: Any,
) -> ObjectId:
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
    db = get_db()
    return db["clusters"].find_one({"repo_hash": repo_hash, "_id": cluster_id})


def fetch_cluster_member_files(repo_hash: str, cluster_id: ObjectId) -> list[str]:
    db = get_db()
    return [
        doc["file_path"]
        for doc in db["files"]
        .find({"repo_hash": repo_hash, "cluster_id": cluster_id})
        .sort("file_path", 1)
    ]


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
