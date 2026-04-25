import axios from 'axios';

const client = axios.create({ baseURL: '' });

function isMock() {
  if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_MOCK === '1') return true;
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage && window.localStorage.MOCK === '1') return true;
    } catch (_) {}
  }
  return false;
}

async function loadFixture(name) {
  // dynamic import keeps fixtures out of the production bundle when MOCK is off
  switch (name) {
    case 'repos':
      return (await import('./__mocks__/repos.json')).default;
    case 'graph_symbol':
      return (await import('./__mocks__/graph_symbol.json')).default;
    case 'graph_architecture':
      return (await import('./__mocks__/graph_architecture.json')).default;
    case 'graph_flow':
      return (await import('./__mocks__/graph_flow.json')).default;
    case 'graph_invariant':
      return (await import('./__mocks__/graph_invariant.json')).default;
    case 'context_bundle':
      return (await import('./__mocks__/context_bundle.json')).default;
    case 'index_status':
      return (await import('./__mocks__/index_status.json')).default;
    default:
      throw new Error(`unknown fixture: ${name}`);
  }
}

export async function listRepos() {
  if (isMock()) return loadFixture('repos');
  const r = await client.get('/api/repos/');
  return r.data;
}

export async function createRepo(body) {
  if (isMock()) {
    const repos = await loadFixture('repos');
    const hash = 'mock' + Math.random().toString(36).slice(2, 8);
    return {
      hash,
      name: body.name || 'mock-repo',
      status: 'pending',
      git_url: body.git_url,
      local_path: body.local_path,
    };
  }
  const r = await client.post('/api/repos/', body);
  return r.data;
}

export async function getRepo(hash) {
  if (isMock()) {
    const repos = await loadFixture('repos');
    return repos.find((r) => r.hash === hash) || repos[0];
  }
  const r = await client.get(`/api/repos/${hash}`);
  return r.data;
}

export async function triggerIndex(hash) {
  if (isMock()) return { job_id: 'mock-job', repo_hash: hash, status: 'running' };
  const r = await client.post(`/api/repos/${hash}/index`);
  return r.data;
}

export async function getIndexStatus(hash) {
  if (isMock()) return loadFixture('index_status');
  const r = await client.get(`/api/repos/${hash}/index`);
  return r.data;
}

export async function getGraph(hash, layer) {
  if (isMock()) return loadFixture(`graph_${layer}`);
  const r = await client.get(`/api/repos/${hash}/graph/${layer}`);
  return r.data;
}

export async function findRelevantContext(body) {
  if (isMock()) return loadFixture('context_bundle');
  const r = await client.post('/api/query/find_relevant_context', body);
  return r.data;
}

export async function traceDataFlow({ symbol, direction = 'forward', depth = 3, repo_hash }) {
  if (isMock()) return { flows: [] };
  const r = await client.post('/api/query/trace_data_flow', {
    symbol,
    direction,
    depth,
    repo_hash,
  });
  return r.data;
}

export async function findInvariants({ symbol, cluster_id, min_confidence = 0.0, repo_hash }) {
  if (isMock()) return [];
  const body = { min_confidence, repo_hash };
  if (symbol) body.symbol = symbol;
  if (cluster_id != null && cluster_id !== '') body.cluster_id = cluster_id;
  const r = await client.post('/api/query/find_invariants', body);
  return r.data;
}

export async function describeArchitecture({ path, cluster_id, repo_hash }) {
  if (isMock()) return { cluster: null, member_files: [] };
  const body = { repo_hash };
  if (path) body.path = path;
  if (cluster_id != null && cluster_id !== '') body.cluster_id = cluster_id;
  const r = await client.post('/api/query/describe_architecture', body);
  return r.data;
}

export async function findExemplars({ task, cluster_id, repo_hash }) {
  if (isMock()) return { files: [] };
  const r = await client.post('/api/query/find_exemplars', {
    task,
    cluster_id,
    repo_hash,
  });
  return r.data;
}

export default {
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
};
