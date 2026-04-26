'use client';
// UML-style diagram renderer for any subset of the system hierarchy.
//
// Class nodes render as a three-compartment rectangle (name / attributes /
// methods). Higher-level grouping nodes (tier, layer, context, package)
// render as a single labeled container box. Edges are drawn with UML
// notation per kind, and the layout is layered (topological) so dependency
// arrows flow consistently top-to-bottom or left-to-right.

import { useMemo } from 'react';
import type { AnyNode, ClassNode } from './systemHierarchy';

export type UmlEdgeKind =
  | 'association'   // solid line, no head
  | 'aggregation'   // solid line, hollow diamond at the source
  | 'composition'   // solid line, filled diamond at the source
  | 'inheritance'   // solid line, hollow triangle at the target
  | 'realization'   // dashed line, hollow triangle at the target
  | 'dependency';   // dashed line, open arrow at the target

export interface UmlEdge {
  source: string;
  target: string;
  kind: UmlEdgeKind;
  label?: string;
}

interface UmlDiagramProps {
  nodes: AnyNode[];
  /** Optional explicit edge list. If omitted, edges are derived from each
   *  node's `dependencies` field and rendered as `dependency` (dashed). */
  edges?: UmlEdge[];
  direction?: 'TB' | 'LR';
  className?: string;
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

const CLASS_W = 200;
const CLASS_HEADER_H = 30;
const COMPARTMENT_PAD = 8;
const ROW_H = 16;
const GROUP_W = 220;
const GROUP_H = 64;
const COL_GAP = 80;
const ROW_GAP = 40;

function classHeight(n: ClassNode): number {
  const attrs = Math.max(n.attributes.length, 1);
  const methods = Math.max(n.methods.length, 1);
  return (
    CLASS_HEADER_H +
    COMPARTMENT_PAD * 2 + attrs * ROW_H +
    COMPARTMENT_PAD * 2 + methods * ROW_H
  );
}

function nodeSize(n: AnyNode): { w: number; h: number } {
  return n.kind === 'class'
    ? { w: CLASS_W, h: classHeight(n) }
    : { w: GROUP_W, h: GROUP_H };
}

// ---------------------------------------------------------------------------
// Layered topological layout. Returns absolute positions for every node.
// ---------------------------------------------------------------------------

interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
}

