# Codebase Cartographer — Specification

**Status:** Draft v0.1
**Target:** Hackathon weekend build (Agentverse + OmegaClaw + Cognition tracks)
**Audience:** Engineers implementing the system; judges reviewing the design

---

## 1. Overview

Codebase Cartographer is a four-layer semantic index over a source repository, exposed simultaneously as discoverable Agentverse agents, an OmegaClaw skill, and a Model Context Protocol (MCP) server. Its purpose is to replace the blind keyword-and-grep exploration that current AI coding agents perform with structured, conventionally-grounded context retrieval.

The system addresses one specific failure mode: AI coding agents waste tens of thousands of tokens per task discovering what to read and frequently still miss the relevant files. This is not a search-efficiency problem alone — it is an architectural-blindness problem. Agents do not know which directory implements which role, what conventions govern that role, or what implicit contracts a function's callers are responsible for upholding.

Cartographer indexes four kinds of knowledge over a repository: the structural inventory of named symbols and their references; the data-flow paths that values take through the program; the architectural roles and conventions of clusters of files; and the implicit invariants that code assumes but does not enforce. Queries against the combined index return tightly scoped context bundles that include not only file paths but the conventions, exemplars, and constraints relevant to the requested task.

## 2. Goals and Non-Goals

### 2.1 Goals

The system must reduce token consumption for context retrieval on a fifty-thousand-line codebase by at least an order of magnitude relative to baseline grep-and-read exploration, measured on a fixed task set. It must produce context bundles that include architectural conventions and implicit constraints, not merely file paths or symbol locations. It must register at least three agents on Agentverse, each with a distinct capability surface, with at least one routable via ASI:One as the public entry point and the others reachable as an internal mesh. It must expose its query surface as an OmegaClaw skill that a user can invoke through OmegaClaw without direct knowledge of the underlying agents. It must expose its query surface as an MCP server consumable by Claude Code, Devin, and Cursor without modification.

### 2.2 Non-Goals

The system does not generate code. It is a retrieval and context-assembly layer; code generation is the consumer's responsibility. The system does not perform formal verification of extracted invariants. Layer Four invariants are advisory hints with confidence scores, not provable specifications. The system does not modify the indexed repository. All operations are read-only with the exception of writes to its own index store. The system does not require runtime telemetry from the indexed repository's deployment. Telemetry is an optional input that improves ranking when available; absence of it does not block any feature.

## 3. Architecture

### 3.1 Component Overview

The system has six components: the Indexer, the Index Store, the Query Engine, the Protocol Adapters, the Visualization Frontend, and the Demo Harness.

The Indexer ingests a repository and produces the four-layer index. It is invoked once per repository at registration time and incrementally on file changes thereafter. The Index Store persists the index in MongoDB as a set of collections inside a single database (default name `cartographer`); a Mongo `$text` index over symbol names and signatures replaces the FTS5 lookup, and embeddings are stored as `BinData` documents in a dedicated collection. Every document carries a `repo_hash` field so a single database can serve multiple repositories. The Query Engine accepts structured queries and returns context bundles, combining lookups across all four layers. The Protocol Adapters expose the Query Engine over three transports: a uAgent registered on Agentverse, an OmegaClaw skill, and an MCP server. The Visualization Frontend is a Next.js web application that consumes graph snapshots and live indexing events from the backend, rendering the four layers as interactive views so a human operator can inspect what the agents discovered. The Demo Harness drives the head-to-head comparison against a baseline coding agent for the demo.

### 3.2 Data Flow

A repository is registered with Cartographer by passing its path to the Indexer. The Indexer walks the file tree, parses each source file with tree-sitter, and produces Layer One (symbols and references) directly. It then runs a forward-flow walker over Layer One to produce Layer Two (data flows). It clusters files structurally and runs an LLM annotation pass per cluster to produce Layer Three (architectural roles and conventions). It runs a per-symbol invariant extraction pass against tests, defensive checks, and comments to produce Layer Four (implicit constraints). The result is written to the Index Store. As each layer completes, the Indexer emits progress events on a server-sent-events channel that the Visualization Frontend subscribes to, so the operator sees the graph populate in real time rather than after a single batch completion.

