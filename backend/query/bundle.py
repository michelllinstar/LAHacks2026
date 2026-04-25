"""Context bundle assembly."""

from __future__ import annotations

from typing import Iterable, Optional

from backend.models import (
    ContextBundle,
    Exemplar,
    FlowPath,
    RelevantSymbol,
    Region,
)


def build_context_bundle(
    symbols: Iterable[RelevantSymbol],
    region: Optional[Region] = None,
    flows: Optional[list[FlowPath]] = None,
    invariants: Optional[list[dict]] = None,  # currently informational; merged into notes
    exemplars: Optional[list[Exemplar]] = None,
    notes: Optional[list[str]] = None,
) -> ContextBundle:
    if region is None:
        region = Region(role="", conventions={}, dependencies={})
    return ContextBundle(
        region=region,
        exemplars=list(exemplars or []),
        relevant_symbols=list(symbols),
        flows=list(flows or []),
        notes=list(notes or []),
    )
