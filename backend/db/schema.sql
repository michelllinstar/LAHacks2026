-- Per-repo Cartographer index schema.
-- Each indexed repository gets its own SQLite file at
-- ~/.cartographer/indexes/<repo_hash>.cart populated with these tables.

CREATE TABLE IF NOT EXISTS files (
    file_path     TEXT PRIMARY KEY,
    cluster_id    INTEGER,
    last_modified TEXT
);

CREATE TABLE IF NOT EXISTS symbols (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    qualified_name TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    line_start     INTEGER NOT NULL,
    line_end       INTEGER NOT NULL,
    kind           TEXT NOT NULL,
    signature      TEXT,
    UNIQUE(qualified_name, file_path, line_start)
);

CREATE INDEX IF NOT EXISTS idx_symbols_qname ON symbols(qualified_name);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path, line_start);

-- "references" is a SQLite reserved word; use "refs".
CREATE TABLE IF NOT EXISTS refs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    source_symbol_id  INTEGER NOT NULL,
    target_symbol_id  INTEGER NOT NULL,
    edge_kind         TEXT NOT NULL,
    FOREIGN KEY (source_symbol_id) REFERENCES symbols(id),
    FOREIGN KEY (target_symbol_id) REFERENCES symbols(id)
);

CREATE INDEX IF NOT EXISTS idx_refs_source ON refs(source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_refs_target ON refs(target_symbol_id);

CREATE TABLE IF NOT EXISTS symbol_embeddings (
    symbol_id INTEGER PRIMARY KEY,
    vector    BLOB NOT NULL,
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
);

-- FTS5 virtual table backed by the symbols table.
CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
    qualified_name,
    signature,
    content='symbols',
    content_rowid='id'
);

CREATE TABLE IF NOT EXISTS flows (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    source_symbol_id  INTEGER,
    sink_symbol_id    INTEGER,
    path_json         TEXT,
    flow_kind         TEXT,
    sensitivity       TEXT
);

CREATE TABLE IF NOT EXISTS flow_paths (
    flow_id                INTEGER,
    position               INTEGER,
    intermediate_symbol_id INTEGER
);

CREATE TABLE IF NOT EXISTS clusters (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    role_description  TEXT,
    naming_convention TEXT,
    code_shape_json   TEXT
);

CREATE TABLE IF NOT EXISTS cluster_dependencies (
    source_cluster_id INTEGER,
    target_cluster_id INTEGER,
    kind              TEXT
);

CREATE TABLE IF NOT EXISTS invariants (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    target_symbol_id  INTEGER,
    text              TEXT,
    source_kind       TEXT,
    source_location   TEXT,
    confidence        REAL,
    extracted_at      TEXT
);