A query arrives at one of the Protocol Adapters and is normalized into the Query Engine's structured request format. The engine resolves the query across the four layers, applies ranking, and returns a context bundle. The bundle is serialized into the protocol-appropriate response shape. When an Agentverse agent answers a query during the demo, the same bundle is forwarded to the Visualization Frontend over the live channel, where the touched symbols, flows, and clusters are highlighted on top of the static graph so judges can see exactly what the agent retrieved.

## 4. The Four Layers

### 4.1 Layer One: Symbol Graph

Layer One stores every named entity in the source — functions, classes, methods, types, module-level variables — with location, signature, and references. Edges capture call relationships, import relationships, and inheritance.

The construction pipeline parses each source file with tree-sitter using language-specific grammars. A symbol extractor walks the resulting concrete syntax tree, emitting symbol records keyed by qualified name. A reference resolver runs a second pass, resolving identifiers in expression positions against the symbol table, with import paths resolved through the language's module system. Cross-file resolution for the hackathon scope handles only static imports; dynamic imports are out of scope.

Storage uses three MongoDB collections: `symbols` (`repo_hash`, qualified name, file path, line range, kind, signature) with a compound unique index on `(repo_hash, qualified_name, file_path, line_start)` and a `$text` index over `(qualified_name, signature)` to replace FTS5; `refs` (`repo_hash`, source symbol ObjectId, target symbol ObjectId, edge kind) with indexes on `(repo_hash, source_symbol_id)` and `(repo_hash, target_symbol_id)`; and `symbol_embeddings` (`repo_hash`, `symbol_id` ObjectId, `vector` `BinData`) with a unique index on `symbol_id`. Symbol IDs are MongoDB `ObjectId` values, stringified at the API boundary so the wire format remains stable.

### 4.2 Layer Two: Data-Flow Graph

Layer Two stores how specific values move through the program. A flow record captures source symbol, sink symbol, the chain of intermediate symbols, and the kind of flow (parameter passing, return value, field assignment).

The construction pipeline runs a forward-flow walker over Layer One's call graph. For each function, the walker produces an intra-procedural summary describing how each parameter is used and what each return value is composed of. Inter-procedural propagation chains these summaries across calls up to a configurable depth (default three). The analysis is sound but imprecise — it does not track aliasing through complex object mutation, and it conservatively assumes that any mutation of a passed object propagates to all references.

Storage uses one MongoDB collection: `flows` (`repo_hash`, source symbol ObjectId, sink symbol ObjectId, `path` array of intermediate symbol ObjectIds, flow kind, sensitivity tag). The intermediate path is stored as an embedded array, eliminating the previous `flow_paths` join table. Sensitivity tags are heuristic — symbols whose names match patterns like `password`, `token`, `ssn` are tagged at extraction time and the tag propagates along flows.

### 4.3 Layer Three: Architectural-Pattern Layer

Layer Three stores what each cluster of files is for and what conventions govern it. A cluster record captures member files, an inferred role description, naming conventions, allowed dependencies, forbidden dependencies, and characteristic code shape.

The construction pipeline clusters files using four signals: directory structure (files in the same directory tend to share role), naming convention (files matching the same suffix pattern), import pattern (files that import the same set of internal modules), and structural similarity of their syntax trees. The clustering uses agglomerative hierarchical clustering with a learned distance threshold; for the hackathon, the threshold is hardcoded based on inspection of two reference repositories.

For each cluster, an LLM annotation pass receives a sample of files (up to five, chosen by structural-centrality weight) and produces a structured description through a constrained-generation prompt. The output schema requires the LLM to produce: the cluster's role in one sentence, its naming convention as a regex or glob, its allowed and forbidden dependencies (referenced by other cluster ids), and three to five characteristic code shape patterns observed in the sample.

Storage uses three MongoDB collections: `clusters` (`repo_hash`, `_id` ObjectId, role description, naming convention, code shape), `cluster_dependencies` (`repo_hash`, source cluster ObjectId, target cluster ObjectId, kind: allowed or forbidden), and `files` (`repo_hash`, file path, cluster ObjectId, last_modified) with a compound unique index on `(repo_hash, file_path)`. Symbols join to their cluster transitively through `symbols.file_path → files.file_path → files.cluster_id`.

### 4.4 Layer Four: Implicit-Constraint Layer

