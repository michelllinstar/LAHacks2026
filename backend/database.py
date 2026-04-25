import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env.local')

DEFAULT_DB_PATH = Path(__file__).parent.parent / 'cartographer.db'
DB_PATH = os.getenv('SQLITE_DB_PATH', str(DEFAULT_DB_PATH))


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def init_schema() -> None:
    conn = get_connection()
    conn.executescript(
        '''
        CREATE TABLE IF NOT EXISTS projects (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            slug       TEXT UNIQUE NOT NULL,
            name       TEXT NOT NULL,
            repo_url   TEXT
        );

        CREATE TABLE IF NOT EXISTS diagrams (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id      INTEGER NOT NULL,
            name            TEXT NOT NULL,
            description     TEXT,
            cloudinary_url  TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_diagrams_project ON diagrams(project_id);
        '''
    )
    conn.commit()
    conn.close()


init_schema()