function layeredLayout(
  nodes: AnyNode[],
  edges: UmlEdge[],
  direction: 'TB' | 'LR',
): Map<string, Placement> {
  const ids = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    if (e.source === e.target) continue;
    adj.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  // Longest-path Kahn — sources land in layer 0; sinks land deepest.
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
    for (const tgt of adj.get(id) ?? []) {
      layer.set(tgt, Math.max(layer.get(tgt) ?? 0, cur + 1));
      const next = (inDeg.get(tgt) ?? 1) - 1;
      inDeg.set(tgt, next);
      if (next === 0) queue.push(tgt);
    }
  }
  // Cycle survivors: pin to deepest layer + 1.
  let deepest = 0;
  for (const v of layer.values()) deepest = Math.max(deepest, v);
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, deepest + 1);
  }

  // Group by layer.
  const layers = new Map<number, AnyNode[]>();
  for (const n of nodes) {
    const li = layer.get(n.id) ?? 0;
    if (!layers.has(li)) layers.set(li, []);
    layers.get(li)!.push(n);
  }
  // Stable order within layers — alphabetical for determinism.
  for (const list of layers.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }

  // Absolute placement. In LR, layer index drives x; in TB it drives y.
  const out = new Map<string, Placement>();
  const sortedKeys = [...layers.keys()].sort((a, b) => a - b);

  if (direction === 'LR') {
    let cursorX = 40;
    for (const li of sortedKeys) {
      const list = layers.get(li)!;
      // Compute total height of this column.
      const sizes = list.map(nodeSize);
      const totalH = sizes.reduce((s, sz) => s + sz.h, 0) + (list.length - 1) * ROW_GAP;
      let y = 40 + (totalH < 600 ? (600 - totalH) / 2 : 0);
      let maxW = 0;
      list.forEach((n, i) => {
        const sz = sizes[i];
        out.set(n.id, { x: cursorX, y, w: sz.w, h: sz.h, layer: li });
        y += sz.h + ROW_GAP;
        maxW = Math.max(maxW, sz.w);
      });
      cursorX += maxW + COL_GAP;
    }
  } else {
    let cursorY = 40;
    for (const li of sortedKeys) {
      const list = layers.get(li)!;
      const sizes = list.map(nodeSize);
      const totalW = sizes.reduce((s, sz) => s + sz.w, 0) + (list.length - 1) * COL_GAP;
      let x = 40 + (totalW < 1000 ? (1000 - totalW) / 2 : 0);
      let maxH = 0;
      list.forEach((n, i) => {
        const sz = sizes[i];
        out.set(n.id, { x, y: cursorY, w: sz.w, h: sz.h, layer: li });
        x += sz.w + COL_GAP;
        maxH = Math.max(maxH, sz.h);
      });
      cursorY += maxH + ROW_GAP;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Edge geometry — find the nearest border points on source/target so the
// connector lands on the rectangle edge instead of behind the box.
// ---------------------------------------------------------------------------

function borderPoint(box: Placement, towards: { x: number; y: number }) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  // Scale to the edge of the rectangle.
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

// ---------------------------------------------------------------------------
// UML edge style descriptors (dash + which marker on which end).
// ---------------------------------------------------------------------------

interface EdgeStyle {
  dashArray?: string;
  startMarker?: string; // marker-start url
  endMarker?: string;   // marker-end url
}

const EDGE_STYLES: Record<UmlEdgeKind, EdgeStyle> = {
  association: {},
  aggregation: { startMarker: 'url(#uml-diamond-hollow)' },
  composition: { startMarker: 'url(#uml-diamond-filled)' },
  inheritance: { endMarker: 'url(#uml-triangle-hollow)' },
  realization: { dashArray: '6 4', endMarker: 'url(#uml-triangle-hollow)' },
  dependency:  { dashArray: '6 4', endMarker: 'url(#uml-arrow-open)' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const STEREOTYPE_ACCENT: Record<string, string> = {
  view:             '#a78bfa',
  controller:       '#60a5fa',
  service:          '#34d399',
  repository:       '#fbbf24',
  gateway:          '#f97316',
  entity:           '#94a3b8',
  'value-object':   '#94a3b8',
  'aggregate-root': '#fb7185',
};

export function UmlDiagram({
  nodes,
  edges,
  direction = 'LR',
  className,
}: UmlDiagramProps) {
  const visibleIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  const allEdges = useMemo<UmlEdge[]>(() => {
    if (edges && edges.length > 0) {
      return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    }
    // Default: derive dependency edges from each node's `dependencies` array.
    const out: UmlEdge[] = [];
    for (const n of nodes) {
      for (const dep of n.dependencies ?? []) {
        if (visibleIds.has(dep)) {
          out.push({ source: n.id, target: dep, kind: 'dependency' });
        }
      }
    }
    return out;
  }, [edges, nodes, visibleIds]);

  const positions = useMemo(
    () => layeredLayout(nodes, allEdges, direction),
    [nodes, allEdges, direction],
  );

  // Compute viewBox so the SVG fits all nodes with margin.
  const { vbW, vbH } = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const p of positions.values()) {
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }
    return { vbW: maxX + 40, vbH: maxY + 40 };
  }, [positions]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${vbW} ${vbH}`}
      style={{ width: '100%', height: '100%', background: '#1a1a1a' }}
      role="img"
      aria-label="UML class diagram"
    >
      <defs>
        {/* Hollow triangle (inheritance / realization) */}
        <marker
          id="uml-triangle-hollow"
          viewBox="0 0 14 14"
          refX="13"
          refY="7"
          markerWidth="14"
          markerHeight="14"
          orient="auto-start-reverse"
        >
          <polygon points="0,0 13,7 0,14" fill="#1a1a1a" stroke="#cbd5f5" strokeWidth="1.5" />
        </marker>
        {/* Hollow diamond (aggregation) */}
        <marker
          id="uml-diamond-hollow"
          viewBox="0 0 16 12"
          refX="1"
          refY="6"
          markerWidth="16"
          markerHeight="12"
          orient="auto"
        >
          <polygon points="1,6 8,1 15,6 8,11" fill="#1a1a1a" stroke="#cbd5f5" strokeWidth="1.5" />
        </marker>
        {/* Filled diamond (composition) */}
        <marker
          id="uml-diamond-filled"
          viewBox="0 0 16 12"
          refX="1"
          refY="6"
          markerWidth="16"
          markerHeight="12"
          orient="auto"
        >
          <polygon points="1,6 8,1 15,6 8,11" fill="#cbd5f5" stroke="#cbd5f5" strokeWidth="1.5" />
        </marker>
        {/* Open arrow (dependency / standard) */}
        <marker
          id="uml-arrow-open"
          viewBox="0 0 12 10"
          refX="11"
          refY="5"
          markerWidth="12"
          markerHeight="10"
          orient="auto-start-reverse"
        >
          <polyline points="0,0 11,5 0,10" fill="none" stroke="#cbd5f5" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* Edges */}
      <g>
        {allEdges.map((e, i) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          const aCenter = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
          const bCenter = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          const start = borderPoint(a, bCenter);
          const end = borderPoint(b, aCenter);
          const style = EDGE_STYLES[e.kind];
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;
          return (
            <g key={`edge-${i}`}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="#cbd5f5"
                strokeWidth="1.4"
                strokeDasharray={style.dashArray}
                markerStart={style.startMarker}
                markerEnd={style.endMarker}
              />
              {e.label && (
                <text
                  x={midX}
                  y={midY - 4}
                  fontSize="10"
                  fill="#cbd5f5"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Nodes */}
      <g>
        {nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          if (n.kind === 'class') {
            return <ClassBox key={n.id} node={n} pos={p} />;
          }
          return <GroupBox key={n.id} node={n} pos={p} />;
        })}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Class box — three compartments
// ---------------------------------------------------------------------------

function ClassBox({ node, pos }: { node: ClassNode; pos: Placement }) {
  const accent = STEREOTYPE_ACCENT[node.stereotype] ?? '#cbd5f5';
  const attrsTop = pos.y + CLASS_HEADER_H;
  const attrsHeight = COMPARTMENT_PAD * 2 + Math.max(node.attributes.length, 1) * ROW_H;
  const methodsTop = attrsTop + attrsHeight;
  return (
    <g>
      {/* Outer rectangle */}
      <rect
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={pos.h}
        rx={4}
        fill="#1e1e1e"
        stroke={accent}
        strokeWidth="1.5"
      />
      {/* Header compartment */}
      <rect
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={CLASS_HEADER_H}
        fill={accent + '22'}
        stroke="none"
      />
      <text
        x={pos.x + pos.w / 2}
        y={pos.y + 12}
        fontSize="9"
        fill={accent}
        textAnchor="middle"
        fontFamily="Menlo, Monaco, monospace"
        fontStyle="italic"
      >
        «{node.stereotype}»
      </text>
      <text
        x={pos.x + pos.w / 2}
        y={pos.y + 24}
        fontSize="13"
        fontWeight="700"
        fill="#fff"
        textAnchor="middle"
      >
        {node.name}
      </text>
      {/* Compartment dividers */}
      <line
        x1={pos.x}
        y1={attrsTop}
        x2={pos.x + pos.w}
        y2={attrsTop}
        stroke={accent}
        strokeWidth="1.2"
      />
      <line
        x1={pos.x}
        y1={methodsTop}
        x2={pos.x + pos.w}
        y2={methodsTop}
        stroke={accent}
        strokeWidth="1.2"
      />
      {/* Attributes compartment */}
      {node.attributes.length === 0 && (
        <text
          x={pos.x + COMPARTMENT_PAD}
          y={attrsTop + COMPARTMENT_PAD + 11}
          fontSize="11"
          fill="#6b7280"
          fontFamily="Menlo, Monaco, monospace"
          fontStyle="italic"
        >
          (no attributes)
        </text>
      )}
      {node.attributes.map((a, i) => (
        <text
          key={`a-${i}`}
          x={pos.x + COMPARTMENT_PAD}
          y={attrsTop + COMPARTMENT_PAD + 11 + i * ROW_H}
          fontSize="11"
          fill="#d1d5db"
          fontFamily="Menlo, Monaco, monospace"
        >
          {`+ ${a.name}: ${a.type}`}
        </text>
      ))}
      {/* Methods compartment */}
      {node.methods.length === 0 && (
        <text
          x={pos.x + COMPARTMENT_PAD}
          y={methodsTop + COMPARTMENT_PAD + 11}
          fontSize="11"
          fill="#6b7280"
          fontFamily="Menlo, Monaco, monospace"
          fontStyle="italic"
        >
          (no methods)
        </text>
      )}
      {node.methods.map((m, i) => (
        <text
          key={`m-${i}`}
          x={pos.x + COMPARTMENT_PAD}
          y={methodsTop + COMPARTMENT_PAD + 11 + i * ROW_H}
          fontSize="11"
          fill="#86efac"
          fontFamily="Menlo, Monaco, monospace"
        >
          {`+ ${m.signature}: ${m.returns}`}
        </text>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Group box — one labeled container for tier / layer / context / package
// ---------------------------------------------------------------------------

const GROUP_LABEL: Record<Exclude<AnyNode['kind'], 'class'>, string> = {
  tier: 'tier',
  layer: 'layer',
  context: 'context',
  package: 'package',
};

function GroupBox({
  node,
  pos,
}: {
  node: Exclude<AnyNode, ClassNode>;
  pos: Placement;
}) {
  const stereotypeLabel = `«${GROUP_LABEL[node.kind]}»`;
  return (
    <g>
      <rect
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={pos.h}
        rx={6}
        fill="#252526"
        stroke="#5b6170"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <text
        x={pos.x + pos.w / 2}
        y={pos.y + 22}
        fontSize="10"
        fill="#94a3b8"
        textAnchor="middle"
        fontStyle="italic"
        fontFamily="Menlo, Monaco, monospace"
      >
        {stereotypeLabel}
      </text>
      <text
        x={pos.x + pos.w / 2}
        y={pos.y + 44}
        fontSize="14"
        fontWeight="700"
        fill="#fff"
        textAnchor="middle"
      >
        {node.name}
      </text>
    </g>
  );
}