Layer Four stores invariants that code assumes but does not enforce in types. An invariant record captures the symbol it applies to, the invariant text, the source of the inference (test, defensive check, or comment), the line range it was inferred from, and a confidence score.

The construction pipeline mines three sources. First, test files are parsed and assertions within them are mapped back to the production symbol they exercise; the assertion's condition becomes a candidate invariant about that symbol's behavior. Second, defensive checks within function bodies (early returns on falsy inputs, raise statements with specific conditions, asserts) are mapped to invariants about the function's preconditions. Third, comments and error messages within a configurable line distance of risky code are passed to an LLM with a prompt asking what invariant the surrounding code is enforcing.

Each candidate invariant is passed through a validation step that checks it for syntactic well-formedness and removes obvious LLM hallucinations (invariants that reference symbols not in Layer One are rejected). Surviving invariants are stored with a confidence score derived from the source: assertions in tests yield high confidence; defensive checks yield medium confidence; comment-derived inferences yield low confidence.

Storage uses one MongoDB collection: `invariants` (`repo_hash`, target symbol ObjectId, invariant text, source kind, source location, confidence score, extraction timestamp), indexed on `(repo_hash, target_symbol_id)`.

## 5. Query Engine

### 5.1 Query Types

The Query Engine accepts five query types, each mapped to a distinct combination of layer lookups.

A `find_relevant_context` query takes a natural-language task description and returns a ranked list of files with conventions and invariants attached. It is the primary entry point for coding agents.

A `trace_data_flow` query takes a starting symbol and a direction (forward or backward) and returns the flow paths Layer Two has recorded.

A `find_invariants` query takes a symbol or a region (cluster id) and returns Layer Four invariants attached to it.

A `describe_architecture` query takes a path or a cluster id and returns the Layer Three role description, conventions, and dependency rules.

A `find_exemplars` query takes a task description and a target cluster and returns the files within that cluster that best match the task, intended as templates for new code.

### 5.2 Query Resolution

For `find_relevant_context`, the engine first decomposes the query using a small LLM call into a structured form: task type (add new code, modify existing, understand), topic keywords, and constraints. It then performs a hybrid retrieval over Layer One: embedding similarity against the `symbol_embeddings` collection (cosine computed in app code) and a Mongo `$text` lexical match against symbol names and signatures. The candidate set is filtered by Layer Three to identify the architectural region the task concerns. Files within that region are ranked using the weight combiner (Section 6). For each retained file, Layer Four invariants attached to its symbols are included in the response. The Layer Three convention manifest for the file's cluster is included once.

For other query types, resolution is direct: the engine queries the relevant tables and returns results. No LLM call is required for these, which keeps them low-latency.

### 5.3 Response Format

A context bundle is a JSON object with five keys. `region` describes the architectural cluster the response targets, including its role, conventions, and dependency rules. `exemplars` is an ordered list of files within the region that should be modeled, each annotated with the reason it was selected. `relevant_symbols` is a list of symbols across the region with their signatures, locations, and any attached invariants. `flows` lists data flows that touch the relevant symbols, included only when the task type implies their relevance. `notes` is a free-text section reserved for warnings, such as low-confidence invariants the agent should treat with caution.

## 6. Ranking and Weights

The Query Engine combines five signals when ranking candidate files. Structural centrality is computed as PageRank over the Layer One call graph, with a damping cap that demotes nodes whose centrality exceeds a threshold (this prevents framework-noise nodes like base classes from dominating every query). Change recency is days since last modification, normalized by repository age. Co-change correlation is the count of commits in which each candidate file changed alongside the seed file (or, for queries without a seed file, the test files that touch the candidate). Embedding similarity is cosine similarity between the query's embedding and the candidate symbol's embedding. Test coverage proxy is the count of test files that import the candidate.

The combiner is a weighted sum whose coefficients depend on query type. For `add new code`, co-change correlation and recency dominate. For `modify existing`, structural centrality and embedding similarity dominate. For `understand`, embedding similarity dominates. The coefficients are stored in a configuration file rather than hardcoded, to permit tuning during the hackathon without code changes.

Weights are stored separately, never collapsed into a single composite. Each candidate retains all five signal values in the result set so that a downstream consumer can re-rank if its needs differ.

## 7. Protocol Adapters

### 7.1 MCP Server

