// TypeScript mirrors of the backend Pydantic models in backend/models.py.
// Keep these in lockstep with the Python definitions — any drift will surface
// as a type error at the call site rather than a silent runtime mismatch.

export type RepoStatus = 'pending' | 'indexing' | 'ready' | 'stale';
export type LayerName = 'symbol' | 'flow' | 'architecture' | 'invariant';
export type LayerState = 'pending' | 'running' | 'done' | 'error';

export interface RepoSummary {
  hash: string;
  name: string;
  status: RepoStatus;
  git_url: string | null;
  local_path: string | null;
}

export interface RepoCreate {
  git_url?: string;
  local_path?: string;
  name?: string;
}

export interface IndexJob {
  job_id: string;
  repo_hash: string;
  status: string;
}

export interface LayerStatus {
  state: LayerState;
  count: number;
  started_at: string | null;
  ended_at: string | null;
}

export interface IndexStatus {
  repo_hash: string;
  layers: Record<LayerName, LayerStatus>;
}

// ---------------------------------------------------------------------------
// Context bundle (response from find_relevant_context + find_exemplars)
// ---------------------------------------------------------------------------

export interface Region {
  cluster_id: string | null;
  role: string;
  conventions: Record<string, unknown>;
  dependencies: Record<string, string[]>;
}

export interface RankedSymbol {
  qualified_name: string;
  file_path: string;
  line_start: number;
  line_end: number;
  signature: string;
  kind: string;
  invariants: Array<Record<string, unknown>>;
  signals: Record<string, number>;
}

export interface Exemplar {
  file_path: string;
  reason: string;
}

export interface FlowPath {
  source_symbol: string;
  sink_symbol: string;
  path: string[];
  flow_kind: string;
  sensitivity: string | null;
}

export interface Invariant {
  target_symbol: string;
  text: string;
  source_kind: 'test' | 'defensive' | 'comment';
  source_location: string;
  confidence: number;
}

export interface ContextBundle {
  region: Region;
  exemplars: Exemplar[];
  relevant_symbols: RankedSymbol[];
  flows: FlowPath[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Query Engine request shapes
// ---------------------------------------------------------------------------

export type QueryType =
  | 'find_relevant_context'
  | 'trace_data_flow'
  | 'find_invariants'
  | 'describe_architecture'
  | 'find_exemplars';

export interface FindContextRequest {
  task: string;
  seed_symbol?: string;
  repo_hash: string;
}

export interface FlowRequest {
  symbol: string;
  direction?: 'forward' | 'backward';
  depth?: number;
  repo_hash: string;
}

export interface InvariantRequest {
  symbol?: string;
  cluster_id?: string;
  min_confidence?: number;
  repo_hash: string;
}

export interface ArchRequest {
  path?: string;
  cluster_id?: string;
  repo_hash: string;
}

export interface ArchResponse {
  cluster: Region;
  member_files: string[];
}

export interface ExemplarRequest {
  task: string;
  cluster_id: string;
  repo_hash: string;
}

export interface ExemplarResponse {
  files: Exemplar[];
}

export interface DispatchRequest {
  query_type: QueryType;
  repo_hash: string;
  task?: string;
  seed_symbol?: string;
  symbol?: string;
  direction?: 'forward' | 'backward';
  depth?: number;
  cluster_id?: string;
  path?: string;
  min_confidence?: number;
}

export interface DispatchResponse {
  query_type: QueryType;
  result: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Graph projection (visualization endpoints)
// ---------------------------------------------------------------------------

export interface GraphNodeWire {
  id: string;
  kind: string;
  label: string;
  layer: number;
  metadata: Record<string, unknown>;
}

export interface GraphEdgeWire {
  source: string;
  target: string;
  kind: string;
  weight: number;
}

export interface GraphProjection {
  nodes: GraphNodeWire[];
  edges: GraphEdgeWire[];
}

// ---------------------------------------------------------------------------
// SSE events (matches backend/routes/stream.py emissions)
// ---------------------------------------------------------------------------

export type SseEventType =
  | 'index_progress'
  | 'node_added'
  | 'node_updated'
  | 'edge_added'
  | 'region_highlighted'
  | 'agent_activity';

export interface SseEvent<T = Record<string, unknown>> {
  type: SseEventType;
  payload: T;
}
