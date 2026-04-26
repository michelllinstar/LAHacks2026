'use client';
//
// ContextsView — bounded-context diagram for the active layer.
//
// Renders ONLY:
//   1. Context boxes (containers, not class rectangles).
//   2. Inter-context dashed dependency arrows.
//   3. Size badges (class / package counts) on each box.
//   4. Cross-layer stub arrows at the diagram edge (annotated with the
//      destination layer/external group) when a context depends on something
//      outside the current view.
//   5. Optional vocabulary callouts (top 2-3 class names per context).
//
// Excludes: individual classes, methods, packages, and other layers — all of
// which live at different levels of the hierarchy.
//
// Layout: longest-path topological sort, columns flow left → right with
// upstream contexts (depended on by nothing) on the left and downstream
// contexts (depending on many) on the right. Within a column, contexts are
// sorted alphabetically.
//
import { useMemo, useRef, useState } from 'react';
import { useCartographerStore } from '../../../lib/store';

interface ContextsViewProps {
  repositoryId: string;
  /** Drill into the clicked context — workspace advances viewLevel by one
   *  step (Contexts → Packages) and pushes the context name onto focusPath. */
  onContextFocus?: (contextName: string) => void;
}

interface Context {
  id: string;
  name: string;
  classCount: number;
  packageCount: number;
  terms: string[];
}

interface ContextEdge {
  source: string;
  target: string;
  count: number;
}

interface ExternalEdge {
  source: string;
  targetGroup: string; // destination layer / external bucket
  side: 'left' | 'right' | 'top' | 'bottom';
}

const BOX_W = 260;
const BOX_H = 170;
const COL_GAP = 110;
const ROW_GAP = 40;
const PAD = 80;

// Treat Layer-1 cluster ids that look like *.repository / *.controllers as
// belonging to a different layer for the cross-layer stub annotation.
function classifyLayer(clusterId: string): string {
  const c = clusterId.toLowerCase();
  if (/(repository|repo|dao|persistence|store|model|orm|migration)/.test(c)) return 'Persistence layer';
  if (/(api|controller|router|handler|http|rest|graphql)/.test(c)) return 'API layer';
  if (/(view|component|page|ui|client)/.test(c)) return 'Presentation layer';
  if (/(infra|gateway|adapter)/.test(c)) return 'Infrastructure layer';
  return 'External';
}