The MCP server exposes five tools, one per query type. Each tool's input schema corresponds directly to the Query Engine's request format; each tool's output is the JSON context bundle. The server is implemented in Python using the official MCP SDK and runs as a long-lived process. Authentication is by shared secret for the hackathon; production deployment would use OAuth.

### 7.2 Agentverse Agents

#### 7.2.1 Topology

Cartographer registers a mesh of six uAgents on Agentverse. One agent — the Coordinator — is the only public entry point and is the sole agent surfaced to ASI:One as a routable skill. The other five are internal specialists that the Coordinator dispatches to over the Chat Protocol; they are registered with `mailbox=True` so they are reachable without public IPs but their manifests omit the ASI:One discoverability flag so a generic prompt does not bypass the Coordinator. Splitting the mesh this way demonstrates the Agentverse multi-agent pattern while keeping one stable address for external callers.

Every agent runs as a long-lived Python process started from `backend/agents/`. Each derives its address deterministically from a seed phrase stored in `.env.local` (`COORDINATOR_SEED`, `INDEXER_SEED`, etc.) so addresses are stable across restarts and registration is idempotent. Internal messages use a shared protocol module (`backend/agents/protocols.py`) so message schemas evolve in one place.

#### 7.2.2 The Six Agents

**Coordinator.** Receives natural-language queries from ASI:One, the OmegaClaw skill, and the FastAPI `/api/agentverse/` route. Decomposes the query into the Query Engine's structured form using a single small LLM call, decides which specialists to invoke (often more than one in parallel), aggregates their replies into a context bundle, and returns the bundle to the caller. Owns no index data of its own — it is purely a dispatcher and aggregator. Emits `region_highlighted` events on the SSE channel as specialist replies arrive so the Visualization Frontend can flash the touched symbols in real time.

**Indexer.** Receives an `IndexRepo` message containing a repository URL or local path. Walks the file tree, runs tree-sitter, and writes Layer One symbols, Layer Two flows, Layer Three clusters, and Layer Four invariants to the MongoDB index store. Emits `IndexProgress` messages as each layer completes; the Coordinator forwards these to the SSE channel. The Indexer is the only agent that writes to the index store; all other specialists are read-only. Long-running by design — an `IndexRepo` reply is sent once when indexing finishes, with intermediate progress streamed.

**Symbol Analyst.** Handles the Layer One retrieval-and-ranking subtask of `find_relevant_context` and any direct symbol-lookup queries. Receives a `SymbolQuery` (task description plus optional seed symbol and optional cluster-id scope from the Architecture Analyst), runs the hybrid embedding-plus-`$text` retrieval over Layer One described in §5.2, applies the ranking weight combiner from §6, and returns a `SymbolGraph` (ranked symbols with signatures, locations, and the five raw signal values). Holds no LLM — its work is pure retrieval and ranking, which keeps it under the §9.2 latency budget for direct queries.

**Architecture Analyst.** Handles `describe_architecture` and `find_exemplars`. Receives an `ArchQuery` (path or cluster id), looks up the Layer Three cluster record, and returns an `ArchGraph` containing the role description, naming convention, allowed/forbidden dependencies, and characteristic code shapes. For `find_exemplars`, ranks cluster members by structural-centrality weight against the task description and returns the top three to five.

**Flow Analyst.** Handles `trace_data_flow`. Receives a `FlowQuery` (seed symbol plus direction and depth) and returns a `FlowGraph` containing the flow paths Layer Two recorded, including sensitivity tags. Bounded by the depth parameter to keep response payloads small even for highly connected symbols.

**Invariant Reporter.** Handles `find_invariants`. Receives an `InvariantQuery` (target symbol or cluster id) and returns the Layer Four invariants attached to it, each with source kind, source location, and confidence score. Filters out invariants below a configurable confidence threshold by default; the threshold is overridable in the request for callers that want raw output.

#### 7.2.3 Dispatch Policy

The Coordinator's decomposition step classifies the incoming query into one of the five Query Engine types from §5.1 and selects specialists accordingly. `find_relevant_context` runs as a two-stage pipeline that mirrors §5.2: the Coordinator first asks the Architecture Analyst to identify the relevant cluster from the decomposed task, then dispatches the Symbol Analyst with that cluster as a scope filter, then enriches the ranked symbols with a parallel Invariant Reporter call keyed on the returned symbol set. The Coordinator assembles the context bundle defined in §5.3 from the three replies. `trace_data_flow` goes to the Flow Analyst alone. `find_invariants` goes to the Invariant Reporter alone. `describe_architecture` and `find_exemplars` go to the Architecture Analyst alone. New repository registrations go to the Indexer; the Coordinator returns immediately with a job id and forwards `IndexProgress` events to the SSE channel.

