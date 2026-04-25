"""Connection helpers and per-layer CRUD primitives for the Cartographer index.

Every Cartographer deployment has two kinds of SQLite databases:

* A single **control DB** at ``~/.cartographer/control.db`` (overridable via the
  ``CARTOGRAPHER_CONTROL_DB`` environment variable) that tracks registered
  repositories and indexing jobs.
* One **repo DB** per indexed repository at
  ``~/.cartographer/indexes/<repo_hash>.cart`` containing the four-layer index
  for that repository.

This module exposes small helpers for opening connections, initialising the
schemas idempotently, and performing the most common per-layer reads/writes.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Optional

from dotenv import load_dotenv

# Load env from the repo-root .env.local so CLI/agent processes get the same
# configuration the FastAPI app uses.
_ROOT_ENV = Path(__file__).resolve().parent.parent.parent / ".env.local"
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV)

_SCHEMA_DIR = Path(__file__).resolve().parent
_REPO_SCHEMA_PATH = _SCHEMA_DIR / "schema.sql"
_CONTROL_SCHEMA_PATH = _SCHEMA_DIR / "control_schema.sql"


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _cartographer_home() -> Path:
    return Path.home() / ".cartographer"


def control_db_path() -> Path:
    """Resolve the control DB path, honouring the env override."""
    override = os.getenv("CARTOGRAPHER_CONTROL_DB")
    if override:
        return Path(override).expanduser()
    return _cartographer_home() / "control.db"


def repo_db_path(repo_hash: str) -> Path:
    """Return the on-disk path for a per-repo index DB."""
    return _cartographer_home() / "indexes" / f"{repo_hash}.cart"


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_control_db() -> sqlite3.Connection:
    """Open a connection to the control DB."""
    return _connect(control_db_path())


def get_repo_db(repo_hash: str) -> sqlite3.Connection:
    """Open a connection to the per-repo index DB for ``repo_hash``."""
    return _connect(repo_db_path(repo_hash))


# ---------------------------------------------------------------------------
# Schema initialisation
# ---------------------------------------------------------------------------


def _read_schema(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def init_control_db() -> None:
    """Create the control DB schema if it does not already exist."""
    conn = get_control_db()
    try:
        conn.executescript(_read_schema(_CONTROL_SCHEMA_PATH))
        conn.commit()
    finally:
        conn.close()


def init_repo_db(repo_hash: str) -> None:
    """Create the per-repo index schema for ``repo_hash`` if missing."""
    conn = get_repo_db(repo_hash)
    try:
        conn.executescript(_read_schema(_REPO_SCHEMA_PATH))
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Control plane CRUD
# ---------------------------------------------------------------------------


def upsert_repo(
    hash: str,
    name: str,
    git_url: Optional[str] = None,
    local_path: Optional[str] = None,
    status: str = "pending",
) -> None:
    conn = get_control_db()
    try:
        conn.execute(
            """
            INSERT INTO repos (hash, name, git_url, local_path, status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(hash) DO UPDATE SET
                name=excluded.name,
                git_url=excluded.git_url,
                local_path=excluded.local_path,
                status=excluded.status
            """,
            (hash, name, git_url, local_path, status),
        )
        conn.commit()
    finally:
        conn.close()


def list_repos() -> list[sqlite3.Row]:
    conn = get_control_db()
    try:
        return list(conn.execute("SELECT * FROM repos ORDER BY created_at DESC"))
    finally:
        conn.close()


def get_repo(repo_hash: str) -> Optional[sqlite3.Row]:
    conn = get_control_db()
    try:
        cur = conn.execute("SELECT * FROM repos WHERE hash = ?", (repo_hash,))
        return cur.fetchone()
    finally:
        conn.close()


def set_repo_status(repo_hash: str, status: str) -> None:
    conn = get_control_db()
    try:
        conn.execute("UPDATE repos SET status = ? WHERE hash = ?", (status, repo_hash))
        conn.commit()
    finally:
        conn.close()


def upsert_index_job(
    job_id: str,
    repo_hash: str,
    layer: str,
    state: str,
    count: int = 0,
    started_at: Optional[str] = None,
    ended_at: Optional[str] = None,
) -> None:
    conn = get_control_db()
    try:
        conn.execute(
            """
            INSERT INTO index_jobs (job_id, repo_hash, layer, state, count, started_at, ended_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                repo_hash=excluded.repo_hash,
                layer=excluded.layer,
                state=excluded.state,
                count=excluded.count,
                started_at=excluded.started_at,
                ended_at=excluded.ended_at
            """,
            (job_id, repo_hash, layer, state, count, started_at, ended_at),
        )
        conn.commit()
    finally:
        conn.close()


def jobs_for_repo(repo_hash: str) -> list[sqlite3.Row]:
    conn = get_control_db()
    try:
        return list(
            conn.execute(
                "SELECT * FROM index_jobs WHERE repo_hash = ? ORDER BY layer",
                (repo_hash,),
            )
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Layer 1: symbols & references
# ---------------------------------------------------------------------------


def insert_symbol(
    conn: sqlite3.Connection,
    qualified_name: str,
    file_path: str,
    line_start: int,
    line_end: int,
    kind: str,
    signature: Optional[str] = None,
) -> int:
    cur = conn.execute(
        """
        INSERT OR IGNORE INTO symbols
            (qualified_name, file_path, line_start, line_end, kind, signature)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (qualified_name, file_path, line_start, line_end, kind, signature),
    )
    if cur.lastrowid:
        return cur.lastrowid
    row = conn.execute(
        "SELECT id FROM symbols WHERE qualified_name = ? AND file_path = ? AND line_start = ?",
        (qualified_name, file_path, line_start),
    ).fetchone()
    return int(row["id"]) if row else 0


def insert_ref(
    conn: sqlite3.Connection,
    source_symbol_id: int,
    target_symbol_id: int,
    edge_kind: str,
) -> int:
    cur = conn.execute(
        "INSERT INTO refs (source_symbol_id, target_symbol_id, edge_kind) VALUES (?, ?, ?)",
        (source_symbol_id, target_symbol_id, edge_kind),
    )
    return int(cur.lastrowid or 0)


def upsert_file(
    conn: sqlite3.Connection,
    file_path: str,
    cluster_id: Optional[int] = None,
    last_modified: Optional[str] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO files (file_path, cluster_id, last_modified)
        VALUES (?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
            cluster_id=COALESCE(excluded.cluster_id, files.cluster_id),
            last_modified=COALESCE(excluded.last_modified, files.last_modified)
        """,
        (file_path, cluster_id, last_modified),
    )


def upsert_symbol_embedding(
    conn: sqlite3.Connection, symbol_id: int, vector: bytes
) -> None:
    conn.execute(
        """
        INSERT INTO symbol_embeddings (symbol_id, vector) VALUES (?, ?)
        ON CONFLICT(symbol_id) DO UPDATE SET vector=excluded.vector
        """,
        (symbol_id, vector),
    )


def fts_index_symbol(
    conn: sqlite3.Connection,
    symbol_id: int,
    qualified_name: str,
    signature: Optional[str],
) -> None:
    conn.execute(
        "INSERT INTO symbols_fts(rowid, qualified_name, signature) VALUES (?, ?, ?)",
        (symbol_id, qualified_name, signature or ""),
    )


# ---------------------------------------------------------------------------
# Layer 2: flows
# ---------------------------------------------------------------------------


def insert_flow(
    conn: sqlite3.Connection,
    source_symbol_id: Optional[int],
    sink_symbol_id: Optional[int],
    path_json: str,
    flow_kind: str,
    sensitivity: Optional[str] = None,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO flows (source_symbol_id, sink_symbol_id, path_json, flow_kind, sensitivity)
        VALUES (?, ?, ?, ?, ?)
        """,
        (source_symbol_id, sink_symbol_id, path_json, flow_kind, sensitivity),
    )
    return int(cur.lastrowid or 0)


def insert_flow_path(
    conn: sqlite3.Connection,
    flow_id: int,
    position: int,
    intermediate_symbol_id: int,
) -> None:
    conn.execute(
        "INSERT INTO flow_paths (flow_id, position, intermediate_symbol_id) VALUES (?, ?, ?)",
        (flow_id, position, intermediate_symbol_id),
    )


# ---------------------------------------------------------------------------
# Layer 3: clusters
# ---------------------------------------------------------------------------


def insert_cluster(
    conn: sqlite3.Connection,
    role_description: str,
    naming_convention: Optional[str],
    code_shape_json: str,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO clusters (role_description, naming_convention, code_shape_json)
        VALUES (?, ?, ?)
        """,
        (role_description, naming_convention, code_shape_json),
    )
    return int(cur.lastrowid or 0)


def insert_cluster_dependency(
    conn: sqlite3.Connection,
    source_cluster_id: int,
    target_cluster_id: int,
    kind: str,
) -> None:
    conn.execute(
        "INSERT INTO cluster_dependencies (source_cluster_id, target_cluster_id, kind) VALUES (?, ?, ?)",
        (source_cluster_id, target_cluster_id, kind),
    )


# ---------------------------------------------------------------------------
# Layer 4: invariants
# ---------------------------------------------------------------------------


def insert_invariant(
    conn: sqlite3.Connection,
    target_symbol_id: Optional[int],
    text: str,
    source_kind: str,
    source_location: str,
    confidence: float,
    extracted_at: Optional[str] = None,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO invariants
            (target_symbol_id, text, source_kind, source_location, confidence, extracted_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        """,
        (target_symbol_id, text, source_kind, source_location, confidence, extracted_at),
    )
    return int(cur.lastrowid or 0)


# ---------------------------------------------------------------------------
# Convenience read helpers used by the query engine / specialists.
# ---------------------------------------------------------------------------


def fetch_symbols_by_file(
    conn: sqlite3.Connection, file_path: str
) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            "SELECT * FROM symbols WHERE file_path = ? ORDER BY line_start",
            (file_path,),
        )
    )


def fetch_invariants_for_symbol(
    conn: sqlite3.Connection, symbol_id: int, min_confidence: float = 0.0
) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT * FROM invariants
            WHERE target_symbol_id = ? AND confidence >= ?
            ORDER BY confidence DESC
            """,
            (symbol_id, min_confidence),
        )
    )


def fetch_cluster(conn: sqlite3.Connection, cluster_id: int) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM clusters WHERE id = ?", (cluster_id,)
    ).fetchone()


def fetch_cluster_member_files(
    conn: sqlite3.Connection, cluster_id: int
) -> list[str]:
    return [
        row["file_path"]
        for row in conn.execute(
            "SELECT file_path FROM files WHERE cluster_id = ? ORDER BY file_path",
            (cluster_id,),
        )
    ]


def executemany(
    conn: sqlite3.Connection, sql: str, rows: Iterable[tuple[Any, ...]]
) -> None:
    """Thin wrapper to keep call sites symmetric with the helpers above."""
    conn.executemany(sql, rows)
