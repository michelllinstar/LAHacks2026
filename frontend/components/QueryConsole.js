import { useState } from 'react';
import useGraphStore from '../lib/graphStore';
import {
  findRelevantContext,
  traceDataFlow,
  findInvariants,
  describeArchitecture,
  findExemplars,
} from '../lib/api';

const QUERY_TYPES = [
  { key: 'find_relevant_context', label: 'Find Relevant Context', color: '#ffb347' },
  { key: 'trace_data_flow', label: 'Trace Data Flow', color: '#ff6b6b' },
  { key: 'find_invariants', label: 'Find Invariants', color: '#fab1a0' },
  { key: 'describe_architecture', label: 'Describe Architecture', color: '#7ed6df' },
  { key: 'find_exemplars', label: 'Find Exemplars', color: '#a29bfe' },
];

export default function QueryConsole({ repoHash }) {
  const [open, setOpen] = useState(true);
  const [queryType, setQueryType] = useState('find_relevant_context');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);
  const pushActivity = useGraphStore((s) => s.pushActivity);

  // Form state per query type
  const [ctxTask, setCtxTask] = useState('');
  const [ctxSeed, setCtxSeed] = useState('');

  const [flowSymbol, setFlowSymbol] = useState('');
  const [flowDirection, setFlowDirection] = useState('forward');
  const [flowDepth, setFlowDepth] = useState(3);

  const [invSymbol, setInvSymbol] = useState('');
  const [invCluster, setInvCluster] = useState('');
  const [invConf, setInvConf] = useState(0.0);

  const [archPath, setArchPath] = useState('');
  const [archCluster, setArchCluster] = useState('');

  const [exTask, setExTask] = useState('');
  const [exCluster, setExCluster] = useState('');

  const switchType = (key) => {
    setQueryType(key);
    setError(null);
    setResult(null);
    setLastRequest(null);
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!repoHash) {
      setError('No repo selected');
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);

    let req;
    let res;
    try {
      if (queryType === 'find_relevant_context') {
        req = { task: ctxTask, repo_hash: repoHash };
        if (ctxSeed) req.seed_symbol = ctxSeed;
        if (!ctxTask.trim()) throw new Error('task is required');
        setLastRequest(req);
        res = await findRelevantContext(req);
        const rankedCount = (res && res.relevant_symbols) ? res.relevant_symbols.length : 0;
        pushActivity(repoHash, {
          query_id: `local-${Date.now()}`,
          query_type: 'find_relevant_context',
          ranked_count: rankedCount,
          region: res && res.region ? res.region : null,
          symbol_ids: (res && res.relevant_symbols ? res.relevant_symbols.map((s) => s.qualified_name) : []),
        });
      } else if (queryType === 'trace_data_flow') {
        if (!flowSymbol.trim()) throw new Error('symbol is required');
        req = {
          symbol: flowSymbol,
          direction: flowDirection,
          depth: Number(flowDepth),
          repo_hash: repoHash,
        };
        setLastRequest(req);
        res = await traceDataFlow(req);
        const flowCount = (res && res.flows) ? res.flows.length : 0;
        pushActivity(repoHash, {
          query_id: `local-${Date.now()}`,
          query_type: 'trace_data_flow',
          seed_symbol: flowSymbol,
          direction: flowDirection,
          depth: Number(flowDepth),
          flow_count: flowCount,
          symbol_ids: [flowSymbol],
        });
      } else if (queryType === 'find_invariants') {
        const symbolOn = !!invSymbol.trim();
        const clusterOn = invCluster !== '';
        if (symbolOn === clusterOn) {
          throw new Error('provide either symbol OR cluster_id (not both, not neither)');
        }
        req = {
          min_confidence: Number(invConf),
          repo_hash: repoHash,
        };
        if (symbolOn) req.symbol = invSymbol;
        if (clusterOn) req.cluster_id = invCluster;
        setLastRequest(req);
        res = await findInvariants(req);
        const invCount = Array.isArray(res) ? res.length : 0;
        const bySource = {};
        if (Array.isArray(res)) {
          res.forEach((inv) => {
            const k = inv.source_kind || 'unknown';
            bySource[k] = (bySource[k] || 0) + 1;
          });
        }
        const targets = Array.isArray(res) ? Array.from(new Set(res.map((i) => i.target_symbol).filter(Boolean))) : [];
        pushActivity(repoHash, {
          query_id: `local-${Date.now()}`,
          query_type: 'find_invariants',
          invariant_count: invCount,
          target_symbol: symbolOn ? invSymbol : undefined,
          cluster_id: clusterOn ? invCluster : undefined,
          target_qnames: targets,
          by_source: bySource,
          symbol_ids: targets,
        });
      } else if (queryType === 'describe_architecture') {
        const pathOn = !!archPath.trim();
        const clusterOn = archCluster !== '';
        if (pathOn === clusterOn) {
          throw new Error('provide either path OR cluster_id (not both, not neither)');
        }
        req = { repo_hash: repoHash };
        if (pathOn) req.path = archPath;
        if (clusterOn) req.cluster_id = archCluster;
        setLastRequest(req);
        res = await describeArchitecture(req);
        const memberFiles = (res && res.member_files) || [];
        const cid = (res && res.cluster && res.cluster.cluster_id) || (clusterOn ? archCluster : undefined);
        pushActivity(repoHash, {
          query_id: `local-${Date.now()}`,
          query_type: 'describe_architecture',
          cluster_id: cid,
          member_files: memberFiles,
          symbol_ids: [],
        });
      } else if (queryType === 'find_exemplars') {
        if (!exTask.trim()) throw new Error('task is required');
        if (exCluster === '') throw new Error('cluster_id is required');
        req = {
          task: exTask,
          cluster_id: exCluster,
          repo_hash: repoHash,
        };
        setLastRequest(req);
        res = await findExemplars(req);
        const files = (res && res.files) || [];
        pushActivity(repoHash, {
          query_id: `local-${Date.now()}`,
          query_type: 'find_exemplars',
          cluster_id: exCluster,
          exemplar_files: files.map((f) => f.file_path),
          symbol_ids: [],
        });
      }
      setResult(res);
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const activeMeta = QUERY_TYPES.find((q) => q.key === queryType) || QUERY_TYPES[0];

  return (
    <section className="qc">
      <header className="qc-header">
        <button type="button" className="toggle" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} Query Console
        </button>
        <span className="active-pill" style={{ background: activeMeta.color }}>
          {activeMeta.label}
        </span>
      </header>
      {open && (
        <div className="qc-body">
          <div className="type-row">
            {QUERY_TYPES.map((qt) => (
              <button
                key={qt.key}
                type="button"
                className={qt.key === queryType ? 'type-btn active' : 'type-btn'}
                onClick={() => switchType(qt.key)}
                style={qt.key === queryType ? { borderColor: qt.color, color: qt.color } : null}
              >
                {qt.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="form">
            {queryType === 'find_relevant_context' && (
              <>
                <label>
                  task
                  <textarea
                    rows={2}
                    value={ctxTask}
                    onChange={(e) => setCtxTask(e.target.value)}
                    placeholder="e.g. add rate limiting to public API endpoints"
                  />
                </label>
                <label>
                  seed_symbol (optional)
                  <input
                    value={ctxSeed}
                    onChange={(e) => setCtxSeed(e.target.value)}
                    placeholder="myapp.routes.auth.login"
                  />
                </label>
              </>
            )}

            {queryType === 'trace_data_flow' && (
              <>
                <label>
                  symbol
                  <input
                    value={flowSymbol}
                    onChange={(e) => setFlowSymbol(e.target.value)}
                    placeholder="myapp.routes.auth.login"
                  />
                </label>
                <div className="row">
                  <fieldset className="dir">
                    <legend>direction</legend>
                    <label className="radio">
                      <input
                        type="radio"
                        name="dir"
                        value="forward"
                        checked={flowDirection === 'forward'}
                        onChange={() => setFlowDirection('forward')}
                      />
                      forward
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="dir"
                        value="backward"
                        checked={flowDirection === 'backward'}
                        onChange={() => setFlowDirection('backward')}
                      />
                      backward
                    </label>
                  </fieldset>
                  <label className="depth">
                    depth: {flowDepth}
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={flowDepth}
                      onChange={(e) => setFlowDepth(Number(e.target.value))}
                    />
                  </label>
                </div>
              </>
            )}

            {queryType === 'find_invariants' && (
              <>
                <div className="row">
                  <label>
                    symbol (XOR cluster_id)
                    <input
                      value={invSymbol}
                      onChange={(e) => setInvSymbol(e.target.value)}
                      placeholder="myapp.routes.auth.login"
                    />
                  </label>
                  <label>
                    cluster_id (XOR symbol)
                    <input
                      value={invCluster}
                      onChange={(e) => setInvCluster(e.target.value)}
                      placeholder="2"
                    />
                  </label>
                </div>
                <label className="depth">
                  min_confidence: {invConf.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={invConf}
                    onChange={(e) => setInvConf(Number(e.target.value))}
                  />
                </label>
              </>
            )}

            {queryType === 'describe_architecture' && (
              <div className="row">
                <label>
                  path (XOR cluster_id)
                  <input
                    value={archPath}
                    onChange={(e) => setArchPath(e.target.value)}
                    placeholder="myapp/routes"
                  />
                </label>
                <label>
                  cluster_id (XOR path)
                  <input
                    value={archCluster}
                    onChange={(e) => setArchCluster(e.target.value)}
                    placeholder="2"
                  />
                </label>
              </div>
            )}

            {queryType === 'find_exemplars' && (
              <>
                <label>
                  task
                  <textarea
                    rows={2}
                    value={exTask}
                    onChange={(e) => setExTask(e.target.value)}
                    placeholder="add a new authenticated endpoint"
                  />
                </label>
                <label>
                  cluster_id
                  <input
                    value={exCluster}
                    onChange={(e) => setExCluster(e.target.value)}
                    placeholder="2"
                  />
                </label>
              </>
            )}

            <div className="actions">
              <button type="submit" className="submit" disabled={loading}>
                {loading ? 'Running…' : 'Run query'}
              </button>
              {error && <span className="err">{error}</span>}
            </div>
          </form>

          <div className="result">
            {result == null && !error && !loading && (
              <p className="hint">No result yet. Configure a query and submit.</p>
            )}
            {loading && <p className="hint">Querying…</p>}
            {result != null && (
              <ResultPanel queryType={queryType} result={result} request={lastRequest} />
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .qc { background: #0b1220; border-top: 1px solid #1f2937; color: #e2e8f0; }
        .qc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.5rem 1rem; border-bottom: 1px solid #1f2937;
          background: #0f172a;
        }
        .toggle {
          background: none; border: 0; color: #e2e8f0; font-size: 0.95rem;
          cursor: pointer; font-weight: 600;
        }
        .active-pill {
          font-size: 0.7rem; color: #0b1220; padding: 0.15rem 0.6rem;
          border-radius: 999px; font-weight: 700; text-transform: uppercase;
        }
        .qc-body {
          display: flex; flex-direction: column; gap: 0.75rem;
          padding: 0.75rem 1rem; max-height: 360px; overflow-y: auto;
        }
        .type-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .type-btn {
          background: #111827; border: 1px solid #1f2937; color: #94a3b8;
          padding: 0.35rem 0.7rem; border-radius: 999px; cursor: pointer;
          font-size: 0.78rem;
        }
        .type-btn:hover { background: #1f2937; }
        .type-btn.active { background: #0b1220; }
        .form { display: flex; flex-direction: column; gap: 0.5rem; }
        .form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; color: #94a3b8; }
        .form input, .form textarea {
          background: #0b1220; border: 1px solid #1f2937; color: #e2e8f0;
          padding: 0.4rem 0.55rem; border-radius: 0.35rem; font-size: 0.85rem;
          font-family: inherit;
        }
        .form .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .form .row > label, .form .row > fieldset { flex: 1 1 200px; }
        fieldset.dir { border: 1px solid #1f2937; border-radius: 0.35rem; padding: 0.4rem 0.55rem; }
        fieldset.dir legend { color: #94a3b8; font-size: 0.7rem; padding: 0 0.25rem; }
        .radio { flex-direction: row; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: #cbd5e1; }
        .depth input[type="range"] { width: 100%; }
        .actions { display: flex; align-items: center; gap: 0.75rem; }
        .submit {
          background: #2563eb; color: white; border: 0; border-radius: 0.35rem;
          padding: 0.45rem 1rem; cursor: pointer; font-weight: 600;
        }
        .submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .err { color: #fca5a5; font-size: 0.8rem; }
        .result { border-top: 1px dashed #1f2937; padding-top: 0.5rem; }
        .hint { color: #64748b; font-size: 0.85rem; margin: 0; }
      `}</style>
    </section>
  );
}

function ResultPanel({ queryType, result, request }) {
  const empty = isEmpty(queryType, result);
  if (empty) {
    return (
      <div className="empty-result">
        <p>No results returned.</p>
        {request && (
          <details>
            <summary>request sent</summary>
            <pre>{JSON.stringify(request, null, 2)}</pre>
          </details>
        )}
        <style jsx>{`
          .empty-result { font-size: 0.8rem; color: #94a3b8; }
          pre { background: #0f172a; padding: 0.5rem; border-radius: 0.35rem; overflow: auto; font-size: 0.75rem; }
        `}</style>
      </div>
    );
  }

  if (queryType === 'find_relevant_context') return <ContextResult result={result} />;
  if (queryType === 'trace_data_flow') return <FlowResult result={result} />;
  if (queryType === 'find_invariants') return <InvariantResult result={result} />;
  if (queryType === 'describe_architecture') return <ArchResult result={result} />;
  if (queryType === 'find_exemplars') return <ExemplarResult result={result} />;
  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}

function isEmpty(queryType, result) {
  if (result == null) return true;
  if (queryType === 'find_relevant_context') {
    return !result.relevant_symbols || result.relevant_symbols.length === 0;
  }
  if (queryType === 'trace_data_flow') {
    return !result.flows || result.flows.length === 0;
  }
  if (queryType === 'find_invariants') {
    return !Array.isArray(result) || result.length === 0;
  }
  if (queryType === 'describe_architecture') {
    return !result.cluster && (!result.member_files || result.member_files.length === 0);
  }
  if (queryType === 'find_exemplars') {
    return !result.files || result.files.length === 0;
  }
  return false;
}

function confColor(c) {
  if (c == null) return '#64748b';
  if (c >= 0.8) return '#34d399';
  if (c >= 0.5) return '#fbbf24';
  return '#f87171';
}

function ContextResult({ result }) {
  const region = result.region || {};
  return (
    <div className="ctx">
      <div className="region">
        <div className="role">{region.role || '(no role)'}</div>
        {region.cluster_id != null && <div className="meta">cluster {region.cluster_id}</div>}
        {region.dependencies && (
          <div className="meta">
            allowed: {(region.dependencies.allowed || []).join(', ') || '∅'} · forbidden:{' '}
            {(region.dependencies.forbidden || []).join(', ') || '∅'}
          </div>
        )}
      </div>
      {result.notes && result.notes.length > 0 && (
        <ul className="notes">
          {result.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      <ul className="symbols">
        {(result.relevant_symbols || []).map((sym, i) => (
          <li key={i}>
            <div className="qn">{sym.qualified_name}</div>
            <div className="loc">
              {sym.file_path}
              {sym.line_start != null ? `:${sym.line_start}` : ''} · {sym.kind}
            </div>
            {sym.signature && <pre>{sym.signature}</pre>}
            {sym.signals && (
              <div className="pills">
                {Object.entries(sym.signals).map(([k, v]) => (
                  <span className="pill" key={k}>
                    {k} {Number(v).toFixed(2)}
                  </span>
                ))}
              </div>
            )}
            {sym.invariants && sym.invariants.length > 0 && (
              <div className="invs">
                {sym.invariants.map((inv, j) => (
                  <span
                    key={j}
                    className="inv-chip"
                    style={{ borderColor: confColor(inv.confidence) }}
                  >
                    <span className="src">{inv.source_kind}</span>
                    <span className="conf" style={{ color: confColor(inv.confidence) }}>
                      {Number(inv.confidence || 0).toFixed(2)}
                    </span>
                    <span className="text">{inv.text}</span>
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {result.flows && result.flows.length > 0 && (
        <details className="flows-x">
          <summary>Touches {result.flows.length} flow(s)</summary>
          <ul>
            {result.flows.map((f, i) => (
              <li key={i}>
                {f.source_symbol} → {f.sink_symbol}{' '}
                <span className="kind">[{f.flow_kind}]</span>
                {f.sensitivity && <span className="sens"> ({f.sensitivity})</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <style jsx>{`
        .ctx { font-size: 0.8rem; }
        .region { padding: 0.5rem 0.6rem; background: #0f172a; border-radius: 0.35rem; margin-bottom: 0.5rem; }
        .role { color: #e2e8f0; font-weight: 600; }
        .meta { color: #94a3b8; font-size: 0.72rem; margin-top: 0.15rem; }
        .notes { margin: 0 0 0.5rem; padding-left: 1rem; color: #94a3b8; font-size: 0.75rem; }
        .symbols { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
        .symbols li { background: #0f172a; padding: 0.5rem 0.6rem; border-radius: 0.35rem; }
        .qn { color: #93c5fd; font-weight: 600; font-family: ui-monospace, monospace; font-size: 0.78rem; }
        .loc { color: #94a3b8; font-size: 0.7rem; margin-top: 0.15rem; }
        pre { background: #020617; padding: 0.35rem 0.5rem; border-radius: 0.3rem; font-size: 0.7rem; margin: 0.35rem 0; overflow: auto; }
        .pills { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.25rem; }
        .pill { background: #1f2937; color: #cbd5e1; padding: 0.1rem 0.45rem; border-radius: 999px; font-size: 0.65rem; }
        .invs { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.4rem; }
        .inv-chip {
          display: inline-flex; gap: 0.4rem; align-items: center;
          border: 1px solid; border-radius: 0.35rem; padding: 0.25rem 0.45rem;
          font-size: 0.7rem; background: #020617;
        }
        .inv-chip .src { color: #94a3b8; text-transform: uppercase; font-size: 0.6rem; }
        .inv-chip .conf { font-weight: 700; }
        .inv-chip .text { color: #e2e8f0; }
        .flows-x { margin-top: 0.5rem; font-size: 0.75rem; }
        .flows-x summary { cursor: pointer; color: #94a3b8; }
        .kind { color: #a78bfa; }
        .sens { color: #f87171; }
      `}</style>
    </div>
  );
}

function sensColor(s) {
  if (!s) return '#64748b';
  if (/cred|pii|secret|token/i.test(s)) return '#f87171';
  if (/user|sensitive/i.test(s)) return '#fbbf24';
  return '#94a3b8';
}

function FlowResult({ result }) {
  return (
    <ul className="flows">
      {(result.flows || []).map((f, i) => (
        <li key={i}>
          <div className="path">
            {(f.path || [f.source_symbol, f.sink_symbol]).map((p, j, arr) => (
              <span key={j}>
                <span className="node">{p}</span>
                {j < arr.length - 1 && <span className="arrow"> → </span>}
              </span>
            ))}
          </div>
          <div className="meta">
            <span className="kind">{f.flow_kind}</span>
            {f.sensitivity && (
              <span className="sens" style={{ color: sensColor(f.sensitivity), borderColor: sensColor(f.sensitivity) }}>
                {f.sensitivity}
              </span>
            )}
          </div>
        </li>
      ))}
      <style jsx>{`
        .flows { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.78rem; }
        .flows li { background: #0f172a; padding: 0.45rem 0.55rem; border-radius: 0.35rem; }
        .path { font-family: ui-monospace, monospace; color: #93c5fd; word-break: break-all; }
        .arrow { color: #64748b; }
        .meta { display: flex; gap: 0.4rem; margin-top: 0.25rem; align-items: center; }
        .kind { background: #1f2937; color: #cbd5e1; padding: 0.1rem 0.45rem; border-radius: 999px; font-size: 0.65rem; }
        .sens { border: 1px solid; padding: 0.1rem 0.45rem; border-radius: 999px; font-size: 0.65rem; }
      `}</style>
    </ul>
  );
}

function InvariantResult({ result }) {
  // Group by target_symbol
  const groups = {};
  result.forEach((inv) => {
    const k = inv.target_symbol || '(unknown)';
    if (!groups[k]) groups[k] = [];
    groups[k].push(inv);
  });
  const entries = Object.entries(groups);
  return (
    <div className="inv-result">
      {entries.map(([target, invs]) => (
        <div key={target} className="grp">
          <div className="target">{target}</div>
          <ul>
            {invs.map((inv, i) => (
              <li key={i}>
                <span className="src" style={{ background: '#1f2937' }}>{inv.source_kind}</span>
                <span className="conf" style={{ color: confColor(inv.confidence) }}>
                  {Number(inv.confidence || 0).toFixed(2)}
                </span>
                <span className="text">{inv.text}</span>
                {inv.source_location && <span className="loc">@ {inv.source_location}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <style jsx>{`
        .inv-result { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.78rem; }
        .grp { background: #0f172a; padding: 0.5rem 0.6rem; border-radius: 0.35rem; }
        .target { color: #93c5fd; font-family: ui-monospace, monospace; font-weight: 600; margin-bottom: 0.3rem; }
        ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
        li { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; }
        .src { color: #cbd5e1; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.65rem; text-transform: uppercase; }
        .conf { font-weight: 700; }
        .text { color: #e2e8f0; flex: 1 1 60%; }
        .loc { color: #64748b; font-size: 0.7rem; }
      `}</style>
    </div>
  );
}

function ArchResult({ result }) {
  const cluster = result.cluster || {};
  const files = result.member_files || [];
  return (
    <div className="arch-result">
      <div className="header">
        <div className="role">{cluster.role || '(unnamed cluster)'}</div>
        {cluster.cluster_id != null && <div className="meta">cluster {cluster.cluster_id}</div>}
      </div>
      {cluster.conventions && (
        <details open>
          <summary>conventions</summary>
          <pre>{JSON.stringify(cluster.conventions, null, 2)}</pre>
        </details>
      )}
      {cluster.dependencies && (
        <div className="deps">
          <span>allowed: {(cluster.dependencies.allowed || []).length}</span>
          <span>forbidden: {(cluster.dependencies.forbidden || []).length}</span>
        </div>
      )}
      <details>
        <summary>{files.length} member file(s)</summary>
        <ul>
          {files.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </details>
      <style jsx>{`
        .arch-result { font-size: 0.78rem; display: flex; flex-direction: column; gap: 0.4rem; }
        .header { background: #0f172a; padding: 0.5rem 0.6rem; border-radius: 0.35rem; }
        .role { color: #e2e8f0; font-weight: 600; }
        .meta { color: #94a3b8; font-size: 0.7rem; }
        details summary { cursor: pointer; color: #94a3b8; }
        pre { background: #020617; padding: 0.4rem 0.55rem; border-radius: 0.3rem; font-size: 0.7rem; overflow: auto; }
        .deps { display: flex; gap: 0.75rem; color: #94a3b8; font-size: 0.72rem; }
        ul { padding-left: 1rem; color: #cbd5e1; max-height: 200px; overflow-y: auto; }
      `}</style>
    </div>
  );
}

function ExemplarResult({ result }) {
  return (
    <ul className="ex-result">
      {(result.files || []).map((f, i) => (
        <li key={i}>
          <span className="path">{f.file_path}</span>
          {f.reason && <span className="reason">{f.reason}</span>}
        </li>
      ))}
      <style jsx>{`
        .ex-result { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; }
        .ex-result li { background: #0f172a; padding: 0.45rem 0.6rem; border-radius: 0.35rem; }
        .path { color: #93c5fd; font-family: ui-monospace, monospace; font-weight: 600; display: block; }
        .reason { color: #cbd5e1; font-size: 0.72rem; display: block; margin-top: 0.2rem; }
      `}</style>
    </ul>
  );
}
