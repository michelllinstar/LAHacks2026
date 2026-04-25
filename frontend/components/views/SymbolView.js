import { useEffect, useRef, useState } from 'react';
import useGraphStore from '../../lib/graphStore';

const KIND_COLORS = {
  function: '#60a5fa',
  class: '#f472b6',
  method: '#34d399',
  variable: '#fbbf24',
  default: '#94a3b8',
};

const EDGE_COLORS = {
  call: '#60a5fa',
  import: '#a78bfa',
  inherit: '#f472b6',
  default: '#475569',
};

export default function SymbolView({ repoHash }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const slice = useGraphStore((s) => (repoHash ? s.byRepo[repoHash] : null));
  const projection = (slice && slice.layers && slice.layers.symbol) || { nodes: [], edges: [] };
  const highlights = (slice && slice.highlights) || {};

  // Initialise cytoscape on mount
  useEffect(() => {
    let cy;
    let disposed = false;

    (async () => {
      if (typeof window === 'undefined') return;
      const cytoscape = (await import('cytoscape')).default;
      try {
        const fcose = (await import('cytoscape-fcose')).default;
        cytoscape.use(fcose);
      } catch (_) {
        // optional
      }
      if (disposed || !containerRef.current) return;

      cy = cytoscape({
        container: containerRef.current,
        elements: [],
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(color)',
              'label': 'data(label)',
              'color': '#e2e8f0',
              'font-size': 9,
              'text-valign': 'bottom',
              'text-margin-y': 4,
              'width': 18,
              'height': 18,
              'border-width': 'data(borderWidth)',
              'border-color': 'data(borderColor)',
            },
          },
          {
            selector: 'edge',
            style: {
              'curve-style': 'bezier',
              'line-color': 'data(color)',
              'target-arrow-color': 'data(color)',
              'target-arrow-shape': 'triangle',
              'width': 1,
              'opacity': 0.65,
            },
          },
        ],
      });

      cy.on('tap', 'node', (evt) => {
        const data = evt.target.data();
        setSelected(data.raw);
      });
      cy.on('tap', (evt) => {
        if (evt.target === cy) setSelected(null);
      });

      cyRef.current = cy;
      renderElements();
    })();

    return () => {
      disposed = true;
      try { if (cy) cy.destroy(); } catch (_) {}
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render whenever projection or highlights change
  useEffect(() => {
    renderElements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, highlights]);

  function renderElements() {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = (projection.nodes || []).map((n) => {
      const kind = (n.metadata && n.metadata.kind) || 'default';
      const hl = highlights[n.id];
      return {
        data: {
          id: n.id,
          label: n.label,
          color: KIND_COLORS[kind] || KIND_COLORS.default,
          borderColor: hl || 'rgba(0,0,0,0)',
          borderWidth: hl ? 4 : 0,
          raw: n,
        },
      };
    });
    const edges = (projection.edges || []).map((e, i) => ({
      data: {
        id: `e${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        color: EDGE_COLORS[e.kind] || EDGE_COLORS.default,
      },
    }));

    cy.batch(() => {
      cy.elements().remove();
      cy.add([...nodes, ...edges]);
    });

    const layoutName = cy.layout && cy.extension && cy.extension('layout', 'fcose') ? 'fcose' : 'cose';
    try {
      cy.layout({ name: layoutName, animate: false, randomize: true }).run();
    } catch (_) {
      try { cy.layout({ name: 'cose', animate: false }).run(); } catch (__) {}
    }
  }

  return (
    <div className="symbol-view">
      <div ref={containerRef} className="cy-container" />
      {selected && (
        <div className="inspector">
          <button className="close" onClick={() => setSelected(null)}>×</button>
          <h4>{selected.label}</h4>
          <p className="kind">{(selected.metadata && selected.metadata.kind) || 'symbol'}</p>
          {selected.metadata && selected.metadata.signature && (
            <pre>{selected.metadata.signature}</pre>
          )}
          {selected.metadata && selected.metadata.file_path && (
            <p className="loc">
              {selected.metadata.file_path}
              {selected.metadata.line_start != null
                ? `:${selected.metadata.line_start}`
                : ''}
            </p>
          )}
          {selected.metadata && Object.keys(selected.metadata).length > 0 && (
            <details>
              <summary>metadata</summary>
              <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
      {(!projection.nodes || projection.nodes.length === 0) && (
        <div className="empty-overlay">
          <p>No symbols indexed yet.</p>
        </div>
      )}
      <style jsx>{`
        .symbol-view { position: relative; width: 100%; height: 100%; }
        .cy-container { position: absolute; inset: 0; background: #0b1220; }
        .inspector {
          position: absolute; top: 1rem; left: 1rem; max-width: 320px;
          background: rgba(17, 24, 39, 0.95);
          border: 1px solid #1f2937;
          border-radius: 0.5rem;
          padding: 0.85rem;
          color: #e2e8f0;
          font-size: 0.85rem;
        }
        .inspector h4 { margin: 0 0 0.25rem; }
        .inspector .kind { margin: 0 0 0.5rem; color: #93c5fd; font-size: 0.75rem; text-transform: uppercase; }
        .inspector pre { background: #0f172a; padding: 0.5rem; border-radius: 0.4rem; overflow: auto; font-size: 0.75rem; }
        .inspector .loc { color: #94a3b8; font-size: 0.75rem; }
        .inspector .close { position: absolute; top: 4px; right: 8px; background: none; border: 0; color: #94a3b8; font-size: 1.1rem; cursor: pointer; }
        .empty-overlay {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          color: #64748b; pointer-events: none;
        }
      `}</style>
    </div>
  );
}
