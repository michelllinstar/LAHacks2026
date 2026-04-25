"""Lightweight tests for the new bulk store helpers.

Both ``bulk_upsert_symbols`` and ``flows_touching_symbols`` are exercised
against a ``MagicMock`` Mongo client (no live database required).
"""

from __future__ import annotations

from unittest.mock import MagicMock

from bson import ObjectId

from backend.db import store as db_store


def _patch_db(monkeypatch) -> MagicMock:
    fake_db = MagicMock(name="fake_db")
    monkeypatch.setattr(db_store, "get_db", lambda: fake_db)
    return fake_db


def test_bulk_upsert_symbols_issues_one_bulk_write_and_one_find(monkeypatch):
    fake_db = _patch_db(monkeypatch)

    rows = [
        {
            "qualified_name": "pkg.mod.foo",
            "file_path": "pkg/mod.py",
            "line_start": 1,
            "line_end": 5,
            "kind": "function",
            "signature": "foo()",
        },
        {
            "qualified_name": "pkg.mod.bar",
            "file_path": "pkg/mod.py",
            "line_start": 10,
            "line_end": 12,
            "kind": "function",
            "signature": "bar()",
        },
    ]

    foo_id = ObjectId()
    bar_id = ObjectId()
    fake_db.__getitem__.return_value.find.return_value = iter(
        [
            {
                "_id": foo_id,
                "qualified_name": "pkg.mod.foo",
                "file_path": "pkg/mod.py",
                "line_start": 1,
            },
            {
                "_id": bar_id,
                "qualified_name": "pkg.mod.bar",
                "file_path": "pkg/mod.py",
                "line_start": 10,
            },
        ]
    )

    out = db_store.bulk_upsert_symbols("repo123", rows)

    assert out == [foo_id, bar_id]
    # Exactly one bulk_write call.
    symbols_coll = fake_db.__getitem__.return_value
    assert symbols_coll.bulk_write.call_count == 1
    args, kwargs = symbols_coll.bulk_write.call_args
    assert kwargs.get("ordered") is False
    ops = args[0]
    assert len(ops) == 2  # one UpdateOne per row


def test_bulk_upsert_symbols_empty_returns_empty(monkeypatch):
    _patch_db(monkeypatch)
    assert db_store.bulk_upsert_symbols("repo", []) == []


def test_flows_touching_symbols_builds_or_query(monkeypatch):
    fake_db = _patch_db(monkeypatch)

    sid_a = ObjectId()
    sid_b = ObjectId()
    flow_doc = {"_id": ObjectId(), "source_symbol_id": sid_a, "path": []}
    fake_db.__getitem__.return_value.find.return_value = iter([flow_doc])

    out = db_store.flows_touching_symbols("repo", [sid_a, sid_b])

    assert out == [flow_doc]
    flows_coll = fake_db.__getitem__.return_value
    args, _ = flows_coll.find.call_args
    query = args[0]
    assert query["repo_hash"] == "repo"
    assert {"source_symbol_id": {"$in": [sid_a, sid_b]}} in query["$or"]
    assert {"sink_symbol_id": {"$in": [sid_a, sid_b]}} in query["$or"]
    assert {"path": {"$in": [sid_a, sid_b]}} in query["$or"]


def test_flows_touching_symbols_empty_short_circuits(monkeypatch):
    _patch_db(monkeypatch)
    assert db_store.flows_touching_symbols("repo", []) == []
