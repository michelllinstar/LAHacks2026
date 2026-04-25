import { useEffect, useMemo, useRef, useState } from 'react';
import useGraphStore from '../../lib/graphStore';

/**
 * Layer 4 — invariants rendered as a list grouped by target symbol.
 *
 * Each `constrains` edge connects an invariant node (source) to a symbol node
 * (target). We pivot the projection by symbol so the operator sees all
 * invariants attached to a function in one block.
 *
 * Clicking an entry publishes a synthetic `region_highlighted` delta to the
 * store, so when the user switches back to the Symbol tab the constrained
 * symbol lights up.
 */
const EMPTY_LAYER = { nodes: [], edges: [] };

export default function InvariantView({ repoHash }) {
  const projection = useGraphStore(
    (s) => (repoHash && s.byRepo[repoHash] && s.byRepo[repoHash].layers.invariant) || EMPTY_LAYER,
  );
  const applyDelta = useGraphStore((s) => s.applyDelta);

  const groups = useMemo(() => buildGroups(projection), [projection]);
  const [activeKey, setActiveKey] = useState(null);
  const itemRefs = useRef({});

  // Build a flat list of (groupKey, invariantId) pairs for keyboard nav.
  const flat = useMemo(() => {
    const out = [];
    groups.forEach((g) => {
      g.invariants.forEach((inv) => out.push({ key: `${g.symbolId}::${inv.id}`, group: g, inv }));
    });
    return out;
  }, [groups]);

  // Arrow-key navigation through entries. Scoped to the component's container
  // so the listener never swallows the user's global Up/Down (which on some
  // browsers blocks page scroll).
  const containerRef = useRef(null);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    function onKey(e) {
      if (!flat.length) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = (e.target && e.target.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      e.preventDefault();
      const idx = flat.findIndex((f) => f.key === activeKey);
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(flat.length - 1, idx < 0 ? 0 : idx + 1)
        : Math.max(0, idx < 0 ? 0 : idx - 1);
      const next = flat[nextIdx];
      if (next) {
        setActiveKey(next.key);
        const el = itemRefs.current[next.key];
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }
    }
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [flat, activeKey]);

  function handleSelect(group, inv) {
    const key = `${group.symbolId}::${inv.id}`;
    setActiveKey(key);
    if (group.symbolId && repoHash) {
      // Publish a synthetic region highlight so SymbolView lights up the target.
      applyDelta(repoHash, {
        type: 'region_highlighted',
        payload: {
          node_ids: [group.symbolId],
          color: confidenceColor(inv.confidence),
          ttl_ms: 4000,
        },
      });
    }
  }

  if (!groups.length) {
    return (
      <div className="empty">
        <p>Layer 4 not built yet — invariants will appear after indexing</p>
        <small>Each invariant is grouped under the symbol it constrains.</small>
        <style jsx>{`
          .empty {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            width: 100%; height: 100%; gap: 0.4rem; color: #64748b;
          }
          .empty p { margin: 0; font-size: 1.05rem; }
          .empty small { color: #475569; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="inv-view" ref={containerRef} tabIndex={0}>
      <header className="head">
        <h3>Invariants</h3>
        <small>{groups.length} symbols · {flat.length} invariants — use ↑/↓ to navigate</small>
      </header>
      <div className="groups">
        {groups.map((g) => (
          <section key={g.symbolId} className="group">
            <header className="group-head">
              <code className="qname">{g.symbolLabel}</code>
              {g.filePath && <span className="file">{g.filePath}</span>}
              <span className="count">{g.invariants.length}</span>
            </header>
            <ul>
              {g.invariants.map((inv) => {
                const key = `${g.symbolId}::${inv.id}`;
                const active = activeKey === key;
                return (
                  <li
                    key={key}
                    ref={(el) => { itemRefs.current[key] = el; }}
                    className={active ? 'item active' : 'item'}
                    onClick={() => handleSelect(g, inv)}
                  >
                    <div className="row">
                      <ConfidenceBadge value={inv.confidence} />
                      <SourceKindChip kind={inv.sourceKind} />
                      {inv.sourceLocation && (
                        <span className="loc">{inv.sourceLocation}</span>
                      )}
                    </div>
                    <p className="text">{inv.text}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <style jsx>{`
        .inv-view {
          width: 100%; height: 100%; overflow-y: auto;
          padding: 1rem 1.25rem; color: #e2e8f0;
        }
        .head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.75rem; }
        .head h3 { margin: 0; font-size: 1rem; }
        .head small { color: #64748b; }
        .groups { display: flex; flex-direction: column; gap: 1rem; max-width: 920px; }
        .group {
          background: #0f172a; border: 1px solid #1f2937; border-radius: 0.5rem; overflow: hidden;
        }
        .group-head {
          display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
          padding: 0.6rem 0.85rem; background: #111827;
          border-bottom: 1px solid #1f2937;
        }
        .qname {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #93c5fd; font-size: 0.85rem;
        }
        .file { color: #64748b; font-size: 0.75rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .count {
          margin-left: auto;
          background: #1e293b; color: #cbd5e1;
          padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.7rem;
        }
        .group ul { list-style: none; padding: 0; margin: 0; }
        .item {
          padding: 0.55rem 0.85rem;
          border-bottom: 1px solid #1f2937;
          cursor: pointer;
          transition: background 100ms;
        }
        .item:last-child { border-bottom: 0; }
        .item:hover { background: #111827; }
        .item.active { background: #1e293b; box-shadow: inset 3px 0 0 #fbbf24; }
        .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .text { margin: 0.4rem 0 0; font-size: 0.85rem; color: #e2e8f0; line-height: 1.4; }
        .loc {
          color: #64748b; font-size: 0.7rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
      `}</style>
    </div>
  );
}

function buildGroups(projection) {
  const nodes = projection.nodes || [];
  const edges = projection.edges || [];

  const nodeById = {};
  nodes.forEach((n) => { nodeById[n.id] = n; });

  // Group by target symbol id.
  const bySymbol = {};
  edges
    .filter((e) => e.kind === 'constrains')
    .forEach((e) => {
      const invariantNode = nodeById[e.source];
      const symbolNode = nodeById[e.target];
      if (!invariantNode) return;
      const symbolId = e.target;
      if (!bySymbol[symbolId]) {
        bySymbol[symbolId] = {
          symbolId,
          symbolLabel: (symbolNode && symbolNode.label) || (invariantNode.metadata && invariantNode.metadata.target_symbol) || symbolId,
          filePath: symbolNode && symbolNode.metadata && symbolNode.metadata.file_path,
          invariants: [],
        };
      }
      const md = invariantNode.metadata || {};
      bySymbol[symbolId].invariants.push({
        id: invariantNode.id,
        text: md.text || invariantNode.label || '(no text)',
        confidence: typeof md.confidence === 'number'
          ? md.confidence
          : (typeof e.weight === 'number' ? e.weight : 0),
        sourceKind: md.source_kind || (e.metadata && e.metadata.source_kind) || 'unknown',
        sourceLocation: md.source_location || null,
      });
    });

  // Also catch invariant nodes that didn't appear on a `constrains` edge but
  // declared their target in metadata (defensive — shouldn't happen for the
  // current backend but keeps the view robust against partial data).
  nodes
    .filter((n) => n.kind === 'invariant')
    .forEach((n) => {
      const md = n.metadata || {};
      const tgt = md.target_symbol_id;
      if (!tgt) return;
      const already = (bySymbol[tgt] && bySymbol[tgt].invariants.some((i) => i.id === n.id));
      if (already) return;
      if (!bySymbol[tgt]) {
        const symbolNode = nodeById[tgt];
        bySymbol[tgt] = {
          symbolId: tgt,
          symbolLabel: (symbolNode && symbolNode.label) || md.target_symbol || tgt,
          filePath: symbolNode && symbolNode.metadata && symbolNode.metadata.file_path,
          invariants: [],
        };
      }
      bySymbol[tgt].invariants.push({
        id: n.id,
        text: md.text || n.label || '(no text)',
        confidence: typeof md.confidence === 'number' ? md.confidence : 0,
        sourceKind: md.source_kind || 'unknown',
        sourceLocation: md.source_location || null,
      });
    });

  // Sort: groups by name, invariants within group by confidence desc.
  const out = Object.values(bySymbol);
  out.forEach((g) => g.invariants.sort((a, b) => b.confidence - a.confidence));
  out.sort((a, b) => String(a.symbolLabel).localeCompare(String(b.symbolLabel)));
  return out;
}

function confidenceColor(value) {
  const v = Number(value) || 0;
  if (v >= 0.8) return '#34d399';
  if (v >= 0.5) return '#fbbf24';
  return '#f87171';
}

function ConfidenceBadge({ value }) {
  const v = Number(value) || 0;
  const color = confidenceColor(v);
  const pct = Math.round(v * 100);
  return (
    <span className="badge" style={{ background: color }}>
      {pct}%
      <style jsx>{`
        .badge {
          color: #0b1220; font-size: 0.7rem; font-weight: 600;
          padding: 0.1rem 0.45rem; border-radius: 999px;
        }
      `}</style>
    </span>
  );
}

const SOURCE_KIND_COLORS = {
  test: { bg: '#1e3a8a', fg: '#bfdbfe' },
  defensive: { bg: '#7c2d12', fg: '#fed7aa' },
  comment: { bg: '#374151', fg: '#cbd5e1' },
  unknown: { bg: '#1f2937', fg: '#94a3b8' },
};

function SourceKindChip({ kind }) {
  const c = SOURCE_KIND_COLORS[kind] || SOURCE_KIND_COLORS.unknown;
  return (
    <span className="chip" style={{ background: c.bg, color: c.fg }}>
      {kind}
      <style jsx>{`
        .chip {
          font-size: 0.65rem; padding: 0.1rem 0.5rem;
          border-radius: 0.3rem; text-transform: uppercase;
          letter-spacing: 0.04em;
        }
      `}</style>
    </span>
  );
}