#### 7.2.4 Manifests and Discovery

Each agent's Agentverse manifest declares its name, a one-paragraph capability description, and the input message schema. The Coordinator's manifest additionally declares the keywords `code`, `repository`, `codebase`, `architecture`, `convention`, and `invariant` so ASI:One routes code-related prompts to it. Specialist manifests declare narrower keywords matching their domain (`flow`, `data flow`, `taint` for the Flow Analyst, etc.) but mark themselves as internal-only via a `discoverable: false` flag the Coordinator respects when introspecting the registry. This produces the visible-on-the-marketplace Coordinator while keeping the internal mesh navigable to operators inspecting Agentverse directly.

#### 7.2.5 Hackathon Scope Reduction

If time pressure forces a reduction, the mesh collapses cleanly. The minimum viable agent set is Coordinator plus Symbol Analyst plus Indexer — three registered agents, satisfying §2.1's "at least three agents on Agentverse" goal, with the Coordinator as the ASI:One-routable entry point. Architecture Analyst, Flow Analyst, and Invariant Reporter can be folded into the Coordinator as in-process function calls without changing the external API surface, since the Coordinator already owns aggregation. Agents are split out only as their specialist logic stabilizes; the boundary between "Coordinator method" and "separate agent" is a deployment decision, not an architectural one.

### 7.3 OmegaClaw Skill

The OmegaClaw skill wraps the Cartographer Coordinator agent. When OmegaClaw receives a user query about a codebase, the skill invokes the Coordinator via Agentverse, formats the response into OmegaClaw's expected output shape, and returns it. The skill is registered with the keywords `code`, `repository`, `codebase`, `architecture`, and `convention` to ensure it is selected for code-related intents.

## 8. Visualization Frontend

### 8.1 Purpose

The Visualization Frontend turns Cartographer's index from an opaque database into something a human can see. It serves three audiences simultaneously: the operator who needs to verify that the index captured the repository correctly, the judge who needs to see what the agents are doing in real time during the demo, and the coding-agent user who wants a second display showing why a particular context bundle was chosen. Without the frontend the system is a black box that emits JSON; with it, the four layers become a navigable map of the codebase.

### 8.2 Architecture

The frontend is a Next.js application that sits alongside the backend services and communicates with them over two channels. A REST channel proxied through `/api/*` to the FastAPI gateway is used for one-shot reads (loading a saved index, fetching a context bundle by id, listing registered repositories). A server-sent-events channel at `/api/stream` is used for live updates: indexing progress, layer completion, and agent-query echoes. The frontend holds the current graph in a client-side store keyed by repository hash, hydrating from REST on first load and applying SSE deltas thereafter.

The backend exposes a thin Graph API distinct from the Query Engine's bundle API. Where the Query Engine returns task-scoped context bundles, the Graph API returns whole-repository projections suitable for visualization: the symbol graph for a cluster, the data flows that touch a chosen symbol, the cluster dependency map, and the invariants attached to a region. These projections are produced by the same Query Engine but with a fixed set of visualization-oriented endpoints rather than ad-hoc queries.

### 8.3 Data Contract

The frontend consumes a stable graph schema regardless of which layer is being rendered. Every node carries an id, a kind tag (`symbol`, `cluster`, `flow_node`, `invariant`), a label, a layer attribution, and a free-form metadata payload that the renderer treats as opaque. Every edge carries a source id, a target id, an edge kind, and a weight used for visual emphasis. Layer Three clusters are returned as nodes whose metadata includes the convention manifest so a click on a cluster opens its rules without a second round trip. Layer Four invariants are returned as nodes attached to their target symbol with an edge of kind `constrains`; this lets the same renderer show invariants without a special case.

Live events use the same schema with a wrapper indicating event type (`node_added`, `node_updated`, `edge_added`, `region_highlighted`). The frontend applies them as deltas against the in-memory graph. A `region_highlighted` event carries a list of node ids and a transient color tag that fades after a configurable duration, used during agent demos to flash the symbols a context bundle just touched.

