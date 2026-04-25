"""Lazy Anthropic client wrapper.

MVP does not call this — it exists so Layer 3 / decomposer modules can adopt it
later without restructuring imports.
"""

from __future__ import annotations

import os
from typing import Optional

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        from anthropic import Anthropic  # type: ignore
    except ImportError:  # pragma: no cover
        return None
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    _client = Anthropic(api_key=api_key)
    return _client


def complete(system: str, user: str, max_tokens: int = 512, model: Optional[str] = None) -> str:
    """Run a single Claude completion and return the text payload.

    Returns an empty string if the SDK is unavailable or no API key is set, so
    callers can degrade gracefully during the hackathon.
    """
    client = _get_client()
    if client is None:
        return ""
    model = model or os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    parts = []
    for block in resp.content:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "".join(parts)
