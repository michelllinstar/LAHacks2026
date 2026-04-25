import useGraphStore from '../../lib/graphStore';

export default function FlowView({ repoHash }) {
  const slice = useGraphStore((s) => (repoHash ? s.byRepo[repoHash] : null));
  const projection = (slice && slice.layers && slice.layers.flow) || { nodes: [], edges: [] };
  const empty = !projection.nodes || projection.nodes.length === 0;

  return (
    <div className="placeholder">
      {empty ? (
        <>
          <p>Layer 2 not yet built</p>
          <small>Flow view will render data-flow Sankey once Layer Two indexing lands.</small>
        </>
      ) : (
        <>
          <p>Flow view ({projection.nodes.length} nodes, {projection.edges.length} edges)</p>
          <small>Renderer pending — Layer 2 wiring is next.</small>
        </>
      )}
      <style jsx>{`
        .placeholder {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 100%; height: 100%; color: #64748b; gap: 0.5rem;
        }
        .placeholder p { font-size: 1.1rem; margin: 0; }
        .placeholder small { color: #475569; }
      `}</style>
    </div>
  );
}
