"""Symbol embedding helpers (lazy ``sentence-transformers`` load)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Iterable, Optional

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from .layer1_symbols import SymbolRow

_model: Optional[Any] = None
_load_attempted = False
_MODEL_NAME = "all-MiniLM-L6-v2"


def _get_model() -> Optional[Any]:
    global _model, _load_attempted
    if _model is not None:
        return _model
    if _load_attempted:
        return None
    _load_attempted = True
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except Exception as exc:  # pragma: no cover
        logger.warning("sentence-transformers unavailable (%s); embeddings disabled", exc)
        return None
    try:
        _model = SentenceTransformer(_MODEL_NAME)
    except Exception as exc:  # pragma: no cover
        logger.warning("failed to load %s: %s", _MODEL_NAME, exc)
        _model = None
    return _model


def embed_text(texts: list[str]) -> list[bytes]:
    """Encode a list of strings, returning float32 byte buffers (or empty list)."""
    if not texts:
        return []
    model = _get_model()
    if model is None:
        return [b"" for _ in texts]
    import numpy as np

    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    arr = np.asarray(vectors, dtype="float32")
    return [row.tobytes() for row in arr]


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
