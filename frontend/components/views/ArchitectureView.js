import { useEffect, useRef, useState } from 'react';
import useGraphStore from '../../lib/graphStore';
import ConventionPanel from '../ConventionPanel';

export default function ArchitectureView({ repoHash }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const slice = useGraphStore((s) => (repoHash ? s.byRepo[repoHash] : null));
  const projection = (slice && slice.layers && slice.layers.architecture) || { nodes: [], edges: [] };
  const empty = !projection.nodes || projection.nodes.length === 0;

  useEffect(() => {
    if (empty) return undefined;
    let cy;
    let disposed = false;

    (async () => {
      const cytoscape = (await import('cytoscape')).default;
      try {
        const fcose = (await import('cytoscape-fcose')).default;
        cytoscape.use(fcose);
      } catch (_) {}
      if (disposed || !containerRef.current) return;

      cy = cytoscape({
        container: containerRef.current,
        elements: [],
        style: [
          {
            selector: 'node',
            style: {
              'shape': 'round-rectangle',
              'background-color': '#1e293b',
              'border-color': '#60a5fa',
              'border-width': 2,
              'label': 'data(label)',
              'color': '#e2e8f0',
              'font-size': 11,
              'text-wrap': 'wrap',
              'text-max-width': 120,
              'padding': 10,
              'width': 'label',
              'height': 'label',
            },
          },
          {
            selector: 'edge[kind = "forbidden"]',
            style: {
              'line-color': '#ef4444',
              'line-style': 'dashed',
              'target-arrow-color': '#ef4444',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            },
          },
          {
            selector: 'edge',
            style: {
              'line-color': '#34d399',
              'target-arrow-color': '#34d399',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            },
          },
        ],
      });

      cy.on('tap', 'node', (evt) => {
        const raw = evt.target.data('raw');
        const md = (raw && raw.metadata) || {};
        setSelectedRegion({
          cluster_id: md.cluster_id != null ? md.cluster_id : raw && raw.id,
          role: md.role || raw?.label,
          conventions: md.conventions || {},
          dependencies: md.dependencies || {},
        });
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
  }, [empty]);

  useEffect(() => { render(); }, [projection]); // eslint-disable-line

  function render() {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = (projection.nodes || []).map((n) => ({
      data: { id: n.id, label: n.label, raw: n },
    }));
    const edges = (projection.edges || []).map((e, i) => ({
      data: {
        id: `e${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        kind: e.kind,
      },
    }));
    cy.batch(() => {
      cy.elements().remove();
      cy.add([...nodes, ...edges]);
    });
    try { cy.layout({ name: 'fcose', animate: false }).run(); }
    catch (_) { try { cy.layout({ name: 'cose', animate: false }).run(); } catch (__) {} }
  }

  if (empty) {
    return (
      <div className="placeholder">
        <p>Layer 3 not yet built</p>
        <small>Architecture view will populate once cluster annotations are available.</small>
        <style jsx>{placeholderStyles}</style>
      </div>
    );
  }

  return (
    <div className="arch-view">
      <div ref={containerRef} className="cy-container" />
      <div className="side-panel">
        <ConventionPanel region={selectedRegion} />
      </div>
      <style jsx>{`
        .arch-view { position: relative; width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 320px; }
        .cy-container { background: #0b1220; }
        .side-panel { padding: 1rem; overflow-y: auto; background: #0b1220; border-left: 1px solid #1f2937; }
      `}</style>
    </div>
  );
}

const placeholderStyles = `
  .placeholder {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    width: 100%; height: 100%; color: #64748b; gap: 0.5rem;
  }
  .placeholder p { font-size: 1.1rem; margin: 0; }
  .placeholder small { color: #475569; }
`;
