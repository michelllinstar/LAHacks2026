import { useEffect, useMemo, useRef, useState } from 'react';
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

const EMPTY_LAYER = { nodes: [], edges: [] };
const EMPTY_HIGHLIGHTS = {};

export default function SymbolView({ repoHash }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const layoutRanRef = useRef(false);
  const [selected, setSelected] = useState(null);

  // Narrow selectors so unrelated slice changes don't re-render this view.
  const projection = useGraphStore(
    (s) => (repoHash && s.byRepo[repoHash] && s.byRepo[repoHash].layers.symbol) || EMPTY_LAYER,
  );
  const highlights = useGraphStore(
    (s) => (repoHash && s.byRepo[repoHash] && s.byRepo[repoHash].highlights) || EMPTY_HIGHLIGHTS,
  );
  const invariantLayer = useGraphStore(
    (s) => (repoHash && s.byRepo[repoHash] && s.byRepo[repoHash].layers.invariant) || EMPTY_LAYER,
  );

  // Memoize so repeated identical invariant layer references don't rebuild.
  const invariantMap = useMemo(() => buildInvariantMap(invariantLayer), [invariantLayer]);

  // ----- Effect 1: cytoscape mount + projection diff. Layout only on data change.
  useEffect(() => {
    let cy;
    let disposed = false;
    layoutRanRef.current = false;

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
            selector: 'node.highlighted',
            style: {
              'border-width': 4,
              'border-color': 'data(hlColor)',
            },
          },
          {
            selector: 'node.has-invariants',
            style: {
              'border-width': 3,
              'border-color': 'data(invBorderColor)',
            },
          },
          {
            selector: 'node.invariant-badge',
            style: {
              'background-color': 'data(badgeColor)',
              'label': 'data(label)',
              'color': '#0b1220',
              'font-size': 8,
              'font-weight': 'bold',
              'text-valign': 'center',
              'text-halign': 'center',
              'text-margin-y': 0,
              'width': 12,
              'height': 12,
              'shape': 'round-rectangle',
              'border-width': 1,
              'border-color': '#0b1220',
              'events': 'no',
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
        if (data && data.raw) setSelected(data.raw);
      });
      cy.on('tap', (evt) => {
        if (evt.target === cy) setSelected(null);
      });

      cyRef.current = cy;
      applyProjection();
    })();

    return () => {
      disposed = true;
      try { if (cy) cy.destroy(); } catch (_) {}
      cyRef.current = null;
      layoutRanRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoHash]);

  // Re-apply projection on data change. We keep the simpler "remove all + add"
  // strategy but only run a fresh layout once; subsequent changes use a
  // 'draft' fcose pass which is much cheaper than the initial 'default' run.
  useEffect(() => {
    applyProjection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection]);

  // ----- Effect 2: highlights. Toggle a class — never touches layout.
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

  // ----- Effect 3: invariant badges. Diff the desired badge set.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const desired = {}; // id -> { color, label, sourceId }
    Object.entries(invariantMap).forEach(([symId, info]) => {
      if (!cy.getElementById(symId).length) return;
      desired[`inv-badge-${symId}`] = {
        color: confidenceColor(info.max_confidence),
        label: String(info.count),
        sourceId: symId,
      };
    });

    cy.batch(() => {
      // Remove orphaned badges and their links.
      cy.nodes('.invariant-badge').forEach((n) => {
        if (!desired[n.id()]) {
          cy.getElementById(`inv-link-${n.data('sourceId')}`).remove();
          n.remove();
        }
      });
      // Add or update existing badges.
      Object.entries(desired).forEach(([id, info]) => {
        const existing = cy.getElementById(id);
        if (existing.length) {
          existing.data('badgeColor', info.color);
          existing.data('label', info.label);
          return;
        }
        cy.add({
          group: 'nodes',
          data: {
            id,
            label: info.label,
            badgeColor: info.color,
            sourceId: info.sourceId,
          },
          classes: 'invariant-badge',
        });
        cy.add({
          group: 'edges',
          data: {
            id: `inv-link-${info.sourceId}`,
            source: info.sourceId,
            target: id,
            color: 'rgba(0,0,0,0)',
          },
        });
      });

      // Update has-invariants class on the underlying symbol nodes.
      cy.nodes().forEach((n) => {
        if (n.hasClass('invariant-badge')) return;
        const inv = invariantMap[n.id()];
        if (inv) {
          n.data('invBorderColor', confidenceColor(inv.max_confidence));
          n.addClass('has-invariants');
        } else {
          n.removeClass('has-invariants');
        }
      });
    });
  }, [invariantMap]);

  function applyProjection() {
    const cy = cyRef.current;
    if (!cy) return;

    const nodes = (projection.nodes || []).map((n) => {
      const kind = (n.metadata && n.metadata.kind) || 'default';
      return {
        data: {
          id: n.id,
          label: n.label,
          color: KIND_COLORS[kind] || KIND_COLORS.default,
          borderColor: 'rgba(0,0,0,0)',
          borderWidth: 0,
          hlColor: 'rgba(0,0,0,0)',
          invBorderColor: 'rgba(0,0,0,0)',
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

    if (!nodes.length) {
      layoutRanRef.current = false;
      return;
    }

    const layoutName = cy.layout && cy.extension && cy.extension('layout', 'fcose') ? 'fcose' : 'cose';
    try {
      cy.layout({
        name: layoutName,
        animate: false,
        randomize: !layoutRanRef.current,
        quality: layoutRanRef.current ? 'draft' : 'default',
      }).run();
      layoutRanRef.current = true;
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
          {invariantMap[selected.id] && (
            <div className="inv-section">
              <h5>
                Invariants
                <span
                  className="inv-count"
                  style={{ background: confidenceColor(invariantMap[selected.id].max_confidence) }}
                >
                  {invariantMap[selected.id].count}
                </span>
              </h5>
              <ul>
                {invariantMap[selected.id].items.map((inv, i) => {
                  const md = inv.metadata || {};
                  const conf = md.confidence;
                  const text = md.text || inv.label || '(invariant)';
                  const sk = md.source_kind || 'unknown';
                  return (
                    <li key={i}>
                      <span className="src">{sk}</span>
                      {conf != null && (
                        <span className="conf" style={{ color: confidenceColor(conf) }}>
                          {Number(conf).toFixed(2)}
                        </span>
                      )}
                      <span className="text">{text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {selected.metadata && Object.keys(selected.metadata).length > 0 && (
            <details>
              <summary>metadata</summary>
              <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
      {Object.keys(invariantMap).length > 0 && (
        <div className="inv-legend">
          <span className="title">Invariant confidence</span>
          <span className="dot" style={{ background: '#34d399' }} /> ≥ 0.8
          <span className="dot" style={{ background: '#fbbf24' }} /> ≥ 0.5
          <span className="dot" style={{ background: '#f87171' }} /> &lt; 0.5
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
        .inspector .inv-section { margin-top: 0.6rem; }
        .inspector .inv-section h5 {
          margin: 0 0 0.3rem; display: flex; align-items: center; gap: 0.4rem;
          font-size: 0.78rem; text-transform: uppercase; color: #cbd5e1;
        }
        .inspector .inv-count {
          color: #0b1220; padding: 0.05rem 0.4rem; border-radius: 999px;
          font-weight: 700; font-size: 0.7rem;
        }
        .inspector .inv-section ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
        .inspector .inv-section li {
          display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: baseline;
          background: #0f172a; padding: 0.3rem 0.45rem; border-radius: 0.3rem;
          font-size: 0.72rem;
        }
        .inspector .inv-section .src {
          color: #94a3b8; text-transform: uppercase; font-size: 0.62rem;
          background: #1f2937; padding: 0.05rem 0.4rem; border-radius: 999px;
        }
        .inspector .inv-section .conf { font-weight: 700; }
        .inspector .inv-section .text { flex: 1 1 100%; color: #e2e8f0; }
        .empty-overlay {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          color: #64748b; pointer-events: none;
        }
        .inv-legend {
          position: absolute; bottom: 0.75rem; right: 0.75rem;
          background: rgba(17, 24, 39, 0.9);
          border: 1px solid #1f2937; border-radius: 0.4rem;
          padding: 0.35rem 0.6rem; font-size: 0.7rem; color: #cbd5e1;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .inv-legend .title { color: #94a3b8; margin-right: 0.4rem; }
        .inv-legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 999px; margin-right: 2px; }
      `}</style>
    </div>
  );
}

function confidenceColor(c) {
  if (c == null) return '#94a3b8';
  if (c >= 0.8) return '#34d399';
  if (c >= 0.5) return '#fbbf24';
  return '#f87171';
}

// Walk invariant layer and build symbol_id -> { count, max_confidence, source_kinds, items }
function buildInvariantMap(layer) {
  const result = {};
  if (!layer || !layer.nodes) return result;
  const nodesById = {};
  layer.nodes.forEach((n) => { nodesById[n.id] = n; });

  // Strategy 1: invariant nodes that declare their target via metadata.target_symbol
  layer.nodes.forEach((n) => {
    const md = n.metadata || {};
    const target = md.target_symbol || md.target || null;
    if (target) attach(result, target, n);
  });

  // Strategy 2: edges (invariant_node -> symbol_id) or (symbol_id -> invariant_node)
  (layer.edges || []).forEach((e) => {
    const src = nodesById[e.source];
    const tgt = nodesById[e.target];
    // Edge between an invariant node and a symbol id (which may or may not be a node here)
    if (src && (src.kind === 'invariant' || (src.metadata && src.metadata.kind === 'invariant'))) {
      attach(result, e.target, src);
    } else if (tgt && (tgt.kind === 'invariant' || (tgt.metadata && tgt.metadata.kind === 'invariant'))) {
      attach(result, e.source, tgt);
    } else if (src && !tgt) {
      // Treat unresolved edge target as a symbol id
      attach(result, e.target, src);
    } else if (tgt && !src) {
      attach(result, e.source, tgt);
    }
  });

  return result;
}

function attach(map, symbolId, invNode) {
  if (!symbolId || !invNode) return;
  const md = invNode.metadata || {};
  const conf = typeof md.confidence === 'number' ? md.confidence : null;
  const sk = md.source_kind || 'unknown';
  if (!map[symbolId]) {
    map[symbolId] = { count: 0, max_confidence: null, source_kinds: [], items: [] };
  }
  // de-dupe identical invariant nodes
  if (map[symbolId].items.some((x) => x.id === invNode.id)) return;
  map[symbolId].count += 1;
  map[symbolId].items.push(invNode);
  if (conf != null && (map[symbolId].max_confidence == null || conf > map[symbolId].max_confidence)) {
    map[symbolId].max_confidence = conf;
  }
  if (!map[symbolId].source_kinds.includes(sk)) {
    map[symbolId].source_kinds.push(sk);
  }
}
