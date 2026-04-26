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
import time
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
        logger.warning("embeddings: GEMINI_API_KEY not set; embeddings disabled, fallback to empty buffers")
        return None
    try:
        from google import genai  # type: ignore
    except ImportError as exc:  # pragma: no cover
        logger.warning("embeddings: google-genai unavailable (%s); embeddings disabled, fallback to empty buffers", exc)
        return None
    try:
        _client = genai.Client(api_key=api_key)
        logger.info("embeddings: genai client constructed model=%s output_dim=%d batch_size=%d", _MODEL_NAME, _OUTPUT_DIM, _BATCH_SIZE)
    except Exception as exc:  # pragma: no cover
        logger.warning("embeddings: failed to construct genai client: %s", exc)
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
        logger.warning("embeddings: client unavailable; returning %d empty buffers (fallback)", len(texts))
        return [b"" for _ in texts]

    try:
        from google.genai import types  # type: ignore
    except ImportError:  # pragma: no cover
        logger.warning("embeddings: google.genai.types unavailable; returning %d empty buffers (fallback)", len(texts))
        return [b"" for _ in texts]
    import numpy as np

    total = len(texts)
    total_batches = (total + _BATCH_SIZE - 1) // _BATCH_SIZE
    logger.info("embeddings: starting embed_text total_symbols=%d batches=%d batch_size=%d model=%s", total, total_batches, _BATCH_SIZE, _MODEL_NAME)
    t_start = time.monotonic()
    success_count = 0
    failed_batches = 0
    observed_dim: Optional[int] = None

    results: list[bytes] = []
    for start in range(0, len(texts), _BATCH_SIZE):
        chunk = texts[start : start + _BATCH_SIZE]
        batch_idx = (start // _BATCH_SIZE) + 1
        logger.info("embeddings: batch %d/%d size=%d", batch_idx, total_batches, len(chunk))
        try:
            resp = client.models.embed_content(
                model=_MODEL_NAME,
                contents=chunk,
                config=types.EmbedContentConfig(output_dimensionality=_OUTPUT_DIM),
            )
        except Exception as exc:
            logger.warning("embeddings: Gemini embed_content failed for batch %d/%d size=%d: %s", batch_idx, total_batches, len(chunk), exc)
            failed_batches += 1
            results.extend(b"" for _ in chunk)
            continue
        embeddings = getattr(resp, "embeddings", None) or []
        if len(embeddings) != len(chunk):
            logger.warning(
                "embeddings: Gemini returned %d embeddings for %d inputs in batch %d/%d; padding with empty",
                len(embeddings),
                len(chunk),
                batch_idx,
                total_batches,
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
            if observed_dim is None:
                observed_dim = int(arr.shape[0])
                logger.debug("embeddings: first vector returned dim=%d (expected=%d)", observed_dim, _OUTPUT_DIM)
            success_count += 1
            logger.debug("embeddings: batch %d/%d index=%d dim=%d", batch_idx, total_batches, i, int(arr.shape[0]))
            results.append(arr.astype("float32").tobytes())
    elapsed = time.monotonic() - t_start
    logger.info(
        "embeddings: done total_symbols=%d success=%d failed_batches=%d/%d dim=%s elapsed_sec=%.3f",
        total,
        success_count,
        failed_batches,
        total_batches,
        observed_dim if observed_dim is not None else "n/a",
        elapsed,
    )
    return results


def embed_symbols(rows: Iterable["SymbolRow"]) -> list[bytes]:
    """Encode ``f"{kind} {qualified_name} {signature}"`` for each row."""
    rows = list(rows)
    payloads = [f"{r.kind} {r.qualified_name} {r.signature}".strip() for r in rows]
    logger.info("embeddings: embed_symbols requested rows=%d", len(payloads))
    return embed_text(payloads)


def embed_query(text: str) -> Optional[bytes]:
    """Encode a single query string, returning a float32 byte buffer."""
    logger.debug("embeddings: embed_query length=%d", len(text or ""))
    out = embed_text([text])
    if not out or not out[0]:
        logger.warning("embeddings: embed_query returned no vector (fallback to empty)")
        return None
    return out[0]
