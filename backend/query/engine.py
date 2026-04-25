"""Cartographer Query Engine — bundles five query types over Layer 1 data.

For the MVP only Layer 1 is populated, so flows/architecture/invariants
endpoints return well-formed but empty responses.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

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
        # Invariant Reporter attaches Layer 4 hints. Layer 3 region scoping is
        # now implemented as a soft filter: if a dominant cluster is detected
        # among the candidates, the candidate set is restricted to that
        # cluster and its convention manifest is attached to the bundle.
        decomp = decomposer.decompose(req.task)
        task_type = decomp["task_type"]
        keywords = decomp["keywords"]

        candidate_ids = self._hybrid_retrieve(req.task, keywords, req.seed_symbol)
        if not candidate_ids:
            return bundle.build_context_bundle(
                symbols=[],
                notes=["no matching symbols indexed for this repository yet"],
            )

        # ------------------------------------------------------------------
        # Layer 3 region-scoping pass. Hydrate candidate file_paths, find the
        # dominant cluster, and (if it covers >= 60% of candidates) restrict
        # the candidate set to symbols inside that cluster.
        # ------------------------------------------------------------------
        notes: list[str] = []
        region: Optional[Region] = None
        cand_docs = db_store.get_symbols_by_ids(self.repo_hash, candidate_ids)
        sym_to_file: dict[ObjectId, str] = {
            doc["_id"]: doc.get("file_path", "") for doc in cand_docs
        }
        cluster_for_path: dict[str, Optional[ObjectId]] = {}
        cluster_docs: dict[ObjectId, dict] = {}
        cluster_counts: dict[ObjectId, int] = {}
        for sid in candidate_ids:
            fp = sym_to_file.get(sid, "")
            if not fp:
                continue
            if fp not in cluster_for_path:
                cdoc = db_store.get_cluster_for_file(self.repo_hash, fp)
                if cdoc is None:
                    cluster_for_path[fp] = None
                else:
                    cid = cdoc["_id"]
                    cluster_for_path[fp] = cid
                    cluster_docs[cid] = cdoc
            cid = cluster_for_path.get(fp)
            if cid is not None:
                cluster_counts[cid] = cluster_counts.get(cid, 0) + 1

        scoped_ids = candidate_ids
        if cluster_counts:
            top_cid, top_count = max(cluster_counts.items(), key=lambda kv: kv[1])
            if top_count / max(1, len(candidate_ids)) >= 0.60:
                scoped_ids = [
                    sid
                    for sid in candidate_ids
                    if cluster_for_path.get(sym_to_file.get(sid, "")) == top_cid
                ]
                region = self._cluster_to_region(cluster_docs[top_cid])
                notes.append("region scoping applied")

        query_vec = embeddings.embed_query(req.task)
        signals = ranker.combine(self.repo_hash, scoped_ids, query_vec, task_type=task_type)
        ranked = sorted(
            scoped_ids,
            key=lambda sid: signals.get(sid, {}).get("score", 0.0),
            reverse=True,
        )[:_TOP_K_RESULT]
        relevant = self._hydrate_symbols(ranked, signals)
        if not query_vec:
            notes.append("embedding model unavailable; ranking used text + structure only")

        # Layer 4: attach high-confidence invariants to the ranked symbols.
        # SPEC §4.4: comment-derived invariants get 0.35 confidence and are
        # advisory hints, not assertions; threshold 0.4 keeps tests (0.85) +
        # defensive checks (0.6) and drops the LLM-derived noise. We pull at
        # threshold 0.0 once and partition client-side so we can tell the
        # caller how many low-confidence invariants were filtered out.
        if relevant:
            try:
                inv_all = db_store.invariants_for_symbols(
                    self.repo_hash, list(ranked), min_confidence=0.0
                )
            except Exception:
                inv_all = {}

            id_docs = db_store.get_symbols_by_ids(self.repo_hash, list(ranked))
            id_to_qname = {doc["_id"]: doc.get("qualified_name", "") for doc in id_docs}
            relevant_by_qname: dict[str, RelevantSymbol] = {
                rs.qualified_name: rs for rs in relevant
            }
            attached_count = 0
            filtered_low = 0
            for sid in ranked:
                qname = id_to_qname.get(sid, "")
                rs = relevant_by_qname.get(qname)
                if rs is None:
                    continue
                bucket = inv_all.get(sid, []) or []
                hi = [inv for inv in bucket if float(inv.get("confidence", 0.0)) >= 0.4]
                # Compact wire payload: text + source_kind + confidence only.
                rs.invariants = [
                    {
                        "text": inv.get("text", ""),
                        "source_kind": inv.get("source_kind", ""),
                        "confidence": float(inv.get("confidence", 0.0)),
                    }
                    for inv in hi
                ]
                attached_count += len(hi)
                filtered_low += len(bucket) - len(hi)

            if attached_count:
                notes.append(f"attached {attached_count} invariant(s) to ranked symbols")
            if filtered_low:
                notes.append(
                    f"filtered {filtered_low} low-confidence invariant(s) (< 0.4)"
                )

        return bundle.build_context_bundle(
            symbols=relevant,
            region=region,
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
        """Layer 4 invariants for a symbol or cluster, with confidence filtering."""
        min_conf = float(req.min_confidence or 0.0)
        raw: list[dict] = []
        if req.symbol:
            seed = db_store.get_symbol(self.repo_hash, qualified_name=req.symbol)
            if seed is not None:
                raw = db_store.fetch_invariants_for_symbol(
                    self.repo_hash, seed["_id"], min_confidence=min_conf
                )
        elif req.cluster_id:
            try:
                cluster_oid = ObjectId(req.cluster_id)
            except Exception:
                return []
            raw = db_store.invariants_for_cluster(
                self.repo_hash, cluster_oid, min_confidence=min_conf
            )
        else:
            return []
        # Resolve target_symbol_id → qualified_name for the wire shape.
        target_ids = list(
            {
                inv.get("target_symbol_id")
                for inv in raw
                if inv.get("target_symbol_id") is not None
            }
        )
        qname_lookup: dict = {}
        if target_ids:
            for doc in db_store.get_symbols_by_ids(self.repo_hash, target_ids):
                qname_lookup[doc["_id"]] = doc.get("qualified_name", "")
        return [self._invariant_to_payload(inv, qname_lookup) for inv in raw]

    def _invariant_to_payload(
        self,
        inv: dict,
        qname_lookup: dict[ObjectId, str],
    ) -> dict:
        """Convert an invariant doc into the Invariant wire shape (matches
        backend/models.py:Invariant)."""
        return {
            "target_symbol": qname_lookup.get(inv.get("target_symbol_id"), ""),
            "text": inv.get("text", ""),
            "source_kind": inv.get("source_kind", ""),
            "source_location": inv.get("source_location", ""),
            "confidence": float(inv.get("confidence", 0.0)),
        }

    def describe_architecture(self, req: ArchRequest) -> ArchResponse:
        """Resolve a path or cluster_id to its Layer 3 manifest."""
        cluster_doc: Optional[dict] = None
        if req.cluster_id is not None:
            try:
                oid = ObjectId(str(req.cluster_id))
            except Exception:
                return ArchResponse(
                    cluster=Region(role="", conventions={}, dependencies={}),
                    member_files=[],
                )
            cluster_doc = db_store.fetch_cluster(self.repo_hash, oid)
        elif req.path:
            try:
                cluster_doc = db_store.get_cluster_for_file(self.repo_hash, req.path)
            except Exception:
                cluster_doc = None
        if cluster_doc is None:
            return ArchResponse(
                cluster=Region(role="", conventions={}, dependencies={}),
                member_files=[],
            )
        region = self._cluster_to_region(cluster_doc)
        members = db_store.cluster_member_files(self.repo_hash, cluster_doc["_id"])
        return ArchResponse(cluster=region, member_files=members)

    def find_exemplars(self, req: ExemplarRequest) -> ExemplarResponse:
        """Top files within a cluster ranked by structural centrality + task fit."""
        try:
            cluster_oid = ObjectId(str(req.cluster_id))
        except Exception:
            return ExemplarResponse(files=[])
        member_files = db_store.cluster_member_files(self.repo_hash, cluster_oid)
        if not member_files:
            return ExemplarResponse(files=[])
        # Re-use ranker signals scoped to symbols within these files.
        member_symbols = db_store.cluster_member_symbols(self.repo_hash, cluster_oid)
        if not member_symbols:
            return ExemplarResponse(
                files=[
                    Exemplar(file_path=fp, reason="cluster member")
                    for fp in member_files[:5]
                ]
            )
        candidate_ids = [doc["_id"] for doc in member_symbols]
        query_vec = embeddings.embed_query(req.task) if req.task else None
        signals = ranker.combine(
            self.repo_hash, candidate_ids, query_vec, task_type="modify existing"
        )
        # Aggregate signals up to file level (max score per file).
        by_file: dict[str, float] = {}
        sym_to_file = {doc["_id"]: doc.get("file_path", "") for doc in member_symbols}
        for sid in candidate_ids:
            fp = sym_to_file.get(sid, "")
            score = signals.get(sid, {}).get("score", 0.0)
            if not fp:
                continue
            by_file[fp] = max(by_file.get(fp, 0.0), score)
        ranked = sorted(by_file.items(), key=lambda kv: kv[1], reverse=True)[:5]
        return ExemplarResponse(
            files=[
                Exemplar(
                    file_path=fp,
                    reason=f"top-ranked exemplar in cluster (score {score:.3f})",
                )
                for fp, score in ranked
            ]
        )

    def _cluster_to_region(self, cluster_doc: dict) -> Region:
        """Convert a Mongo cluster doc into the Region wire shape.

        Pulls cluster_dependencies for this repo, filters to edges sourced at
        this cluster, and groups them by ``kind`` into the Region's
        ``dependencies`` dict.
        """
        cid = cluster_doc.get("_id")
        deps: dict[str, list] = {"allowed": [], "forbidden": []}
        try:
            for edge in db_store.iter_cluster_dependencies(self.repo_hash):
                if edge.get("source_cluster_id") != cid:
                    continue
                kind = edge.get("kind")
                target = edge.get("target_cluster_id")
                if target is None:
                    continue
                target_str = str(target)
                if kind == "allowed":
                    deps["allowed"].append(target_str)
                elif kind == "forbidden":
                    deps["forbidden"].append(target_str)
        except Exception:
            deps = {"allowed": [], "forbidden": []}

        conventions: dict[str, Any] = {
            "naming": cluster_doc.get("naming_convention"),
            "code_shape": cluster_doc.get("code_shape"),
        }
        return Region(
            cluster_id=str(cid) if cid is not None else None,
            role=cluster_doc.get("role_description", "") or "",
            conventions=conventions,
            dependencies=deps,
        )

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
