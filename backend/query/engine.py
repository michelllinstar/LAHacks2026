"""Cartographer Query Engine — bundles five query types over Layer 1 data.

For the MVP only Layer 1 is populated, so flows/architecture/invariants
endpoints return well-formed but empty responses.
"""

from __future__ import annotations

from typing import Iterable, Optional

from bson import ObjectId

from backend.db import store as db_store
from backend.indexer import embeddings
from backend.models import (
    ArchRequest,
    ArchResponse,
    ContextBundle,
    Exemplar,
    ExemplarRequest,
    ExemplarResponse,
    FindContextRequest,
    FlowPath,
    FlowRequest,
    InvariantRequest,
    Region,
    RelevantSymbol,
)

from . import bundle, decomposer, ranker

_TOP_K_RETRIEVE = 200
_TOP_K_RESULT = 12


class QueryEngine:
    """Per-repo entry point used by REST routes, agents, and the MCP server."""

    def __init__(self, repo_hash: str) -> None:
        self.repo_hash = repo_hash

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def find_relevant_context(self, req: FindContextRequest) -> ContextBundle:
        # SPEC §5.2 prescribes a sequential pipeline: Architecture Analyst
        # picks a region → Symbol Analyst retrieves and ranks within it →
        # Invariant Reporter attaches Layer 4 hints. Per §7.2.5 hackathon
        # scope reduction, only the Symbol Analyst path is implemented; the
        # other two stages return stub data until Layers 3 and 4 are built.
        decomp = decomposer.decompose(req.task)
        task_type = decomp["task_type"]
        keywords = decomp["keywords"]

        candidate_ids = self._hybrid_retrieve(req.task, keywords, req.seed_symbol)
        if not candidate_ids:
            return bundle.build_context_bundle(
                symbols=[],
                notes=["no matching symbols indexed for this repository yet"],
            )
        query_vec = embeddings.embed_query(req.task)
        signals = ranker.combine(self.repo_hash, candidate_ids, query_vec, task_type=task_type)
        ranked = sorted(
            candidate_ids,
            key=lambda sid: signals.get(sid, {}).get("score", 0.0),
            reverse=True,
        )[:_TOP_K_RESULT]
        relevant = self._hydrate_symbols(ranked, signals)
        notes: list[str] = []
        if not query_vec:
            notes.append("embedding model unavailable; ranking used text + structure only")
        return bundle.build_context_bundle(
            symbols=relevant,
            exemplars=self._derive_exemplars(relevant),
            notes=notes,
        )

    def trace_data_flow(self, req: FlowRequest) -> dict:
        """Forward or backward call-chain trace from a seed symbol."""
        seed = db_store.get_symbol(self.repo_hash, qualified_name=req.symbol)
        if seed is None:
            return {"flows": []}
        if req.direction == "forward":
            flows = db_store.flows_from_symbol(
                self.repo_hash, seed["_id"], max_depth=req.depth
            )
        else:
            flows = db_store.flows_to_symbol(
                self.repo_hash, seed["_id"], max_depth=req.depth
            )
        if not flows:
            return {"flows": []}

        # Batch-resolve every ObjectId touched across all flows so we only hit
        # Mongo once per request instead of once per id.
        needed_ids: set[ObjectId] = set()
        for flow in flows:
            src = flow.get("source_symbol_id")
            sink = flow.get("sink_symbol_id")
            if src is not None:
                needed_ids.add(src)
            if sink is not None:
                needed_ids.add(sink)
            for pid in flow.get("path") or []:
                if pid is not None:
                    needed_ids.add(pid)
        lookup: dict[ObjectId, str] = {}
        if needed_ids:
            for doc in db_store.get_symbols_by_ids(self.repo_hash, list(needed_ids)):
                lookup[doc["_id"]] = doc.get("qualified_name", "")

        return {
            "flows": [self._flow_to_payload(f, lookup) for f in flows],
        }

    def find_invariants(self, req: InvariantRequest) -> list[dict]:
        return []

    def describe_architecture(self, req: ArchRequest) -> ArchResponse:
        return ArchResponse(
            cluster=Region(role="", conventions={}, dependencies={}),
            member_files=[],
        )

    def find_exemplars(self, req: ExemplarRequest) -> ExemplarResponse:
        ctx = self.find_relevant_context(
            FindContextRequest(task=req.task, repo_hash=req.repo_hash)
        )
        seen: set[str] = set()
        files: list[Exemplar] = []
        for sym in ctx.relevant_symbols:
            if sym.file_path in seen:
                continue
            seen.add(sym.file_path)
            files.append(
                Exemplar(
                    file_path=sym.file_path,
                    reason=f"contains {sym.qualified_name} ({sym.kind})",
                )
            )
            if len(files) >= 5:
                break
        return ExemplarResponse(files=files)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _hybrid_retrieve(
        self,
        task: str,
        keywords: list[str],
        seed_symbol: Optional[str],
    ) -> list[ObjectId]:
        ids: set[ObjectId] = set()

        # Mongo $text search (replaces FTS5).
        text_query = " ".join([k for k in keywords if k]) or task
        if text_query.strip():
            for doc in db_store.text_search_symbols(
                self.repo_hash, text_query, limit=_TOP_K_RETRIEVE
            ):
                ids.add(doc["_id"])

        if seed_symbol:
            seed = db_store.get_symbol(self.repo_hash, qualified_name=seed_symbol)
            if seed:
                ids.add(seed["_id"])

        # Final fallback: take the first N symbols so callers always see
        # *something* during the demo.
        if not ids:
            for doc in db_store.iter_symbols(self.repo_hash)[:_TOP_K_RETRIEVE]:
                ids.add(doc["_id"])

        return list(ids)

    def _hydrate_symbols(
        self,
        symbol_ids: Iterable[ObjectId],
        signals: dict,
    ) -> list[RelevantSymbol]:
        ids = list(symbol_ids)
        if not ids:
            return []
        docs = db_store.get_symbols_by_ids(self.repo_hash, ids)
        by_id = {doc["_id"]: doc for doc in docs}
        out: list[RelevantSymbol] = []
        for sid in ids:
            row = by_id.get(sid)
            if row is None:
                continue
            out.append(
                RelevantSymbol(
                    qualified_name=row.get("qualified_name", ""),
                    file_path=row.get("file_path", ""),
                    line_start=int(row.get("line_start", 0)),
                    line_end=int(row.get("line_end", 0)),
                    signature=row.get("signature") or "",
                    kind=row.get("kind", ""),
                    invariants=[],
                    signals=signals.get(sid, {}),
                )
            )
        return out

    def _flow_to_payload(
        self,
        flow_doc: dict,
        lookup: dict[ObjectId, str],
    ) -> dict:
        """Convert a Layer 2 flow doc into the FlowPath wire shape."""
        src_id = flow_doc.get("source_symbol_id")
        sink_id = flow_doc.get("sink_symbol_id")
        path_ids = flow_doc.get("path") or []
        payload = {
            "source_symbol": lookup.get(src_id, "") if src_id is not None else "",
            "sink_symbol": lookup.get(sink_id, "") if sink_id is not None else "",
            "path": [lookup.get(pid, "") for pid in path_ids if pid is not None],
            "flow_kind": flow_doc.get("flow_kind", "call_chain"),
            "sensitivity": flow_doc.get("sensitivity"),
        }
        # Validate against the FlowPath model so callers get the canonical shape;
        # we still return a plain dict for the {"flows": [...]} envelope.
        return FlowPath(**payload).model_dump()

    def _derive_exemplars(self, symbols: list[RelevantSymbol]) -> list[Exemplar]:
        seen: set[str] = set()
        out: list[Exemplar] = []
        for sym in symbols:
            if sym.file_path in seen:
                continue
            seen.add(sym.file_path)
            out.append(
                Exemplar(
                    file_path=sym.file_path,
                    reason=f"top-ranked symbol {sym.qualified_name}",
                )
            )
            if len(out) >= 3:
                break
        return out
