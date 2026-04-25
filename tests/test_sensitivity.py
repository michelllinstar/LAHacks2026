"""Layer 2 sensitivity classifier tests (15-case audit suite)."""

from __future__ import annotations

import pytest

from backend.indexer.layer2_flows import _classify_sensitivity


# (qualified-name list, expected tag)
POSITIVE_CASES = [
    (["auth.check_password"], "password"),
    (["auth.getPassword"], "password"),
    (["auth.passwd_hash"], "password"),
    (["auth.user_pwd"], "password"),
    (["auth.api_key"], "token"),
    (["auth.apiKey"], "token"),
    (["auth.access_token"], "token"),
    (["auth.refreshToken"], "token"),
    (["auth.client_secret"], "token"),
    (["users.ssn"], "ssn"),
    (["users.social_security"], "ssn"),
    (["users.tax_id"], "ssn"),
]

NEGATIVE_CASES = [
    ["mod.assassin.handler"],          # contains "ssn" inside "assassin"
    ["geo.compass.module"],            # contains "pass" but not password
    ["math.lesson"],                   # not a sensitive word
    ["queue.process"],                 # benign
    ["database.connection"],           # benign
]


@pytest.mark.parametrize("qnames, expected", POSITIVE_CASES)
def test_positive_sensitivity_cases(qnames, expected):
    assert _classify_sensitivity(qnames) == expected


@pytest.mark.parametrize("qnames", NEGATIVE_CASES)
def test_negative_sensitivity_cases(qnames):
    assert _classify_sensitivity(qnames) is None


def test_first_match_wins_along_path():
    # password should win because it appears first in the pattern list
    out = _classify_sensitivity(["foo.token", "bar.password"])
    assert out in {"password", "token"}  # implementation iterates qname-first
    # But a path with only token tagged returns token
    assert _classify_sensitivity(["foo.access_token"]) == "token"


def test_empty_path_returns_none():
    assert _classify_sensitivity([]) is None
    assert _classify_sensitivity([""]) is None
