// Typed HTTP client for the Cartographer backend.
//
// All routes are reached through Next's /api/* rewrite to localhost:4000
// (see frontend/next.config.js). Auth is the cookie-based JWT issued by
// POST /api/auth/login; ``withCredentials: true`` ensures the cookie is
// sent on every subsequent call.

import axios from 'axios';
import type {
  ArchRequest,
  ArchResponse,
  ContextBundle,
  DispatchRequest,
  DispatchResponse,
  ExemplarRequest,
  ExemplarResponse,
  FindContextRequest,
  FlowRequest,
  GraphProjection,
  IndexJob,
  IndexStatus,
  Invariant,
  InvariantRequest,
  LayerName,
  RepoCreate,
  RepoSummary,
} from './types';

export const apiClient = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<{ message: string }> {
  const res = await apiClient.post('/api/auth/login', { email, password });
  return res.data;
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

export async function listRepos(): Promise<RepoSummary[]> {
  const res = await apiClient.get('/api/repos');
  return res.data;
}

export async function createRepo(body: RepoCreate): Promise<RepoSummary> {
  const res = await apiClient.post('/api/repos', body);
  return res.data;
}

/**
 * Upload a folder picked via ``<input webkitdirectory>``. Each File's
 * ``webkitRelativePath`` is preserved as the ``filename`` so the backend can
 * reconstruct the directory tree under the workspace root.
 */
export async function uploadRepo(name: string, files: File[]): Promise<RepoSummary> {
  const fd = new FormData();
  fd.append('name', name);
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    fd.append('files', f, rel);
  }
  // Don't set Content-Type — the browser/axios infers ``multipart/form-data;
  // boundary=...`` from the FormData body. Overriding it strips the boundary
  // and the backend can't parse the payload. ``maxBodyLength`` / ``maxContentLength``
  // overrides axios's 10MB default for repo-sized uploads.
  const res = await apiClient.post('/api/repos/upload', fd, {
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return res.data;
}

export async function getRepo(hash: string): Promise<RepoSummary> {
  const res = await apiClient.get(`/api/repos/${hash}`);
  return res.data;
}

/** Wipe a repo's index store. Backend returns 204; the on-disk source tree is
 *  not touched — only Cartographer's Mongo rows. */
export async function deleteRepo(hash: string): Promise<void> {
  await apiClient.delete(`/api/repos/${hash}`);
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

export async function triggerIndex(hash: string): Promise<IndexJob> {
  const res = await apiClient.post(`/api/repos/${hash}/index`);
  return res.data;
}

export async function getIndexStatus(hash: string): Promise<IndexStatus> {
  const res = await apiClient.get(`/api/repos/${hash}/index`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Graph projections (visualization)
// ---------------------------------------------------------------------------

export async function getGraph(hash: string, layer: LayerName): Promise<GraphProjection> {
  const res = await apiClient.get(`/api/repos/${hash}/graph/${layer}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Query Engine — the five query types + the unified dispatcher
// ---------------------------------------------------------------------------

export async function findRelevantContext(req: FindContextRequest): Promise<ContextBundle> {
  const res = await apiClient.post('/api/query/find_relevant_context', req);
  return res.data;
}

export async function traceDataFlow(req: FlowRequest): Promise<{ flows: unknown[] }> {
  const res = await apiClient.post('/api/query/trace_data_flow', {
    direction: 'forward',
    depth: 3,
    ...req,
  });
  return res.data;
}

export async function findInvariants(req: InvariantRequest): Promise<Invariant[]> {
  // Drop undefined optional fields so Pydantic doesn't reject them.
  const body: Record<string, unknown> = { repo_hash: req.repo_hash };
  if (req.symbol) body.symbol = req.symbol;
  if (req.cluster_id) body.cluster_id = req.cluster_id;
  if (req.min_confidence != null) body.min_confidence = req.min_confidence;
  const res = await apiClient.post('/api/query/find_invariants', body);
  return res.data;
}

export async function describeArchitecture(req: ArchRequest): Promise<ArchResponse> {
  const body: Record<string, unknown> = { repo_hash: req.repo_hash };
  if (req.path) body.path = req.path;
  if (req.cluster_id) body.cluster_id = req.cluster_id;
  const res = await apiClient.post('/api/query/describe_architecture', body);
  return res.data;
}

export async function findExemplars(req: ExemplarRequest): Promise<ExemplarResponse> {
  const res = await apiClient.post('/api/query/find_exemplars', req);
  return res.data;
}

export async function dispatchQuery(req: DispatchRequest): Promise<DispatchResponse> {
  const res = await apiClient.post('/api/query/dispatch', req);
  return res.data;
}

// ---------------------------------------------------------------------------
// Convenience: detect whether the current user is authenticated.
//
// There is no GET /api/auth/me endpoint, so we probe a guarded route. A 401
// means the cookie is missing/expired; anything 2xx means we're in.
// ---------------------------------------------------------------------------

export async function isAuthenticated(): Promise<boolean> {
  try {
    await apiClient.get('/api/repos');
    return true;
  } catch {
    return false;
  }
}

const api = {
  login,
  listRepos,
  createRepo,
  getRepo,
  triggerIndex,
  getIndexStatus,
  getGraph,
  findRelevantContext,
  traceDataFlow,
  findInvariants,
  describeArchitecture,
  findExemplars,
  dispatchQuery,
  isAuthenticated,
};

export default api;