### 8.4 Views

Four views share the graph store and switch between layers with a tab control. The Symbol View renders Layer One as a force-directed graph with symbols as nodes and call/import edges. The Flow View renders Layer Two as a horizontal Sankey-style diagram from sources to sinks, with sensitivity tags coloring sensitive flows. The Architecture View renders Layer Three as a cluster diagram where each cluster is a labeled box containing its member files and arrows show allowed-versus-forbidden inter-cluster dependencies; clicking a cluster opens its convention manifest in a side panel. The Invariant View renders Layer Four as a list grouped by target symbol, with each invariant showing its source kind and confidence; clicking an invariant scrolls to and highlights the source code region it was inferred from.

A fifth panel, the Agent Activity Log, runs persistently on the right edge of the screen during demos. It lists each query the Agentverse agents receive, the cluster that query resolved into, and the symbols that ended up in the response bundle. Each log entry doubles as a button that replays the highlight on the active view.

### 8.5 Rendering

Graph rendering uses Cytoscape.js for the symbol and architecture views and a custom SVG layer for the flow Sankey. Cytoscape was chosen over heavier libraries (Sigma.js, react-flow) because it handles ten-thousand-node graphs with built-in incremental layouts, which matches Cartographer's expected upper bound for a fifty-thousand-line repository. Layouts are precomputed server-side for the initial paint and refined client-side as the user zooms; this keeps first-paint latency under one second even for the largest indexes the demo targets.

### 8.6 Authentication and Multi-Repo

The frontend uses the same hardcoded-user JWT scheme inherited from the existing scaffold, sufficient for the hackathon. A repository selector in the header switches between indexed repositories; the backend keys all API responses by repository hash, so multi-repo support is implicit once the selector is wired. The selector also surfaces indexing status (`pending`, `indexing`, `ready`, `stale`) so the operator knows whether a query will hit a complete index.

## 9. Storage and Performance

### 9.1 Storage

A single MongoDB database `cartographer` (overridable via `MONGODB_DB_NAME`) holds all four layers across all indexed repositories, with every document keyed by `repo_hash`. The connection string comes from `MONGODB_URI` (default `mongodb://localhost:27017`). Embeddings use a 384-dimensional model (`all-MiniLM-L6-v2`) stored as `BinData`; cosine similarity is computed in application code (no Atlas Vector Search dependency for the hackathon).

### 9.2 Performance Targets

Indexing a fifty-thousand-line repository must complete in under ten minutes on a developer laptop. Query latency for `find_relevant_context` must be under three seconds at the 95th percentile, including the LLM decomposition call. Query latency for the four direct query types must be under two hundred milliseconds at the 95th percentile. The Visualization Frontend's first meaningful paint must be under one second after a repository is selected, with subsequent layer toggles under two hundred milliseconds.

## 10. Languages and Scope

For the hackathon build, two languages are supported: Python and TypeScript. These are chosen because their static import systems make Layer One reliable and because they are the most common in modern codebases. Adding further languages is a matter of installing the relevant tree-sitter grammar and writing a symbol extractor that targets it; the rest of the pipeline is language-agnostic.

Repository size is targeted at fifty thousand lines of code. Larger repositories work but indexing time scales roughly linearly. Repositories below five thousand lines are not interesting for the demo because brute-force exploration is fast enough that Cartographer's value does not show.

## 11. Demo Plan

The demo is structured as a head-to-head comparison. A real open-source repository (target: a fifty-thousand-line Python or TypeScript project chosen during prep) is indexed by Cartographer in advance. Two coding-agent runs are then performed live or pre-recorded: Claude Code with no Cartographer access, and Claude Code with the Cartographer MCP server connected. Both are given the same task, chosen for architectural depth — for instance, "add request rate limiting to all public API endpoints, following the existing middleware conventions."

The judges see four metrics displayed: total tokens consumed, time to first edit, number of files read, and whether the resulting PR follows the repository's conventions. The Cartographer-enabled run is expected to win on all four. The closing slide shows the same metrics on a panel of five tasks, not just the live one, to demonstrate the result is not cherry-picked.

