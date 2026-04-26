"""Lazy Gemini client wrapper.

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
        from google import genai  # type: ignore
    except ImportError:  # pragma: no cover
        return None
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    _client = genai.Client(api_key=api_key)
    return _client


def complete(system: str, user: str, max_tokens: int = 512, model: Optional[str] = None) -> str:
    """Run a single Gemini completion and return the text payload.

    Returns an empty string if the SDK is unavailable or no API key is set, so
    callers can degrade gracefully during the hackathon.
    """
    client = _get_client()
    if client is None:
        return ""
    model = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    try:
        from google.genai import types  # type: ignore
    except ImportError:  # pragma: no cover
        return ""
    resp = client.models.generate_content(
        model=model,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
        ),
    )
    # ``resp.text`` is a convenience accessor that raises when the response was
    # blocked by safety filters or returned no candidates. Fall back to walking
    # the candidate parts so callers always see a plain string.
    try:
        text = resp.text
    except Exception:
        text = None
    if text:
        return text
    parts: list[str] = []
    for cand in getattr(resp, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            t = getattr(part, "text", None)
            if t:
                parts.append(t)
    return "".join(parts)
