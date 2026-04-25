"""Shared pytest fixtures for the Cartographer backend test suite.

Provides a FastAPI TestClient bound to ``backend.main.app`` and a
``mock_store`` fixture that monkeypatches ``backend.db.store`` so endpoints
can be exercised without a live MongoDB instance. We patch both
``get_db`` / ``get_client`` and the higher-level helper functions the
routes call directly (``upsert_repo``, ``init_repo_db``, ``get_repo``,
``list_repos``) so contract validation never trips on a network call.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Make the repo root importable so ``import backend.*`` works regardless of
# the directory pytest is invoked from.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# Force a deterministic Mongo URI / db name so accidental real connections
# fail fast instead of hanging on default discovery.
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:0")
os.environ.setdefault("MONGODB_DB_NAME", "cartographer_test")


@pytest.fixture
def mock_store(monkeypatch):
    """Patch backend.db.store so no Mongo calls escape the test process."""
    from backend.db import store as db_store

    fake_db = MagicMock(name="fake_db")
    fake_client = MagicMock(name="fake_client")
    fake_client.__getitem__.return_value = fake_db

    monkeypatch.setattr(db_store, "get_client", lambda: fake_client)
    monkeypatch.setattr(db_store, "get_db", lambda: fake_db)
    monkeypatch.setattr(db_store, "get_control_db", lambda: fake_db)
    monkeypatch.setattr(db_store, "get_repo_db", lambda repo_hash: fake_db)
    monkeypatch.setattr(db_store, "init_control_db", lambda: None)
    monkeypatch.setattr(db_store, "init_repo_db", lambda repo_hash: None)

    # Helpers the repo route touches directly.
    monkeypatch.setattr(
        db_store,
        "upsert_repo",
        lambda **kwargs: None,
    )

    def _fake_get_repo(repo_hash):
        return {
            "hash": repo_hash,
            "name": "fake-repo",
            "status": "pending",
            "git_url": "https://example.com/fake.git",
            "local_path": None,
        }

    monkeypatch.setattr(db_store, "get_repo", _fake_get_repo)
    monkeypatch.setattr(db_store, "list_repos", lambda: [])

    return {
        "db": fake_db,
        "client": fake_client,
        "store": db_store,
    }


@pytest.fixture
def client(mock_store):
    """FastAPI TestClient bound to backend.main.app with the store mocked."""
    from fastapi.testclient import TestClient
    from backend.main import app

    with TestClient(app) as c:
        yield c
