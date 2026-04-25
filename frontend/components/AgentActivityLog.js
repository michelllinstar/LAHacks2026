import useGraphStore from '../lib/graphStore';

export default function AgentActivityLog({ repoHash }) {
  const slice = useGraphStore((s) => (repoHash ? s.byRepo[repoHash] : null));
  const applyDelta = useGraphStore((s) => s.applyDelta);
  const activity = (slice && slice.activity) || [];

  const replay = (entry) => {
    if (!repoHash) return;
    applyDelta(repoHash, {
      type: 'region_highlighted',
      payload: {
        node_ids: entry.symbol_ids || [],
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
          {activity.map((entry, idx) => (
            <li key={`${entry.query_id || 'q'}-${idx}`}>
              <button type="button" onClick={() => replay(entry)}>
                <div className="row1">
                  <span className="qtype">{entry.query_type || 'query'}</span>
                  <span className="ts">{formatTs(entry.ts)}</span>
                </div>
                <div className="row2">
                  {(entry.symbol_ids || []).length} symbols
                  {entry.cluster_id != null ? ` · cluster ${entry.cluster_id}` : ''}
                </div>
              </button>
            </li>
          ))}
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
          border-radius: 0.5rem; padding: 0.6rem 0.75rem;
        }
        button:hover { background: #1f2937; }
        .row1 { display: flex; justify-content: space-between; font-size: 0.85rem; }
        .qtype { color: #93c5fd; font-weight: 600; }
        .ts { color: #64748b; font-size: 0.75rem; }
        .row2 { color: #94a3b8; font-size: 0.8rem; margin-top: 0.25rem; }
      `}</style>
    </aside>
  );
}

function formatTs(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString(); } catch (_) { return ''; }
}
