"""Live-Mongo round-trip tests.

These tests require a reachable MongoDB instance. They are skipped by
default so the rest of the suite stays hermetic. To run them locally:

    brew services start mongodb-community  # or docker run mongo:7
    MONGODB_URI=mongodb://localhost:27017 \
    MONGODB_DB_NAME=cartographer_test \
    pytest tests/test_store_live.py -v

The DB name defaults to ``cartographer_test`` so a stray run does not
clobber the developer's main ``cartographer`` database. Each test
uses a unique repo_hash so parallel runs do not collide.
"""

from __future__ import annotations

import os
import uuid

import pytest
from bson import ObjectId

# Skip the entire module when no live URI is configured. The unit-test
# conftest sets ``MONGODB_URI=mongodb://localhost:0`` as a sentinel so
# accidental real connections fail fast during the hermetic suite — we
# treat that sentinel as "no live Mongo" too.
_RAW_URI = os.getenv("MONGODB_URI", "")
_LIVE_URI = _RAW_URI and "localhost:0" not in _RAW_URI
pytestmark = pytest.mark.skipif(
    not _LIVE_URI,
    reason="MONGODB_URI unset or pointing at the unit-test sentinel; live-Mongo tests skipped",
)


@pytest.fixture(scope="module")
def _live_db():
    """Force a test-scoped DB and ensure migrations have run.

    Not autouse: the module-level ``pytestmark`` skip handles missing
    URI, but pytest still resolves autouse fixtures even for skipped
    tests, so we keep this opt-in via explicit parameter request."""
    if not _LIVE_URI:
        pytest.skip("MONGODB_URI unset or sentinel; live-Mongo tests skipped")
    os.environ.setdefault("MONGODB_DB_NAME", "cartographer_test")
    from backend.db import store as db_store

    # Reach a fresh client by clearing the module-level cache.
    db_store._client = None  # type: ignore[attr-defined]

    db_store.init_control_db()
    db_store.init_repo_db("_bootstrap")

    yield db_store

    # Best-effort cleanup of the test DB when the module finishes.
    try:
        db_store.get_client().drop_database(os.environ["MONGODB_DB_NAME"])
    except Exception:
        pass


def _fresh_repo_hash() -> str:
    return uuid.uuid4().hex[:12]


def test_bulk_upsert_symbols_roundtrip(_live_db):
    """A bulk upsert of three symbols returns three ObjectIds and is
    findable via the symbols collection. Re-running with the same input
    returns the same ObjectIds (idempotency)."""
    repo_hash = _fresh_repo_hash()
    rows = [
        {
            "qualified_name": "myapp.auth.login",
            "file_path": "/repo/auth.py",
            "line_start": 10,
            "line_end": 20,
            "kind": "function",
            "signature": "login(email, password)",
        },
        {
            "qualified_name": "myapp.auth.logout",
            "file_path": "/repo/auth.py",
            "line_start": 22,
            "line_end": 30,
            "kind": "function",
            "signature": "logout()",
        },
        {
            "qualified_name": "myapp.users.User",
            "file_path": "/repo/users.py",
            "line_start": 1,
            "line_end": 50,
            "kind": "class",
            "signature": "class User",
        },
    ]
    ids_first = _live_db.bulk_upsert_symbols(repo_hash, rows)
    assert len(ids_first) == 3
    assert all(isinstance(oid, ObjectId) for oid in ids_first)

    ids_again = _live_db.bulk_upsert_symbols(repo_hash, rows)
    assert ids_first == ids_again, "second upsert should reuse existing _ids"

    fetched = _live_db.iter_symbols(repo_hash)
    assert len(fetched) == 3


def test_text_search_finds_relevant_symbol(_live_db):
    """The ``$text`` index over (qualified_name, signature) returns the
    expected hit and the regex fallback also fires for substring queries
    that text search misses."""
    repo_hash = _fresh_repo_hash()
    _live_db.bulk_upsert_symbols(repo_hash, [
        {
            "qualified_name": "myapp.payments.charge_card",
            "file_path": "/repo/payments.py",
            "line_start": 1,
            "line_end": 5,
            "kind": "function",
            "signature": "charge_card(amount)",
        },
    ])
    hits = _live_db.text_search_symbols(repo_hash, "charge", limit=10)
    assert any("charge_card" in (d.get("qualified_name") or "") for d in hits)


