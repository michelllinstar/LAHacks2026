import useGraphStore from '../../lib/graphStore';

export default function InvariantView({ repoHash }) {
  const slice = useGraphStore((s) => (repoHash ? s.byRepo[repoHash] : null));
  const projection = (slice && slice.layers && slice.layers.invariant) || { nodes: [], edges: [] };
  const empty = !projection.nodes || projection.nodes.length === 0;

  return (
    <div className="placeholder">
      {empty ? (
        <>
          <p>Layer 4 not yet built</p>
          <small>Invariant view will list implicit constraints once mining lands.</small>
        </>
      ) : (
        <ul>
          {projection.nodes.map((n) => (
            <li key={n.id}>
              <strong>{n.label}</strong>
              <span>{(n.metadata && n.metadata.source_kind) || 'invariant'}</span>
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .placeholder {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 100%; height: 100%; color: #64748b; gap: 0.5rem; padding: 2rem;
        }
        .placeholder p { font-size: 1.1rem; margin: 0; }
        .placeholder small { color: #475569; }
        ul {
          width: 100%; max-width: 720px;
          list-style: none; padding: 0; margin: 0;
          display: flex; flex-direction: column; gap: 0.5rem;
        }
        li {
          background: #111827; border: 1px solid #1f2937;
          border-radius: 0.5rem; padding: 0.6rem 0.75rem;
          display: flex; justify-content: space-between; gap: 1rem;
          color: #e2e8f0;
        }
        li span { color: #93c5fd; font-size: 0.8rem; }
      `}</style>
    </div>
  );
}
