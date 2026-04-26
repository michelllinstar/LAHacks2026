"""Symbol embedding helpers — Gemini text embeddings via google-genai.

Replaces the local sentence-transformers / PyTorch model with a hosted call to
``gemini-embedding-001``. Trade-offs:

* No PyTorch / transformers dependency (fixes Intel Mac torch wheel gap).
* No 80MB model download at first index.
* Network dependency — when ``GEMINI_API_KEY`` is unset or the API is
  unreachable, ``embed_text`` returns empty byte buffers and the rest of the
  pipeline degrades to text + structure ranking, matching the pre-Gemini
  behaviour.
* Output is dimensionality-truncated to 384 to match the on-disk wire format
  the ranker assumes (see SPEC §9.1).
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, Iterable, Optional

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from .layer1_symbols import SymbolRow

_MODEL_NAME = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
_OUTPUT_DIM = 384
# Gemini embed_content accepts up to 100 inputs per call; batching reduces
# round-trips during indexing. Keep this conservative so a single failed call
# doesn't lose the whole index.
_BATCH_SIZE = 50

_client = None
_load_attempted = False


def _get_client():
    """Lazy-construct the genai client; cache None when unavailable."""
    global _client, _load_attempted
    if _client is not None:
        return _client
    if _load_attempted:
        return None
    _load_attempted = True
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set; embeddings disabled")
        return None
    try:
        from google import genai  # type: ignore
    except ImportError as exc:  # pragma: no cover
        logger.warning("google-genai unavailable (%s); embeddings disabled", exc)
        return None
    try:
        _client = genai.Client(api_key=api_key)
    except Exception as exc:  # pragma: no cover
        logger.warning("failed to construct genai client: %s", exc)
        _client = None
    return _client


def embed_text(texts: list[str]) -> list[bytes]:
    """Encode a list of strings, returning float32 byte buffers (or empty list).

    Empty input → empty list. Client unavailable → list of empty buffers (one
    per input) so the caller's positional alignment is preserved.
    """
    if not texts:
        return []
    client = _get_client()
    if client is None:
        return [b"" for _ in texts]

    try:
        from google.genai import types  # type: ignore
    except ImportError:  # pragma: no cover
        return [b"" for _ in texts]
    import numpy as np

    results: list[bytes] = []
    for start in range(0, len(texts), _BATCH_SIZE):
        chunk = texts[start : start + _BATCH_SIZE]
        try:
            resp = client.models.embed_content(
                model=_MODEL_NAME,
                contents=chunk,
                config=types.EmbedContentConfig(output_dimensionality=_OUTPUT_DIM),
            )
        except Exception as exc:
            logger.warning("Gemini embed_content failed for batch of %d: %s", len(chunk), exc)
            results.extend(b"" for _ in chunk)
            continue
        embeddings = getattr(resp, "embeddings", None) or []
        if len(embeddings) != len(chunk):
            logger.warning(
                "Gemini returned %d embeddings for %d inputs; padding with empty",
                len(embeddings),
                len(chunk),
            )
        for i, _ in enumerate(chunk):
            emb = embeddings[i] if i < len(embeddings) else None
            values = getattr(emb, "values", None) if emb is not None else None
            if not values:
                results.append(b"")
                continue
            arr = np.asarray(values, dtype="float32")
            # Gemini-embedding-001 returns L2-normalized vectors only at the
            # native 3072 dim; truncated outputs need re-normalization so the
            # ranker's cosine math (a · b on unit vectors) stays valid.
            norm = float(np.linalg.norm(arr))
            if norm > 0:
                arr = arr / norm
            results.append(arr.astype("float32").tobytes())
    return results


def embed_symbols(rows: Iterable["SymbolRow"]) -> list[bytes]:
    """Encode ``f"{kind} {qualified_name} {signature}"`` for each row."""
    rows = list(rows)
    payloads = [f"{r.kind} {r.qualified_name} {r.signature}".strip() for r in rows]
    return embed_text(payloads)


def embed_query(text: str) -> Optional[bytes]:
    """Encode a single query string, returning a float32 byte buffer."""
    out = embed_text([text])
    if not out or not out[0]:
        return None
    return out[0]