export function ContextsView({ repositoryId, onContextFocus }: ContextsViewProps) {
  const projection = useCartographerStore((s) => s.byRepo[repositoryId]?.graphs.symbol);

  const { contexts, edges, externals } = useMemo(() => {
    if (!projection) {
      return { contexts: [] as Context[], edges: [] as ContextEdge[], externals: [] as ExternalEdge[] };
    }

    const idToCluster = new Map<string, string>();
    const clusterNodes = new Map<string, typeof projection.nodes>();
    for (const n of projection.nodes) {
      const cid =
        (n.metadata?.cluster_id as string | undefined) ??
        (n.metadata?.cluster as string | undefined) ??
        'Unclustered';
      idToCluster.set(n.id, cid);
      const list = clusterNodes.get(cid) ?? [];
      list.push(n);
      clusterNodes.set(cid, list);
    }

    const ctxs: Context[] = [];
    for (const [cid, nodes] of clusterNodes) {
      const classNodes = nodes.filter((n) => {
        const k = ((n.metadata?.symbol_kind as string | undefined) ?? n.kind ?? '').toLowerCase();
        return k === 'class' || k === 'interface' || k === 'type';
      });
      const packages = new Set<string>();
      for (const n of nodes) {
        const fp = n.metadata?.file_path as string | undefined;
        if (fp) {
          const dir = fp.split('/').slice(0, -1).join('/');
          if (dir) packages.add(dir);
        }
      }
      const terms = (classNodes.length ? classNodes : nodes)
        .slice(0, 3)
        .map((n) => n.label.split('.').pop() ?? n.label);
      ctxs.push({
        id: cid,
        name: cid,
        classCount: classNodes.length,
        packageCount: packages.size,
        terms,
      });
    }

    // Aggregate cross-cluster symbol edges into inter-context edges.
    const edgeMap = new Map<string, number>();
    const externalMap = new Map<string, ExternalEdge>();
    for (const e of projection.edges) {
      const s = idToCluster.get(e.source);
      if (!s) continue;
      const t = idToCluster.get(e.target);
      if (!t) {
        // Target not part of this view — emit as a cross-layer stub.
        const key = `${s}=>__ext__`;
        if (!externalMap.has(key)) {
          externalMap.set(key, {
            source: s,
            targetGroup: classifyLayer(s),
            side: 'right',
          });
        }
        continue;
      }
      if (s === t) continue;
      const key = `${s}=>${t}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
    const eds: ContextEdge[] = Array.from(edgeMap, ([k, count]) => {
      const [source, target] = k.split('=>');
      return { source, target, count };
    });

    return { contexts: ctxs, edges: eds, externals: Array.from(externalMap.values()) };
  }, [projection]);

  // Longest-path topological layering — column index per context.
  const layout = useMemo(() => {
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const c of contexts) {
      adj.set(c.id, []);
      inDeg.set(c.id, 0);
    }
    for (const e of edges) {
      if (!adj.has(e.source) || !adj.has(e.target)) continue;
      adj.get(e.source)!.push(e.target);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }

    const layer = new Map<string, number>();
    const queue: string[] = [];
    for (const [id, d] of inDeg) if (d === 0) {
      queue.push(id);
      layer.set(id, 0);
    }
    let qi = 0;
    while (qi < queue.length) {
      const id = queue[qi++];
      const cur = layer.get(id) ?? 0;
      for (const t of adj.get(id) ?? []) {
        layer.set(t, Math.max(layer.get(t) ?? 0, cur + 1));
        const remaining = (inDeg.get(t) ?? 0) - 1;
        inDeg.set(t, remaining);
        if (remaining === 0) queue.push(t);
      }
    }
    let max = 0;
    for (const v of layer.values()) max = Math.max(max, v);
    for (const c of contexts) if (!layer.has(c.id)) layer.set(c.id, max + 1);

    const byCol = new Map<number, Context[]>();
    for (const c of contexts) {
      const col = layer.get(c.id) ?? 0;
      const arr = byCol.get(col) ?? [];
      arr.push(c);
      byCol.set(col, arr);
    }
    for (const [, list] of byCol) {
      list.sort((a, b) => b.classCount - a.classCount || a.name.localeCompare(b.name));
    }

    const sortedCols = [...byCol.keys()].sort((x, y) => x - y);
    const tallest = Math.max(1, ...sortedCols.map((c) => byCol.get(c)!.length));
    const totalW = sortedCols.length * (BOX_W + COL_GAP) + PAD * 2;
    const totalH = tallest * (BOX_H + ROW_GAP) + PAD * 2;

    const positions = new Map<string, { x: number; y: number }>();
    sortedCols.forEach((col, idx) => {
      const list = byCol.get(col)!;
      const colHeight = list.length * (BOX_H + ROW_GAP) - ROW_GAP;
      const yStart = (totalH - colHeight) / 2;
      list.forEach((c, i) => {
        positions.set(c.id, {
          x: PAD + idx * (BOX_W + COL_GAP),
          y: yStart + i * (BOX_H + ROW_GAP),
        });
      });
    });

    return { positions, totalW: Math.max(totalW, 800), totalH: Math.max(totalH, 600) };
  }, [contexts, edges]);

  // Tint per context — a stable hashed hue so the same context keeps the same
  // colour every render, and zooming into Packages/Classes can re-use it.
  const tintFor = (id: string): string => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue}deg 35% 22%)`;
  };

  if (contexts.length === 0) {
    return <EmptyContextsExample />;
  }

  const { positions, totalW, totalH } = layout;

  // Click-and-drag panning over the scroll container — pressing on empty
  // canvas (anywhere outside a context box) lets the user grab the diagram
  // and pull it around. Box clicks still fire because we ignore presses that
  // land on a [role="button"] descendant.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const onScrollMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[role="button"]') || target.closest('button')) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setIsDragging(true);
  };
  const onScrollMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el) return;
    el.scrollLeft = drag.scrollLeft - (e.clientX - drag.startX);
    el.scrollTop = drag.scrollTop - (e.clientY - drag.startY);
  };
  const endDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#1a1a1a]">
      <ContextsHeader />
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto"
      style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: isDragging ? 'none' : 'auto' }}
      onMouseDown={onScrollMouseDown}
      onMouseMove={onScrollMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <div className="relative" style={{ width: totalW, height: totalH, minWidth: '100%', minHeight: '100%' }}>
        <svg
          className="absolute inset-0 pointer-events-none"
          width={totalW}
          height={totalH}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker
              id="ctx-arrow-end"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="4"
              orient="auto"
            >
              <polygon points="0 0, 10 4, 0 8" fill="#cbd5e1" />
            </marker>
            <marker
              id="ctx-arrow-stub"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="4"
              orient="auto"
            >
              <polygon points="0 0, 10 4, 0 8" fill="#B7553A" />
            </marker>
          </defs>

          {/* Inter-context dependency arrows — dashed, count badge on midpoint. */}
          {edges.map((e) => {
            const s = positions.get(e.source);
            const t = positions.get(e.target);
            if (!s || !t) return null;
            const x1 = s.x + BOX_W;
            const y1 = s.y + BOX_H / 2;
            const x2 = t.x;
            const y2 = t.y + BOX_H / 2;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const label = `${e.count}`;
            const labelW = label.length * 6.4 + 14;
            return (
              <g key={`${e.source}-${e.target}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.8"
                  markerEnd="url(#ctx-arrow-end)"
                />
                <rect
                  x={midX - labelW / 2}
                  y={midY - 9}
                  width={labelW}
                  height={18}
                  rx={9}
                  ry={9}
                  fill="#1e1e1e"
                  stroke="#3e3e42"
                  strokeWidth="1"
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="10"
                  fontWeight="600"
                  style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Cross-layer stub arrows — annotated with destination layer. */}
          {externals.map((ext, i) => {
            const s = positions.get(ext.source);
            if (!s) return null;
            const x1 = s.x + BOX_W;
            const y1 = s.y + BOX_H / 2;
            const x2 = totalW - 12;
            const y2 = y1;
            const labelText = `↗ ${ext.targetGroup}`;
            const labelW = labelText.length * 6.4 + 16;
            return (
              <g key={`ext-${ext.source}-${i}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#B7553A"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.85"
                  markerEnd="url(#ctx-arrow-stub)"
                />
                <rect
                  x={x2 - labelW - 4}
                  y={y2 - 11}
                  width={labelW}
                  height={20}
                  rx={10}
                  ry={10}
                  fill="#1e1e1e"
                  stroke="#B7553A"
                  strokeWidth="1"
                />
                <text
                  x={x2 - labelW / 2 - 4}
                  y={y2 + 4}
                  textAnchor="middle"
                  fill="#F5C7B5"
                  fontSize="10"
                  fontWeight="600"
                  style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
                >
                  {labelText}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Context boxes — containers, no class compartments. */}
        {contexts.map((c) => {
          const p = positions.get(c.id);
          if (!p) return null;
          const tint = tintFor(c.id);
          return (
            <div
              key={c.id}
              role={onContextFocus ? 'button' : undefined}
              tabIndex={onContextFocus ? 0 : undefined}
              onClick={() => onContextFocus?.(c.id)}
              onKeyDown={(e) => {
                if (!onContextFocus) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onContextFocus(c.id);
                }
              }}
              title={onContextFocus ? `Drill into ${c.name} — Packages view` : undefined}
              className={`absolute rounded-xl border-2 border-white/20 flex flex-col p-4 shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-all duration-200 ${
                onContextFocus
                  ? 'cursor-pointer hover:border-white/50 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.18),0_18px_60px_rgba(183,85,58,0.30)]'
                  : ''
              }`}
              style={{
                left: p.x,
                top: p.y,
                width: BOX_W,
                height: BOX_H,
                background: `linear-gradient(135deg, ${tint}, #1e1e1e)`,
              }}
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="text-base font-bold text-white truncate" title={c.name}>
                  {c.name}
                </div>
                <span
                  className="px-2 py-0.5 text-[10px] font-semibold bg-white/10 border border-white/20 rounded-full text-white flex-shrink-0"
                  title={`${c.classCount} classes · ${c.packageCount} packages`}
                >
                  {c.classCount}c · {c.packageCount}p
                </span>
              </div>
              <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">
                Vocabulary
              </div>
              <div className="flex flex-wrap gap-1 overflow-hidden">
                {c.terms.length === 0 && (
                  <span className="text-[10px] text-gray-500 italic">no symbols indexed</span>
                )}
                {c.terms.map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 text-[10px] bg-white/[0.04] border border-white/10 rounded text-gray-300 max-w-full truncate"
                    title={t}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex-1" />
              <div className="text-[9px] text-gray-500 italic">bounded context</div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

// Header explaining what bounded contexts are. Always shown at the top of the
// Contexts view so the user sees the canonical definition before reading
// their own contexts.
function ContextsHeader() {
  return (
    <div className="px-5 py-3 border-b border-[#3e3e42] bg-gradient-to-r from-[#252526] to-[#1e1e1e]">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-base font-bold text-white">Bounded contexts</h2>
        <span className="text-[11px] text-gray-500 italic">
          business-domain boundaries within a layer
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed max-w-4xl">
        Contexts group classes that serve the same business concept and share a consistent vocabulary.
        The same word can mean different things in different contexts — e.g.{' '}
        <span className="text-[#FBBF24] font-mono">Customer</span> in{' '}
        <span className="text-[#5EEAD4] font-mono">Ordering</span> carries shipping addresses, while{' '}
        <span className="text-[#FBBF24] font-mono">Customer</span> in{' '}
        <span className="text-[#5EEAD4] font-mono">Identity</span> carries authentication credentials.
        The boundary keeps related classes close and limits the blast radius of a change.
      </p>
    </div>
  );
}

// Example bounded contexts shown when the symbol projection has no cluster
// metadata yet (e.g. on a freshly indexed small repo). Mirrors the canonical
// e-commerce backend example from the doc-string above so the user
// understands what the view is meant to render.
const EXAMPLE_CONTEXTS: { name: string; tone: string; classes: string[]; description: string }[] = [
  {
    name: 'Ordering',
    tone: '#5EEAD4',
    description: 'cart → checkout → fulfillment',
    classes: ['Order', 'Cart', 'LineItem', 'Customer'],
  },
  {
    name: 'Catalog',
    tone: '#34D399',
    description: 'products, prices, search',
    classes: ['Product', 'Variant', 'PriceList', 'Inventory'],
  },
  {
    name: 'Payments',
    tone: '#FBBF24',
    description: 'capture, refund, settlement',
    classes: ['Charge', 'Refund', 'PaymentMethod', 'Receipt'],
  },
  {
    name: 'Shipping',
    tone: '#F59E0B',
    description: 'rate, label, tracking',
    classes: ['Shipment', 'Carrier', 'Address', 'TrackingEvent'],
  },
  {
    name: 'Identity',
    tone: '#A78BFA',
    description: 'auth, sessions, roles',
    classes: ['Customer', 'Session', 'ApiKey', 'Role'],
  },
];

const SHARED_TERMS = ['Customer'];

function EmptyContextsExample() {
  return (
    <div className="w-full h-full flex flex-col bg-[#1a1a1a] overflow-auto">
      <ContextsHeader />
      <div className="flex-1 px-5 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-3">
            Example — service layer of an e-commerce backend
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXAMPLE_CONTEXTS.map((c) => (
              <div
                key={c.name}
                className="rounded-xl p-4 border"
                style={{
                  background: `${c.tone}14`,
                  borderColor: `${c.tone}66`,
                }}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-base font-bold text-white">{c.name}</div>
                  <div className="text-[10px] uppercase tracking-wide italic" style={{ color: c.tone }}>
                    «context»
                  </div>
                </div>
                <div className="text-[11px] text-gray-400 italic mb-3">{c.description}</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.classes.map((cls) => {
                    const isShared = SHARED_TERMS.includes(cls);
                    return (
                      <span
                        key={cls}
                        className="px-2 py-0.5 rounded text-[11px] font-mono"
                        style={
                          isShared
                            ? {
                                background: '#1e1e1e',
                                color: '#FBBF24',
                                border: '1px dashed #FBBF24aa',
                              }
                            : {
                                background: 'rgba(255,255,255,0.04)',
                                color: '#e5e7eb',
                                border: '1px solid rgba(255,255,255,0.10)',
                              }
                        }
                        title={isShared ? 'Same name, different meaning per context' : undefined}
                      >
                        {cls}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 px-4 py-3 rounded-lg border border-[#3e3e42] bg-[#252526] text-[12px] text-gray-300 max-w-4xl">
            <span className="text-[#FBBF24] font-mono">Customer</span> appears in two contexts above —
            in <span className="text-[#5EEAD4]">Ordering</span> it carries shipping addresses, in{' '}
            <span className="text-[#A78BFA]">Identity</span> it carries authentication credentials.
            That ambiguity is fine because the context boundary tells each class which meaning applies.
            Your own contexts will replace this example as soon as the indexer attaches{' '}
            <span className="font-mono">cluster_id</span> metadata to the symbol projection.
          </div>
        </div>
      </div>
    </div>
  );
}
