import { useEffect, useMemo, useRef, useState } from 'react';
import useGraphStore from '../../lib/graphStore';

// Color-coding for symbol kinds (function/method/class/etc).
const KIND_COLORS = {
  function: '#60a5fa',
  method: '#34d399',
  class: '#f472b6',
  variable: '#fbbf24',
  default: '#94a3b8',
};

// Sensitivity coloring per SPEC §8.4.
const SENSITIVITY_COLORS = {
  password: '#ef4444',
  token: '#f97316',
  ssn: '#a855f7',
  default: '#475569',
};

function sensitivityColor(tag) {
  if (!tag) return SENSITIVITY_COLORS.default;
  return SENSITIVITY_COLORS[tag] || SENSITIVITY_COLORS.default;
}

const EMPTY_LAYER = { nodes: [], edges: [] };
const EMPTY_HIGHLIGHTS = {};

export default function FlowView({ repoHash }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [selected, setSelected] = useState(null);

  const projection = useGraphStore(
    (s) => (repoHash && s.byRepo[repoHash] && s.byRepo[repoHash].layers.flow) || EMPTY_LAYER,
  );
  const highlights = useGraphStore(
    (s) => (repoHash && s.byRepo[repoHash] && s.byRepo[repoHash].highlights) || EMPTY_HIGHLIGHTS,
  );

  const layoutRanRef = useRef(false);

  // Pre-compute per-symbol flow membership so a node-tap can summarise the
  // call chains that touch it without rescanning everything.
  const flowsBySymbol = useMemo(() => {
    const map = {};
    const nodeIds = new Set((projection.nodes || []).map((n) => n.id));
    (projection.edges || []).forEach((e) => {
      const sensitivity = e.metadata && e.metadata.sensitivity ? e.metadata.sensitivity : null;
      const path = (e.metadata && Array.isArray(e.metadata.path)) ? e.metadata.path : [];
      const touched = new Set([e.source, e.target, ...path]);
      touched.forEach((id) => {
        if (!nodeIds.has(id)) return;
        if (!map[id]) map[id] = [];
        map[id].push({ source: e.source, target: e.target, sensitivity, path });
      });
    });
    return map;
  }, [projection]);

  const nodeLabelById = useMemo(() => {
    const m = {};
    (projection.nodes || []).forEach((n) => { m[n.id] = n.label || n.id; });
    return m;
  }, [projection]);

  // Cytoscape boot — dynamic import for SSR safety. Pattern mirrors SymbolView.
  useEffect(() => {
    let cy;
    let disposed = false;

    (async () => {
      if (typeof window === 'undefined') return;
      const cytoscape = (await import('cytoscape')).default;
      let useDagre = false;
      try {
        const dagre = (await import('cytoscape-dagre')).default;
        cytoscape.use(dagre);
        useDagre = true;
      } catch (_) {
        // dagre optional; fall back to cose oriented horizontally
      }
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
              'background-color': 'data(color)',
              'label': 'data(label)',
              'color': '#e2e8f0',
              'font-size': 10,
              'text-valign': 'bottom',
              'text-margin-y': 4,
              'width': 22,
              'height': 22,
              'border-width': 'data(borderWidth)',
              'border-color': 'data(borderColor)',
            },
          },
          {
            selector: 'node.highlighted',
            style: {
              'border-width': 4,
              'border-color': 'data(hlColor)',
            },
          },
          {
            selector: 'edge',
            style: {
              'curve-style': 'bezier',
              'line-color': 'data(color)',
              'target-arrow-color': 'data(color)',
              'target-arrow-shape': 'triangle',
              'width': 'data(width)',
              'opacity': 0.85,
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
      cyRef.current._useDagre = useDagre;
      renderElements();
    })();

    return () => {
      disposed = true;
      try { if (cy) cy.destroy(); } catch (_) {}
      cyRef.current = null;
      layoutRanRef.current = false;
    };
    // Re-mount per repo so a navigation between two repos doesn't reuse the
    // previous repo's cytoscape instance (and stale layout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoHash]);

  // Data effect — projection changes only. Layout runs once; subsequent
  // projection changes use 'draft' fcose / non-randomized dagre.
  useEffect(() => {
    renderElements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection]);

  // Highlights effect — class toggle only, never touches layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes('.highlighted').forEach((n) => {
        if (!highlights[n.id()]) {
          n.removeClass('highlighted');
          n.data('hlColor', 'rgba(0,0,0,0)');
        }
      });
      Object.entries(highlights).forEach(([id, color]) => {
        const n = cy.getElementById(id);
        if (n && n.length) {
          n.data('hlColor', color);
          n.addClass('highlighted');
        }
      });
    });
  }, [highlights]);

  function renderElements() {
    const cy = cyRef.current;
    if (!cy) return;

    const nodes = (projection.nodes || []).map((n) => {
      const sk = (n.metadata && n.metadata.symbol_kind) || 'default';
      return {
        data: {
          id: n.id,
          label: n.label,
          color: KIND_COLORS[sk] || KIND_COLORS.default,
          borderColor: 'rgba(0,0,0,0)',
          borderWidth: 0,
          hlColor: 'rgba(0,0,0,0)',
          raw: n,
        },
      };
    });

    const edges = (projection.edges || []).map((e, i) => {
      const sensitivity = e.metadata && e.metadata.sensitivity ? e.metadata.sensitivity : null;
      const weight = typeof e.weight === 'number' ? e.weight : 1.0;
      return {
        data: {
          id: `e${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          color: sensitivityColor(sensitivity),
          width: 1 + Math.min(weight, 3),
          sensitivity,
          raw: e,
        },
      };
    });

    cy.batch(() => {
      cy.elements().remove();
      cy.add([...nodes, ...edges]);
    });

    if (!nodes.length) {
      layoutRanRef.current = false;
      return;
    }

    // Approximate Sankey: dagre LR if available, else horizontal cose.
    // Don't randomize on subsequent runs so updates don't re-shuffle the layout.
    const fresh = !layoutRanRef.current;
    const layoutOpts = cy._useDagre
      ? { name: 'dagre', rankDir: 'LR', animate: false, nodeSep: 30, rankSep: 80 }
      : { name: 'cose', animate: false, randomize: fresh };
    try {
      cy.layout(layoutOpts).run();
      layoutRanRef.current = true;
    } catch (_) {
      try { cy.layout({ name: 'cose', animate: false }).run(); } catch (__) {}
    }
  }

  const empty = !projection.nodes || projection.nodes.length === 0;

  return (
    <div className="flow-view">
      <div ref={containerRef} className="cy-container" />
      {selected && (
        <div className="inspector">
          <button className="close" onClick={() => setSelected(null)}>×</button>
          <h4>{selected.label}</h4>
          <p className="kind">{(selected.metadata && selected.metadata.symbol_kind) || 'flow node'}</p>
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
          <h5>Flows touching this symbol</h5>
          <FlowsList
            flows={flowsBySymbol[selected.id] || []}
            labelOf={(id) => nodeLabelById[id] || id}
          />
        </div>
      )}
      {empty && (
        <div className="empty-overlay">
          <p>Layer 2 not built yet — run indexing</p>
          <small>Data-flow Sankey appears once Layer Two completes.</small>
        </div>
      )}
      <Legend />
      <style jsx>{`
        .flow-view { position: relative; width: 100%; height: 100%; }
        .cy-container { position: absolute; inset: 0; background: #0b1220; }
        .inspector {
          position: absolute; top: 1rem; left: 1rem; max-width: 360px;
          background: rgba(17, 24, 39, 0.97);
          border: 1px solid #1f2937;
          border-radius: 0.5rem;
          padding: 0.85rem;
          color: #e2e8f0;
          font-size: 0.85rem;
          max-height: calc(100% - 2rem);
          overflow-y: auto;
        }
        .inspector h4 { margin: 0 0 0.25rem; }
        .inspector h5 { margin: 0.75rem 0 0.4rem; font-size: 0.7rem; text-transform: uppercase; color: #93c5fd; letter-spacing: 0.05em; }
        .inspector .kind { margin: 0 0 0.5rem; color: #93c5fd; font-size: 0.7rem; text-transform: uppercase; }
        .inspector pre { background: #0f172a; padding: 0.5rem; border-radius: 0.4rem; overflow: auto; font-size: 0.75rem; }
        .inspector .loc { color: #94a3b8; font-size: 0.75rem; }
        .inspector .close { position: absolute; top: 4px; right: 8px; background: none; border: 0; color: #94a3b8; font-size: 1.1rem; cursor: pointer; }
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

function FlowsList({ flows, labelOf }) {
  if (!flows.length) return <p className="muted">No flows traverse this symbol.</p>;
  return (
    <ul className="flows">
      {flows.slice(0, 25).map((f, i) => (
        <li key={i}>
          <span className="src">{labelOf(f.source)}</span>
          <span className="arrow">→</span>
          <span className="tgt">{labelOf(f.target)}</span>
          {f.sensitivity && (
            <span className="tag" style={{ background: sensitivityColor(f.sensitivity) }}>
              {f.sensitivity}
            </span>
          )}
        </li>
      ))}
      {flows.length > 25 && (
        <li className="muted">+{flows.length - 25} more…</li>
      )}
      <style jsx>{`
        .flows { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
        .flows li {
          display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
          background: #0f172a; padding: 0.35rem 0.5rem; border-radius: 0.35rem;
          font-size: 0.75rem;
        }
        .src, .tgt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #cbd5e1; }
        .arrow { color: #475569; }
        .tag {
          color: white; font-size: 0.65rem; padding: 0.1rem 0.45rem;
          border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .muted { color: #64748b; font-size: 0.75rem; }
      `}</style>
    </ul>
  );
}

function Legend() {
  return (
    <div className="legend">
      <div><span className="dot" style={{ background: SENSITIVITY_COLORS.password }} /> password</div>
      <div><span className="dot" style={{ background: SENSITIVITY_COLORS.token }} /> token</div>
      <div><span className="dot" style={{ background: SENSITIVITY_COLORS.ssn }} /> ssn</div>
      <div><span className="dot" style={{ background: SENSITIVITY_COLORS.default }} /> generic</div>
      <style jsx>{`
        .legend {
          position: absolute; bottom: 0.75rem; right: 0.75rem;
          background: rgba(17, 24, 39, 0.92);
          border: 1px solid #1f2937;
          border-radius: 0.4rem;
          padding: 0.4rem 0.6rem;
          font-size: 0.7rem; color: #cbd5e1;
          display: flex; gap: 0.75rem; align-items: center;
        }
        .legend > div { display: flex; align-items: center; gap: 0.3rem; }
        .dot { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
      `}</style>
    </div>
  );
}
