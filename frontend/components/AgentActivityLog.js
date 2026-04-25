import { useEffect, useState } from 'react';
import useGraphStore from '../lib/graphStore';

const TYPE_META = {
  find_relevant_context: { color: '#ffb347', letter: 'S', label: 'context' },
  trace_data_flow:       { color: '#ff6b6b', letter: 'F', label: 'flow' },
  find_invariants:       { color: '#fab1a0', letter: 'I', label: 'invariants' },
  describe_architecture: { color: '#7ed6df', letter: 'A', label: 'architecture' },
  find_exemplars:        { color: '#a29bfe', letter: 'E', label: 'exemplars' },
};

export default function AgentActivityLog({ repoHash }) {
  const slice = useGraphStore((s) => (repoHash ? s.byRepo[repoHash] : null));
  const applyDelta = useGraphStore((s) => s.applyDelta);
  const activity = (slice && slice.activity) || [];

  // Tick state every 5s so relative timestamps update
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const replay = (entry) => {
    if (!repoHash) return;
    const ids = entry.symbol_ids && entry.symbol_ids.length
      ? entry.symbol_ids
      : (entry.target_qnames || []);
    applyDelta(repoHash, {
      type: 'region_highlighted',
      payload: {
        node_ids: ids,
        color: '#22d3ee',
        ttl_ms: 3000,
      },
    });
  };

  return (
    <aside className="activity-log">
      <h3>Agent Activity</h3>
      {activity.length === 0 ? (
        <p className="empty">No agent traffic yet.</p>
      ) : (
        <ul>
          {activity.map((entry, idx) => {
            const meta = TYPE_META[entry.query_type] || { color: '#64748b', letter: '?', label: entry.query_type || 'query' };
            return (
              <li key={`${entry.query_id || 'q'}-${idx}`}>
                <button
                  type="button"
                  onClick={() => replay(entry)}
                  style={{ borderLeftColor: meta.color }}
                >
                  <div className="row1">
                    <span className="badge" style={{ background: meta.color }}>{meta.letter}</span>
                    <span className="qtype" style={{ color: meta.color }}>
                      {entry.query_type || 'query'}
                    </span>
                    <span className="ts">{relativeTs(entry.ts)}</span>
                  </div>
                  <div className="row2">{detailString(entry)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <style jsx>{`
        .activity-log {
          width: 320px; flex-shrink: 0;
          background: #0b1220; border-left: 1px solid #1f2937;
          padding: 1rem; overflow-y: auto;
        }
        h3 { margin-top: 0; font-size: 1rem; color: #e2e8f0; }
        .empty { color: #64748b; font-size: 0.85rem; }
        ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
        button {
          width: 100%; text-align: left; cursor: pointer;
          background: #111827; border: 1px solid #1f2937; color: white;
          border-left: 4px solid #64748b;
          border-radius: 0.5rem; padding: 0.6rem 0.75rem;
        }
        button:hover { background: #1f2937; }
        .row1 { display: flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
        .badge {
          display: inline-flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; border-radius: 4px;
          color: #0b1220; font-weight: 800; font-size: 0.7rem;
        }
        .qtype { font-weight: 600; flex: 1; font-size: 0.78rem; font-family: ui-monospace, monospace; }
        .ts { color: #64748b; font-size: 0.7rem; }
        .row2 { color: #94a3b8; font-size: 0.78rem; margin-top: 0.3rem; }
      `}</style>
    </aside>
  );
}

function detailString(entry) {
  const t = entry.query_type;
  if (t === 'find_relevant_context') {
    if (entry.ranked_count != null) {
      const region = entry.region && entry.region.role ? ` · ${entry.region.role}` : '';
      return `ranked ${entry.ranked_count} symbols${region}`;
    }
    return 'context bundle';
  }
  if (t === 'trace_data_flow') {
    const seed = entry.seed_symbol || '?';
    const dir = entry.direction || 'forward';
    const depth = entry.depth != null ? entry.depth : '?';
    const fc = entry.flow_count != null ? ` · ${entry.flow_count} flow(s)` : '';
    return `trace from ${seed} (${dir}, depth=${depth})${fc}`;
  }
  if (t === 'find_invariants') {
    const n = entry.invariant_count != null ? entry.invariant_count : '?';
    let parts = [`${n} invariants`];
    if (entry.target_symbol) parts.push(`for ${entry.target_symbol}`);
    else if (entry.cluster_id != null) parts.push(`cluster ${entry.cluster_id}`);
    if (entry.by_source && Object.keys(entry.by_source).length > 0) {
      const breakdown = Object.entries(entry.by_source)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
      parts.push(`(${breakdown})`);
    }
    return parts.join(' · ');
  }
  if (t === 'describe_architecture') {
    const target = entry.cluster_id != null ? `cluster ${entry.cluster_id}` : (entry.path || '(?)');
    const n = (entry.member_files || []).length;
    return `${target} · ${n} files`;
  }
  if (t === 'find_exemplars') {
    const n = (entry.exemplar_files || []).length;
    return `${n} exemplars in cluster ${entry.cluster_id != null ? entry.cluster_id : '?'}`;
  }
  return `${(entry.symbol_ids || []).length} symbols${entry.cluster_id != null ? ` · cluster ${entry.cluster_id}` : ''}`;
}

function relativeTs(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return 'now';
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