def test_flows_touching_symbols_or_query(_live_db):
    """The $or query covers source/sink/path branches with one round-trip."""
    repo_hash = _fresh_repo_hash()
    src = ObjectId()
    sink = ObjectId()
    intermediate = ObjectId()
    _live_db.bulk_insert_flows(repo_hash, [
        {
            "source_symbol_id": src,
            "sink_symbol_id": sink,
            "path": [intermediate],
            "flow_kind": "call_chain",
            "sensitivity": None,
        },
    ])
    by_source = _live_db.flows_touching_symbols(repo_hash, [src])
    by_sink = _live_db.flows_touching_symbols(repo_hash, [sink])
    by_intermediate = _live_db.flows_touching_symbols(repo_hash, [intermediate])
    assert len(by_source) == 1
    assert len(by_sink) == 1
    assert len(by_intermediate) == 1


def test_flows_from_symbol_depth_filter(_live_db):
    """``flows_from_symbol(max_depth=N)`` must filter by *edge count*, not by
    raw intermediate count. A previous formulation compared ``$size <= N``
    against an intermediates-only path field, which always passed because the
    builder caps intermediates at ``max_depth - 1``. After the audit fix the
    filter is ``$size <= max_depth - 1``: ``max_depth=1`` keeps only direct
    edges (path=[]) and ``max_depth=2`` admits paths with one intermediate.
    """
    repo_hash = _fresh_repo_hash()
    src = ObjectId()
    sink_direct = ObjectId()
    sink_via_one = ObjectId()
    intermediate = ObjectId()
    _live_db.bulk_insert_flows(repo_hash, [
        # 1-edge direct call: intermediates = []
        {
            "source_symbol_id": src,
            "sink_symbol_id": sink_direct,
            "path": [],
            "flow_kind": "call_chain",
            "sensitivity": None,
        },
        # 2-edge call chain: intermediates = [one]
        {
            "source_symbol_id": src,
            "sink_symbol_id": sink_via_one,
            "path": [intermediate],
            "flow_kind": "call_chain",
            "sensitivity": None,
        },
    ])

    depth1 = _live_db.flows_from_symbol(repo_hash, src, max_depth=1)
    depth2 = _live_db.flows_from_symbol(repo_hash, src, max_depth=2)
    depth3 = _live_db.flows_from_symbol(repo_hash, src, max_depth=3)

    assert len(depth1) == 1, "depth=1 must keep only the direct call"
    assert len(depth2) == 2, "depth=2 must include the 1-intermediate chain"
    assert len(depth3) == 2, "depth=3 covers all builder-emitted flows"
    # The kept depth-1 flow is the direct one, not the chain.
    assert depth1[0]["sink_symbol_id"] == sink_direct


def test_reset_layer1_wipes_collections(_live_db):
    """``reset_layer1`` removes symbols/refs/files/embeddings for the repo."""
    repo_hash = _fresh_repo_hash()
    _live_db.bulk_upsert_symbols(repo_hash, [
        {
            "qualified_name": "x.y", "file_path": "/r/x.py",
            "line_start": 1, "line_end": 1, "kind": "function", "signature": "y()",
        },
    ])
    _live_db.upsert_file(repo_hash, file_path="/r/x.py", last_modified=None)
    assert _live_db.iter_symbols(repo_hash)
    assert _live_db.iter_files(repo_hash)

    _live_db.reset_layer1(repo_hash)
    assert _live_db.iter_symbols(repo_hash) == []
    assert _live_db.iter_files(repo_hash) == []


def test_health_endpoint_reports_mongo_reachable():
    """End-to-end: with a real Mongo, the /health endpoint reports
    ``mongo: reachable``."""
    from fastapi.testclient import TestClient
    from backend.main import app

    with TestClient(app) as c:
        resp = c.get("/health")
        assert resp.status_code == 200
        assert resp.json()["mongo"] == "reachable"
