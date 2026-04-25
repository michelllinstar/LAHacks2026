-- Control plane DB at ~/.cartographer/control.db.
-- Tracks registered repositories and their indexing jobs across layers.

CREATE TABLE IF NOT EXISTS repos (
    hash       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    git_url    TEXT,
    local_path TEXT,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS index_jobs (
    job_id     TEXT PRIMARY KEY,
    repo_hash  TEXT NOT NULL,
    layer      TEXT NOT NULL,
    state      TEXT NOT NULL,
    count      INTEGER DEFAULT 0,
    started_at TEXT,
    ended_at   TEXT
);