The Visualization Frontend runs on a second screen throughout the demo. As the Cartographer-enabled coding agent issues queries, the frontend highlights the touched clusters and symbols in real time, giving judges a visual narrative for what the agent is "seeing" that the baseline run cannot see. The Agent Activity Log captures every query for retrospective review.

## 12. Risks and Mitigations

Layer Three's LLM annotations are noisy and may produce misleading cluster descriptions. Mitigation: every Layer Three description carries a confidence score and a reference to the source files it was inferred from; the response includes this provenance so the consuming agent can discount low-confidence guidance.

Cross-language import resolution at Layer One is fragile, particularly for TypeScript with complex module configurations. Mitigation: the demo repository is selected during prep specifically for clean static imports; the index gracefully degrades to file-local symbol resolution when cross-file resolution fails.

Judges may conflate Cartographer with existing tools (Aider, Codebase-Memory, Graphify, Sourcegraph). Mitigation: the pitch leads with Layer Four (implicit constraints) as the primary contribution, since invariant inference has not been packaged for coding-agent consumption in any surveyed prior work, and treats Layers One through Three as supporting infrastructure.

Indexing time may exceed the demo window if a repository is chosen poorly. Mitigation: indexes are pre-built; the live demo only runs queries against a prepared index.

## 13. Implementation Plan

The build is divided into four roughly equal time slices for a forty-eight-hour hackathon.

**Hours 0-12:** Layer One end-to-end on Python only. Tree-sitter integration, symbol extractor, reference resolver, MongoDB collection bootstrap, and basic `$text` retrieval queries. The MCP server exposes `find_relevant_context` against Layer One only. The Visualization Frontend's Symbol View renders a static Layer One graph for the indexed repository, hydrated from a single REST call. This is the minimum viable product — it should already be useful at this point.

**Hours 12-24:** Layer Three. Clustering, LLM annotation, convention manifests. Add TypeScript support to Layer One. Wire the ranking weight combiner. The MCP server gains `describe_architecture` and `find_exemplars`. The frontend gains the Architecture View and the convention side panel; the SSE channel is wired so indexing progress streams live.

**Hours 24-36:** Layer Four. Test-derived and defensive-check-derived invariants first; comment-derived invariants if time allows. The MCP server gains `find_invariants`. Layer Two is implemented as a forward-flow walker without sensitivity tracking, providing `trace_data_flow`. The frontend gains the Flow View and Invariant View; the Agent Activity Log is scaffolded against mocked agent traffic.

**Hours 36-48:** Agentverse registration, OmegaClaw skill, demo harness, head-to-head metric collection, slide deck, and rehearsal. The Agent Activity Log is wired to real Agentverse agent traffic via the SSE channel, and `region_highlighted` events are tested end-to-end on the demo task.

## 14. Success Criteria

The submission is successful if it demonstrates the following on demo day. A live or pre-recorded head-to-head shows at least 5x token reduction on the chosen task. At least three Agentverse agents are registered, with the Coordinator discoverable and routable via ASI:One and the specialist agents reachable through the internal mesh. The OmegaClaw skill is invokable and returns a Cartographer response. The MCP server is connected to a coding agent during the demo and visibly used. At least one invariant from Layer Four appears in a context bundle and is shown to influence the coding agent's output. The Visualization Frontend renders all four layers for the demo repository and reflects at least one live agent query in real time during the head-to-head, with the highlighted region matching the symbols the agent's response cited.

---

## Summary

This specification defines Codebase Cartographer as a four-layer semantic index over source repositories, exposed through three protocols to satisfy the Agentverse, OmegaClaw, and Cognition tracks simultaneously. The architecture decomposes into an Indexer, an Index Store in MongoDB, a Query Engine, three Protocol Adapters, a Visualization Frontend, and a Demo Harness. The four layers — symbol graph, data-flow graph, architectural-pattern layer, and implicit-constraint layer — each have defined storage schemas, construction pipelines, and query semantics. The Visualization Frontend turns the index into an interactive map and, during demos, mirrors the Agentverse agents' query activity in real time. The implementation plan fits into a forty-eight-hour window with Layer One as the minimum viable product, Layer Three as the architectural-awareness contribution, and Layer Four as the novelty headline. Success is measured by a head-to-head token-consumption comparison against a baseline coding agent on a real open-source repository, with the frontend providing the visual narrative that distinguishes the Cartographer-enabled run from the baseline.
