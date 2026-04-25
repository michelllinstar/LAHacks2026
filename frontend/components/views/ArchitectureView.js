import { useEffect, useRef, useState } from 'react';
import useGraphStore from '../../lib/graphStore';
import ConventionPanel from '../ConventionPanel';

/**
 * Layer 3 cluster diagram.
 *
 * Nodes are clusters (kind="cluster"); edges are inter-cluster dependencies
 * (allows / forbids / depends). Clicking a cluster opens ConventionPanel
 * populated from the GraphNode metadata.
 *
 * Trade-off / future work: today the side panel is filled directly from the
 * projection's embedded metadata. Once Agent B's `api.js` exposes
 * `describe_architecture`, the click handler can call that endpoint to fetch
 * the full Region (member files + complete dependency manifest with names
 * resolved instead of cluster IDs) and pass `memberFiles` to ConventionPanel.
 */
export default function ArchitectureView({ repoHash }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [selectedCluster, setSelectedCluster] = useState(null);

  const slice = useGraphStore((s) => (repoHash ? s.byRepo[repoHash] : null));
  const projection = (slice && slice.layers && slice.layers.architecture) || { nodes: [], edges: [] };
  const highlights = (slice && slice.highlights) || {};
  const empty = !projection.nodes || projection.nodes.length === 0;

  useEffect(() => {
    let cy;
    let disposed = false;

    (async () => {
      if (typeof window === 'undefined') return;
      const cytoscape = (await import('cytoscape')).default;
      try {
        const fcose = (await import('cytoscape-fcose')).default;
        cytoscape.use(fcose);
      } catch (_) {}
      if (disposed || !containerRef.current) return;

      cy = cytoscape({
        container: containerRef.current,
        elements: [],
        wheelSensitivity: 0.2,
        style: [
          {
            selector: 'node',
            style: {
              'shape': 'round-rectangle',
              'background-color': '#1e293b',
              'border-color': 'data(borderColor)',
              'border-width': 'data(borderWidth)',
              'label': 'data(label)',
              'color': '#e2e8f0',
              'font-size': 11,
              'text-wrap': 'wrap',
              'text-max-width': 160,
              'text-valign': 'center',
              'text-halign': 'center',
              'padding': 12,
              'width': 'label',
              'height': 'label',
            },
          },
          {
            selector: 'node:selected',
            style: { 'border-color': '#fbbf24', 'border-width': 3 },
          },
          // allows: solid green
          {
            selector: 'edge[kind = "allows"]',
            style: {
              'line-color': '#34d399',
              'target-arrow-color': '#34d399',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'width': 2,
            },
          },
          // forbids: dashed red
          {
            selector: 'edge[kind = "forbids"]',
            style: {
              'line-color': '#ef4444',
              'line-style': 'dashed',
              'target-arrow-color': '#ef4444',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'width': 2.5,
            },
          },
          // depends: gray
          {
            selector: 'edge[kind = "depends"]',
            style: {
              'line-color': '#64748b',
              'target-arrow-color': '#64748b',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'width': 1.5,
              'opacity': 0.7,
            },
          },
          {
            selector: 'edge',
            style: {
              'curve-style': 'bezier',
              'line-color': '#475569',
              'target-arrow-color': '#475569',
              'target-arrow-shape': 'triangle',
            },
          },
        ],
      });

      cy.on('tap', 'node', (evt) => {
        const raw = evt.target.data('raw');
        if (!raw) return;
        setSelectedCluster(buildClusterFromNode(raw));
      });
      cy.on('tap', (evt) => {
        if (evt.target === cy) setSelectedCluster(null);
      });

      cyRef.current = cy;
      render();
    })();

    return () => {
      disposed = true;
      try { if (cy) cy.destroy(); } catch (_) {}
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { render(); /* eslint-disable-next-line */ }, [projection, highlights]);

  function render() {
    const cy = cyRef.current;
    if (!cy) return;

    const nodes = (projection.nodes || []).map((n) => {
      const hl = highlights[n.id];
      return {
        data: {
          id: n.id,
          label: n.label || '(unnamed cluster)',
          borderColor: hl || '#60a5fa',
          borderWidth: hl ? 4 : 2,
          raw: n,
        },
      };
    });

    const edges = (projection.edges || []).map((e, i) => ({
      data: {
        id: `e${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        kind: e.kind || (e.metadata && e.metadata.kind === 'forbidden' ? 'forbids' : 'depends'),
      },
    }));

    cy.batch(() => {
      cy.elements().remove();
      cy.add([...nodes, ...edges]);
    });

    try { cy.layout({ name: 'fcose', animate: false, randomize: true }).run(); }
    catch (_) {
      try { cy.layout({ name: 'cose', animate: false }).run(); } catch (__) {}
    }
  }

  return (
    <div className="arch-view">
      <div ref={containerRef} className="cy-container" />
      {empty && (
        <div className="empty-overlay">
          <p>Layer 3 not built yet — index a repository first</p>
          <small>Architecture view populates after cluster annotation completes.</small>
        </div>
      )}
      <Legend />
      {selectedCluster && (
        <aside className="side-panel">
          <ConventionPanel
            cluster={selectedCluster}
            onClose={() => setSelectedCluster(null)}
          />
        </aside>
      )}
      <style jsx>{`
        .arch-view { position: relative; width: 100%; height: 100%; }
        .cy-container { position: absolute; inset: 0; background: #0b1220; }
        .side-panel {
          position: absolute; top: 0; right: 0; bottom: 0;
          width: 360px;
          padding: 1rem;
          overflow-y: auto;
          background: rgba(11, 18, 32, 0.96);
          border-left: 1px solid #1f2937;
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
          animation: slide-in 180ms ease-out;
        }
        @keyframes slide-in {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .empty-overlay {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; gap: 0.4rem;
          align-items: center; justify-content: center;
          color: #64748b; pointer-events: none;
        }
        .empty-overlay p { margin: 0; font-size: 1.05rem; }
        .empty-overlay small { color: #475569; }
      `}</style>
    </div>
  );
}

function buildClusterFromNode(node) {
  // Map a Layer 3 GraphNode into the shape ConventionPanel expects.
  const md = node.metadata || {};
  return {
    cluster_id: node.id,
    role: md.role_description || node.label || 'Unknown role',
    role_description: md.role_description || node.label,
    naming_convention: md.naming_convention,
    code_shape: md.code_shape,
    member_count: md.member_count,
    conventions: {
      naming: md.naming_convention,
      code_shape: md.code_shape,
    },
    // Projection edges carry dependencies; the panel can show them eventually
    // via describe_architecture. For now we leave allowed/forbidden empty so
    // the panel renders graceful "None listed" copy rather than misleading data.
    dependencies: { allowed: [], forbidden: [] },
  };
}

function Legend() {
  return (
    <div className="legend">
      <div><span className="line allows" /> allows</div>
      <div><span className="line forbids" /> forbids</div>
      <div><span className="line depends" /> depends</div>
      <style jsx>{`
        .legend {
          position: absolute; bottom: 0.75rem; left: 0.75rem;
          background: rgba(17, 24, 39, 0.92);
          border: 1px solid #1f2937;
          border-radius: 0.4rem;
          padding: 0.4rem 0.6rem;
          font-size: 0.7rem; color: #cbd5e1;
          display: flex; gap: 0.75rem; align-items: center;
        }
        .legend > div { display: flex; align-items: center; gap: 0.35rem; }
        .line { width: 22px; height: 0; border-top: 2px solid; display: inline-block; }
        .line.allows { border-color: #34d399; }
        .line.forbids { border-color: #ef4444; border-top-style: dashed; }
        .line.depends { border-color: #64748b; }
      `}</style>
    </div>
  );
}
