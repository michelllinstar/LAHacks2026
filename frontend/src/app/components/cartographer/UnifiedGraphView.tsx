'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useCartographerStore } from '../../../lib/store';
import type { GraphProjection, LayerName } from '../../../lib/types';

// Pick which projection feeds the unified view based on which graph modes
// are active. Symbol mode is the default base layer; flow/architecture
// override when their own modes are toggled on.
function pickLayer(modes: Set<GraphMode>): LayerName {
  if (modes.has('flow')) return 'flow';
  if (modes.has('architecture')) return 'architecture';
  return 'symbol';
}

// Map a backend symbol-kind string onto the local GraphNode.type discriminator.
// The Layer 1 indexer emits one of: class, function, method, type, variable
// (see backend/indexer/layer1_symbols.py). The graph projection wraps each
// symbol with a constant top-level kind="symbol" and stashes the real kind
// under ``metadata.symbol_kind`` — callers should pass that, not the wire
// node's outer ``kind``.
function mapKind(kind: string | undefined | null): GraphNode['type'] {
  const k = (kind ?? '').toLowerCase();
  if (k === 'class') return 'class';
  if (k === 'interface' || k === 'type') return 'interface';
  // Architecture-layer cluster nodes & module-ish kinds share the orange
  // "module" treatment so the architecture layer reads as a higher tier.
  if (k === 'module' || k === 'file' || k === 'package' || k === 'cluster') return 'module';
  // function, method, variable, arrow_function, anything else → function
  return 'function';
}

// Region returned alongside layout-positioned nodes so the renderer can draw
// a labeled background per file. The (optional) cluster fields drive the
// architecture overlay: each file region is tinted with the colour of the
// Layer 3 cluster the majority of its symbols belong to.
export interface ClusterRegion {
  id: string;                    // file path, or '__unclustered__' for the bucket
  shortName: string;             // basename of the file (or 'OTHER')
  role: string;                  // dirname / full path tooltip
  x: number;                     // top-left of the region (canvas coords)
  y: number;
  w: number;
  h: number;
  nodeCount: number;
  // Architecture overlay metadata (per-file majority cluster).
  clusterId?: string | null;     // majority cluster ObjectId, null when none
  clusterShort?: string | null;  // short tag, e.g. AUTH
  clusterRole?: string | null;   // human-readable role
  mixed?: boolean;               // top cluster < 60% of file's symbols
  mixedClusters?: Array<{ id: string; short: string; count: number }>;
}

const REGION_PAD = 36;
const REGION_HEADER_H = 32;
const UNCLUSTERED_ID = '__unclustered__';

// Stable hash → HSL hue so each cluster gets a consistent accent across
// re-renders. Used by the architecture overlay to tint file regions.
function clusterColor(clusterId: string): string {
  let h = 0;
  for (let i = 0; i < clusterId.length; i++) h = (h * 31 + clusterId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 60%)`;
}

// Hoisted to module scope so both the cluster-grouped layout (early branch)
// and the per-type-grid fallback (later branch) can reference the same
// canonical ordering without TDZ issues.
const TYPE_ORDER: GraphNode['type'][] = ['class', 'interface', 'function', 'module'];

// Group nodes by their legend type (class / interface / function / module /
// variable) and lay each type out in its own grid block. Same-type nodes
// stay visually together so the legend doubles as a cluster map.
function projectionToNodes(
  graph: GraphProjection | undefined,
  cardW: number,
  cardH: number,
): { nodes: GraphNode[]; clusterRegions: ClusterRegion[] } {
  if (!graph) return { nodes: [], clusterRegions: [] };
  const adjacency = new Map<string, string[]>();
  for (const n of graph.nodes) adjacency.set(n.id, []);
  for (const e of graph.edges) {
    const list = adjacency.get(e.source);
    if (list) list.push(e.target);
  }
  const idToName = new Map<string, string>();
  for (const n of graph.nodes) idToName.set(n.id, n.label);

  // UML-style rollup: collapse methods into their owning class so the
  // diagram stops showing function nodes that are really class members.
  // A node is a "method" if either:
  //   - its symbol_kind is "method" (Layer 1 may emit this directly), OR
  //   - its label is "Class.member" and a class with that prefix exists.
  const classByName = new Map<string, typeof graph.nodes[number]>();
  // Also index classes by their bare name (last dotted segment) so we can
  // match methods whose qualified-name path doesn't perfectly align with the
  // class qname (e.g. extra package segments emitted by different language
  // extractors).
  const classByShortName = new Map<string, typeof graph.nodes[number]>();
  for (const n of graph.nodes) {
    const k = mapKind((n.metadata?.symbol_kind as string | undefined) ?? n.kind);
    if (k === 'class') {
      classByName.set(n.label, n);
      const short = n.label.split('.').pop();
      if (short) classByShortName.set(short, n);
    }
  }

  const rolledMethods = new Map<string, string[]>(); // class label → method names
  const absorbed = new Set<string>();                // node ids hidden as members
  // Restricted rollup. Earlier versions also did a greedy dotted-prefix walk
  // that absorbed any free function whose qname segment happened to match a
  // class's bare name (e.g. ``parser.parse`` → some unrelated ``Parser``).
  // That swallowed nodes silently in larger repos, so we now only roll up
  // when the backend explicitly tags a symbol with its parent class, OR when
  // ``symbol_kind`` is literally ``"method"`` AND its label starts with an
  // exact class qname prefix.
  const findParentClass = (n: typeof graph.nodes[number]): { parent: string; memberName: string } | null => {
    // 1. Authoritative metadata field (added by the backend symbol_projection
    //    for symbol_kind == "method").
    const ownerClass = (n.metadata?.parent_class as string | undefined)
      ?? (n.metadata?.class_name as string | undefined);
    if (ownerClass) {
      if (classByName.has(ownerClass)) {
        return { parent: ownerClass, memberName: n.label.startsWith(ownerClass + '.') ? n.label.slice(ownerClass.length + 1) : n.label };
      }
      const short = ownerClass.split('.').pop();
      if (short && classByShortName.has(short)) {
        const parent = classByShortName.get(short)!.label;
        return { parent, memberName: n.label.split('.').pop() ?? n.label };
      }
    }
    // 2. ONLY when symbol_kind is literally "method" — try an exact dotted
    //    prefix match against a known class. Bare-name fallback is removed
    //    because it caused false absorption of free functions.
    const sym = (n.metadata?.symbol_kind as string | undefined)?.toLowerCase();
    if (sym === 'method') {
      const parts = n.label.split('.');
      for (let i = parts.length - 1; i > 0; i--) {
        const prefix = parts.slice(0, i).join('.');
        if (classByName.has(prefix)) {
          return { parent: prefix, memberName: parts.slice(i).join('.') };
        }
      }
    }
    return null;
  };

  for (const n of graph.nodes) {
    const sym = (n.metadata?.symbol_kind as string | undefined)?.toLowerCase();
    const t = mapKind(sym ?? n.kind);
    if (t !== 'function') continue;
    const match = findParentClass(n);
    if (match) {
      const list = rolledMethods.get(match.parent) ?? [];
      list.push(match.memberName);
      rolledMethods.set(match.parent, list);
      absorbed.add(n.id);
    }
  }

  // Helper used by every layout path to materialize the final GraphNode shape
  // from a positioned (x, y, cluster) entry. Hoisted so the cluster-grouped
  // path can reuse the same return logic the topological/grid paths use.
  const buildNodes = (
    visible: typeof graph.nodes,
    positionsMap: Map<string, { x: number; y: number; cluster: string }>,
  ): GraphNode[] => visible.map((n) => {
    const placed = positionsMap.get(n.id);
    const fallbackCluster = (n.metadata?.cluster_id as string | undefined)
      ?? (n.metadata?.cluster as string | undefined)
      ?? 'Unclustered';
    const baseMethods = (n.metadata?.methods as string[] | undefined) ?? [];
    const rolled = rolledMethods.get(n.label) ?? [];
    const methods = Array.from(new Set([...baseMethods, ...rolled]));
    const properties = (n.metadata?.properties as string[] | undefined) ?? [];
    const filePath = (n.metadata?.file_path as string | undefined) ?? null;
    const stereotype = (n.metadata?.stereotype as string | undefined) ?? null;
    return {
      id: n.id,
      name: n.label,
      type: mapKind((n.metadata?.symbol_kind as string | undefined) ?? n.kind),
      cluster: placed?.cluster ?? fallbackCluster,
      stereotype,
      methods,
      properties,
      filePath,
      dependencies: (adjacency.get(n.id) ?? []).map((tid) => idToName.get(tid) ?? tid),
      x: (placed?.x ?? 600) - cardW / 2,
      y: (placed?.y ?? 350) - cardH / 2,
    };
  });

  // Visible nodes only — methods absorbed above are hidden from the canvas
  // because they now live inside the class card's method list.
  const visibleNodes = graph.nodes.filter((n) => !absorbed.has(n.id));

  // ---------------------------------------------------------------------
  // File-grouped layout — bucket nodes by their source ``file_path`` and
  // lay each file out as its own grid block. The architecture cluster a
  // file belongs to is computed by majority vote across its symbols and
  // attached to the region so the renderer can tint the file accordingly
  // when the architecture overlay is on.
  // ---------------------------------------------------------------------
  let withFile = 0;
  for (const n of visibleNodes) {
    if (n.metadata?.file_path) withFile++;
  }
  if (visibleNodes.length > 0 && withFile / visibleNodes.length >= 0.6) {
    const buckets = new Map<string, typeof graph.nodes>();
    for (const n of visibleNodes) {
      const fp = (n.metadata?.file_path as string | undefined) ?? UNCLUSTERED_ID;
      if (!buckets.has(fp)) buckets.set(fp, []);
      buckets.get(fp)!.push(n);
    }

    // Sort within each file: classes first, then functions, alphabetical
    // within each type.
    for (const [, list] of buckets) {
      list.sort((a, b) => {
        const ta = mapKind((a.metadata?.symbol_kind as string | undefined) ?? a.kind);
        const tb = mapKind((b.metadata?.symbol_kind as string | undefined) ?? b.kind);
        const ra = TYPE_ORDER.indexOf(ta);
        const rb = TYPE_ORDER.indexOf(tb);
        if (ra !== rb) return ra - rb;
        return a.label.localeCompare(b.label);
      });
    }

    // Per-file majority cluster (architecture overlay metadata). Tie-breaker:
    // highest count, then lexicographic cluster_id. ``mixed`` flags files
    // whose top cluster covers < 60% of the file's symbols.
    type ClusterMeta = {
      id: string | null;
      short: string | null;
      role: string | null;
      mixed: boolean;
      mixedClusters: Array<{ id: string; short: string; count: number }>;
    };
    const clusterMetaForFile = (list: typeof graph.nodes): ClusterMeta => {
      const counts = new Map<string, { count: number; short: string; role: string }>();
      for (const n of list) {
        const cid = n.metadata?.cluster_id as string | undefined;
        if (!cid) continue;
        const short = (n.metadata?.cluster_short as string | undefined) ?? 'CLUSTER';
        const role = (n.metadata?.cluster_role as string | undefined) ?? '';
        const cur = counts.get(cid);
        if (cur) cur.count += 1;
        else counts.set(cid, { count: 1, short, role });
      }
      if (counts.size === 0) {
        return { id: null, short: null, role: null, mixed: false, mixedClusters: [] };
      }
      const ranked = [...counts.entries()].sort((a, b) => {
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        return a[0].localeCompare(b[0]);
      });
      const total = list.length;
      const [topId, topMeta] = ranked[0];
      const mixed = topMeta.count / Math.max(1, total) < 0.6 && ranked.length > 1;
      return {
        id: topId,
        short: topMeta.short,
        role: topMeta.role,
        mixed,
        mixedClusters: ranked.map(([id, m]) => ({ id, short: m.short, count: m.count })),
      };
    };

    const fileMeta = new Map<string, ClusterMeta>();
    for (const [fp, list] of buckets) fileMeta.set(fp, clusterMetaForFile(list));

    // Order regions: group files that share a (majority) cluster so they sit
    // adjacent. Within a cluster, larger files first. Files with no cluster
    // sink toward the end; the unclustered bucket is last.
    const fileIds = [...buckets.keys()].sort((a, b) => {
      if (a === UNCLUSTERED_ID) return 1;
      if (b === UNCLUSTERED_ID) return -1;
      const ca = fileMeta.get(a)?.id ?? '~';
      const cb = fileMeta.get(b)?.id ?? '~';
      if (ca !== cb) return ca.localeCompare(cb);
      return buckets.get(b)!.length - buckets.get(a)!.length;
    });

    // Spacing — generous so individual nodes and whole files both have
    // breathing room. The canvas pans/zooms so making it bigger is fine.
    const innerColW = cardW + cardW * 0.6;
    const innerRowH = cardH + cardH * 0.7;
    const fileGapX = 140;
    const fileGapY = 140;
    const ROW_BUDGET = 2800;

    const positionsMap = new Map<string, { x: number; y: number; cluster: string }>();
    const clusterRegions: ClusterRegion[] = [];

    let cursorX = 0;
    let cursorY = 0;
    let cursorRowMaxBottomY = 0;

    for (const fp of fileIds) {
      const list = buckets.get(fp)!;
      // Cap at 8 cols so very large files own their row instead of becoming
      // a thin tall strip; tiny files collapse to a 1-cell grid.
      const colCount = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(list.length))));
      const rowCount = Math.ceil(list.length / colCount);
      const innerW = colCount * cardW + (colCount - 1) * (innerColW - cardW);
      const innerH = rowCount * cardH + (rowCount - 1) * (innerRowH - cardH);
      const regionW = innerW + REGION_PAD * 2;
      const regionH = innerH + REGION_PAD * 2 + REGION_HEADER_H;

      if (cursorX > 0 && cursorX + regionW > ROW_BUDGET) {
        cursorX = 0;
        cursorY = cursorRowMaxBottomY + fileGapY;
      }

      const regionX = cursorX;
      const regionY = cursorY;
      const meta = fileMeta.get(fp)!;
      const lastSlash = fp === UNCLUSTERED_ID ? -1 : fp.lastIndexOf('/');
      const basename = fp === UNCLUSTERED_ID
        ? 'OTHER'
        : (lastSlash >= 0 ? fp.slice(lastSlash + 1) : fp);
      const dirname = fp === UNCLUSTERED_ID
        ? 'No file path'
        : (lastSlash >= 0 ? fp.slice(0, lastSlash) : '');
      clusterRegions.push({
        id: fp,
        shortName: basename,
        role: dirname || fp,
        x: regionX,
        y: regionY,
        w: regionW,
        h: regionH,
        nodeCount: list.length,
        clusterId: meta.id,
        clusterShort: meta.short,
        clusterRole: meta.role,
        mixed: meta.mixed,
        mixedClusters: meta.mixedClusters,
      });

      list.forEach((n, i) => {
        const r = Math.floor(i / colCount);
        const c = i % colCount;
        const x = regionX + REGION_PAD + cardW / 2 + c * innerColW;
        const y = regionY + REGION_HEADER_H + REGION_PAD + cardH / 2 + r * innerRowH;
        positionsMap.set(n.id, { x, y, cluster: fp });
      });

      cursorX += regionW + fileGapX;
      cursorRowMaxBottomY = Math.max(cursorRowMaxBottomY, regionY + regionH);
    }

    return { nodes: buildNodes(visibleNodes, positionsMap), clusterRegions };
  }

  // ---------------------------------------------------------------------
  // Layered (topological) layout — assign each visible node a "layer index"
  // equal to the longest dependency path that ends at it. Sources land in
  // layer 0 on the left; sinks land furthest right. Arrows therefore flow
  // in one consistent direction (left → right).
  // ---------------------------------------------------------------------
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleAdj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of visibleNodes) {
    visibleAdj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
    if (e.source === e.target) continue; // self-loop, ignore for layering
    visibleAdj.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const layerOf = new Map<string, number>();
  // Kahn-style longest-path. Break cycles by greedy initialization at
  // remaining min-in-degree node when the queue empties early.
  const queue: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  for (const id of queue) layerOf.set(id, 0);
  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    const cur = layerOf.get(id) ?? 0;
    for (const tgt of visibleAdj.get(id) ?? []) {
      const next = Math.max(layerOf.get(tgt) ?? 0, cur + 1);
      layerOf.set(tgt, next);
      const remaining = (inDeg.get(tgt) ?? 0) - 1;
      inDeg.set(tgt, remaining);
      if (remaining === 0) queue.push(tgt);
    }
  }
  // Anything left has been part of a cycle — pin it to the deepest reached
  // layer + 1 so it still gets a column.
  for (const n of visibleNodes) {
    if (!layerOf.has(n.id)) {
      let best = 0;
      for (const v of layerOf.values()) best = Math.max(best, v);
      layerOf.set(n.id, best + 1);
    }
  }

  // Group nodes by layer, then sort each layer by legend type so same-kind
  // nodes still cluster vertically within a column.
  const typeRank = (n: typeof graph.nodes[number]) => {
    const t = mapKind((n.metadata?.symbol_kind as string | undefined) ?? n.kind);
    const idx = TYPE_ORDER.indexOf(t);
    return idx === -1 ? TYPE_ORDER.length : idx;
  };

  const layers = new Map<number, typeof graph.nodes>();
  for (const n of visibleNodes) {
    const li = layerOf.get(n.id) ?? 0;
    if (!layers.has(li)) layers.set(li, []);
    layers.get(li)!.push(n);
  }
  for (const [, list] of layers) {
    list.sort((a, b) => {
      const r = typeRank(a) - typeRank(b);
      return r !== 0 ? r : a.label.localeCompare(b.label);
    });
  }

  const colWidth = cardW + cardW * 1.0;
  const rowHeight = cardH + cardH * 0.6;
  const cx = 600;
  const baseY = 350;
  const sortedLayerKeys = [...layers.keys()].sort((a, b) => a - b);
  const totalCols = sortedLayerKeys.length;
  const startX = cx - ((totalCols - 1) * colWidth) / 2;

  const positioned = new Map<string, { x: number; y: number; cluster: string }>();

  // Fallback layout for small / sparse graphs: when the topological layout
  // produces fewer than 3 columns (i.e. most nodes have in-degree 0, so they
  // all stack into column 0), switch to a per-type grid. Each legend type
  // gets its own row block, with nodes wrapping into columns. This is the
  // pre-regression layout — it stays readable on tiny repos like cart-smoke
  // where the topological collapse would otherwise produce a 1-2 column
  // strip.
  if (totalCols < 3) {
    const grouped = new Map<GraphNode['type'], typeof graph.nodes>();
    for (const n of visibleNodes) {
      const t = mapKind((n.metadata?.symbol_kind as string | undefined) ?? n.kind);
      if (!grouped.has(t)) grouped.set(t, []);
      grouped.get(t)!.push(n);
    }
    // Sort within each type for stable ordering.
    for (const [, list] of grouped) {
      list.sort((a, b) => a.label.localeCompare(b.label));
    }
    // Type ordering matches TYPE_ORDER above.
    const orderedTypes = TYPE_ORDER.filter((t) => grouped.has(t));
    // Pick a column count that gives roughly square blocks; clamp 3..6.
    const colsPerBlock = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(visibleNodes.length))));
    const blockColWidth = cardW + cardW * 0.6;
    const blockRowHeight = cardH + cardH * 0.5;
    let blockY = baseY - ((orderedTypes.length - 1) * (blockRowHeight * 2)) / 2;
    for (const t of orderedTypes) {
      const list = grouped.get(t)!;
      const rowsInBlock = Math.ceil(list.length / colsPerBlock);
      const blockCols = Math.min(list.length, colsPerBlock);
      const blockStartX = cx - ((blockCols - 1) * blockColWidth) / 2;
      list.forEach((n, i) => {
        const r = Math.floor(i / colsPerBlock);
        const c = i % colsPerBlock;
        const x = blockStartX + c * blockColWidth;
        const y = blockY + r * blockRowHeight;
        positioned.set(n.id, { x, y, cluster: t });
      });
      blockY += rowsInBlock * blockRowHeight + blockRowHeight; // gap between blocks
    }
  } else {
    sortedLayerKeys.forEach((li, colIdx) => {
      const list = layers.get(li)!;
      const colH = list.length * rowHeight - cardH * 0.6;
      list.forEach((n, i) => {
        const x = startX + colIdx * colWidth;
        const y = baseY - colH / 2 + i * rowHeight;
        const cluster = mapKind((n.metadata?.symbol_kind as string | undefined) ?? n.kind);
        positioned.set(n.id, { x, y, cluster });
      });
    });
  }

  // Topological / per-type-grid path: cluster regions empty (this layout
  // doesn't group by Layer 3 cluster). Renderer skips region drawing.
  return { nodes: buildNodes(visibleNodes, positioned), clusterRegions: [] };
}

// UML 2.5 relationship classification. Maps the backend edge ``kind`` string
// onto one of six canonical UML relationships, each with its own line style
// and arrowhead. Anything unknown falls back to a plain dependency arrow
// (dashed line + open arrow) since that's the most generic UML relation.
export type UmlRelation =
  | 'association'   // solid line, open arrow
  | 'aggregation'   // solid line, hollow diamond at the whole
  | 'composition'   // solid line, filled diamond at the whole
  | 'inheritance'   // solid line, hollow triangle at the parent
  | 'realization'   // dashed line, hollow triangle at the interface
  | 'dependency';   // dashed line, open arrow

export interface UmlEdgeStyle {
  relation: UmlRelation;
  dashed: boolean;
  // Marker placed at the *target* end of the line (the "whole" or "parent"
  // for hierarchical relations).
  endMarker: 'open-arrow' | 'hollow-triangle' | 'hollow-diamond' | 'filled-diamond';
  color: string;
}

export function classifyUmlEdge(kind: string | undefined | null): UmlEdgeStyle {
  const k = (kind ?? '').toLowerCase();
  // Inheritance — class extends class.
  if (/(^|_)(inherits?|extends|generaliz)/.test(k)) {
    return { relation: 'inheritance', dashed: false, endMarker: 'hollow-triangle', color: '#93c5fd' };
  }
  // Realization — class implements interface.
  if (/(implements?|realiz)/.test(k)) {
    return { relation: 'realization', dashed: true, endMarker: 'hollow-triangle', color: '#d8b4fe' };
  }
  // Composition — strong "owns" / lifecycle-bound containment.
  if (/(composes|composition|owns)/.test(k)) {
    return { relation: 'composition', dashed: false, endMarker: 'filled-diamond', color: '#fcd34d' };
  }
  // Aggregation — weak "has-a" containment.
  if (/(aggregat|contains|has_a|has-a|hasa)/.test(k)) {
    return { relation: 'aggregation', dashed: false, endMarker: 'hollow-diamond', color: '#fcd34d' };
  }
  // Association — generic "uses / references / calls" without lifecycle ties.
  if (/(calls?|references?|uses?|associat|invokes?|reads?|writes?)/.test(k)) {
    return { relation: 'association', dashed: false, endMarker: 'open-arrow', color: '#86efac' };
  }
  // Default → dependency (dashed + open arrow).
  return { relation: 'dependency', dashed: true, endMarker: 'open-arrow', color: '#9ca3af' };
}

export interface PathFilter {
  path: string;
  kind: 'file' | 'folder';
}

function matchesPathFilter(node: GraphNode, filter: PathFilter | null): boolean {
  if (!filter) return true;
  if (!node.filePath) return false;
  if (filter.kind === 'file') return node.filePath === filter.path;
  const prefix = filter.path.endsWith('/') ? filter.path : filter.path + '/';
  return node.filePath === filter.path || node.filePath.startsWith(prefix);
}

interface UnifiedGraphViewProps {
  repositoryId: string;
  showLegend: boolean;
  agentLogCollapsed: boolean;
  activeModes: Set<GraphMode>;
  onNodeSelect: (node: GraphNode | null) => void;
  onNodeFocus?: (node: GraphNode) => void;
  /** Fires when the user clicks a Layer 3 cluster background region. */
  onClusterSelect?: (region: ClusterRegion) => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
  highlightedCluster: string | null;
  sidebarCollapsed?: boolean;
  pathFilter?: PathFilter | null;
  density?: GraphDensity;
}

export type GraphMode = 'symbol' | 'flow' | 'architecture';
export type GraphDensity = 'detailed' | 'compact';

export interface GraphNode {
  id: string;
  name: string;
  type: 'class' | 'interface' | 'function' | 'module';
  cluster: string;
  /** Optional UML stereotype, e.g. "interface", "service", "controller". */
  stereotype?: string | null;
  methods?: string[];
  properties?: string[];
  dependencies?: string[];
  filePath?: string | null;
  x: number;
  y: number;
}

export function UnifiedGraphView({ repositoryId, showLegend, agentLogCollapsed, activeModes, onNodeSelect, onNodeFocus, onClusterSelect, zoomLevel, onZoomChange, onResetView, highlightedCluster, sidebarCollapsed, pathFilter, density = 'detailed' }: UnifiedGraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
    onNodeSelect(node);
    onNodeFocus?.(node);
  };
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragStart, setNodeDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1200);

  // Track viewport width so each node card can size to ~10% of it.
  useEffect(() => {
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    setViewportWidth(el.clientWidth || 1200);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setViewportWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // In compact ("Database") density, every class becomes a small pill so
  // large repositories stay legible at a glance. Detailed density keeps the
  // full method/property cards.
  const cardW = density === 'compact'
    ? 96
    : Math.round(Math.max(110, Math.min(200, viewportWidth * 0.10)));
  const cardH = density === 'compact' ? 32 : Math.round(cardW * 0.85);

  // Live graph data sourced from the Cartographer store. The store is
  // populated by CartographerWorkspace's initial fetch + SSE handler.
  //
  // Multi-overlay rendering: any combination of symbol/flow/architecture can
  // be on at once. We read all three projections, then:
  //   - One projection provides the NODE SET (the cards drawn on the canvas).
  //     Priority: symbol > architecture > flow. Symbol is the richest, so
  //     when it's on it always anchors the layout; flow nodes are a subset
  //     of symbol nodes (same ObjectId) so flow can layer cleanly on top.
  //   - Each active projection contributes its EDGES, tagged with which
  //     layer they came from so the styler can pick UML vs flow visuals.
  const symbolProjection = useCartographerStore(
    (s) => s.byRepo[repositoryId]?.graphs.symbol,
  );
  const flowProjection = useCartographerStore(
    (s) => s.byRepo[repositoryId]?.graphs.flow,
  );
  const architectureProjection = useCartographerStore(
    (s) => s.byRepo[repositoryId]?.graphs.architecture,
  );
  const layer: LayerName = activeModes.has('symbol')
    ? 'symbol'
    : activeModes.has('architecture')
      ? 'architecture'
      : 'flow';
  const projection = layer === 'symbol'
    ? symbolProjection
    : layer === 'architecture'
      ? architectureProjection
      : flowProjection;

  // Highlights pushed by the workspace's SSE handler when an agent_activity
  // event arrives. We flatten all currently-live highlights into a single
  // Set<node_id> for O(1) per-node lookup at render time. The pruner in the
  // workspace ticks expired highlights out of the store, which re-renders us.
  const highlights = useCartographerStore(
    (s) => s.byRepo[repositoryId]?.highlights,
  );
  const highlightedIds = useMemo(() => {
    const set = new Set<string>();
    if (!highlights) return set;
    const now = Date.now();
    for (const h of highlights) {
      if (h.expires_at > now) {
        for (const id of h.node_ids) set.add(id);
      }
    }
    return set;
  }, [highlights]);

  // Derived nodes from the projection, then a local override layer for
  // user-driven drags so positions don't snap back when the projection
  // re-renders (e.g. after an SSE refetch).
  const { nodes: baseNodes, clusterRegions } = useMemo(
    () => projectionToNodes(projection, cardW, cardH),
    [projection, cardW, cardH],
  );

  // Combined edge list — pulls edges from EACH active projection and tags
  // each entry with its source layer so the renderer can pick the right
  // visual style (UML for symbol/architecture, teal arrows for flow).
  // Edges whose source/target nodes aren't in the rendered set are skipped
  // by the render pass. This is what lets Symbol+Flow draw teal flow arrows
  // overlaid on top of UML-classified symbol relationships.
  const overlayEdges = useMemo(() => {
    type Tagged = { edge: GraphProjection['edges'][number]; sourceLayer: LayerName };
    const out: Tagged[] = [];
    if (activeModes.has('symbol') && symbolProjection) {
      for (const e of symbolProjection.edges) out.push({ edge: e, sourceLayer: 'symbol' });
    }
    if (activeModes.has('flow') && flowProjection) {
      for (const e of flowProjection.edges) out.push({ edge: e, sourceLayer: 'flow' });
    }
    if (activeModes.has('architecture') && architectureProjection) {
      for (const e of architectureProjection.edges) out.push({ edge: e, sourceLayer: 'architecture' });
    }
    return out;
  }, [activeModes, symbolProjection, flowProjection, architectureProjection]);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, { x: number; y: number }>>({});

  const allNodes: GraphNode[] = useMemo(
    () =>
      baseNodes.map((n) =>
        positionOverrides[n.id]
          ? { ...n, x: positionOverrides[n.id].x, y: positionOverrides[n.id].y }
          : n,
      ),
    [baseNodes, positionOverrides],
  );

  // Show every projected node. Use the explorer's path filter to narrow
  // scope on large repos rather than an arbitrary global cap.
  const nodes: GraphNode[] = useMemo(
    () => (pathFilter ? allNodes.filter((n) => matchesPathFilter(n, pathFilter)) : allNodes),
    [allNodes, pathFilter],
  );

  // ---------------------------------------------------------------------
  // Cross-boundary edge stubs.
  //
  // When an in-view node depends on a node outside the current view (either
  // not in the active projection or filtered out by ``pathFilter``), emit a
  // stub arrow pointing from the source toward the diagram's bounding box,
  // ending at a labeled placeholder showing the external target's name and
  // its parent group. Cross-tier edges additionally carry a protocol
  // stereotype (``«HTTP»``, ``«SQL»``, ...) painted on the arrow.
  // ---------------------------------------------------------------------
  type Tier = 'frontend' | 'backend' | 'data' | 'unknown';
  const tierOf = (hints: { name?: string; cluster?: string; filePath?: string | null }): Tier => {
    const blob = `${hints.filePath ?? ''} ${hints.cluster ?? ''} ${hints.name ?? ''}`.toLowerCase();
    if (/(\b|\/)(ui|components?|frontend|client|web|pages?|views?)(\b|\/)/.test(blob)) return 'frontend';
    if (/(\b|\/)(db|database|sql|repository|repo|model|orm|migrations?|schema)(\b|\/)/.test(blob)) return 'data';
    if (/(\b|\/)(api|server|backend|service|controller|router|handler)(\b|\/)/.test(blob)) return 'backend';
    return 'unknown';
  };
  const stereotypeFor = (sourceTier: Tier, targetTier: Tier, targetName: string): string | null => {
    if (sourceTier === targetTier) return null;
    if (targetTier === 'data') return '«SQL»';
    if (targetTier === 'backend' && sourceTier === 'frontend') return '«HTTP»';
    if (sourceTier === 'backend' && targetTier === 'frontend') return '«HTTP»';
    // Heuristic on the symbol name as a last resort.
    const n = targetName.toLowerCase();
    if (/(query|select|insert|update|delete|sql)/.test(n)) return '«SQL»';
    if (/(fetch|axios|request|http|get|post)/.test(n)) return '«HTTP»';
    return '«crosses tier»';
  };

  // Build a lookup of in-view nodes by name + name->external metadata pulled
  // from ``allNodes`` (the unfiltered projection). External targets unknown
  // even there fall back to ``Unknown` group with sentinel tier.
  const externalStubs = useMemo(() => {
    if (nodes.length === 0) return [] as Array<{
      key: string;
      sourceId: string;
      targetName: string;
      targetGroup: string;
      protocol: string | null;
      sx: number;
      sy: number;
      bx: number;
      by: number;
      labelX: number;
      labelY: number;
    }>;

    const inView = new Set(nodes.map((n) => n.name));
    const externalLookup = new Map<string, GraphNode>();
    for (const a of allNodes) externalLookup.set(a.name, a);

    // Bounding box of in-view nodes — used to anchor placeholders just
    // outside the diagram.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + cardW);
      maxY = Math.max(maxY, n.y + cardH);
    }
    const margin = Math.max(cardW * 0.6, 80);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Collapse multiple in-view sources targeting the same external node to
    // one shared boundary placeholder. The arrow still emanates from each
    // source, but they all land on the same labeled stub.
    const placeholderPos = new Map<string, { bx: number; by: number; sourceTier: Tier }>();
    const stubs: Array<{
      key: string; sourceId: string; targetName: string; targetGroup: string;
      protocol: string | null; sx: number; sy: number; bx: number; by: number;
      labelX: number; labelY: number;
    }> = [];

    for (const node of nodes) {
      const sourceTier = tierOf({ name: node.name, cluster: node.cluster, filePath: node.filePath });
      for (const depName of node.dependencies ?? []) {
        if (inView.has(depName)) continue;

        const ext = externalLookup.get(depName);
        const targetGroup = ext?.cluster ?? 'External';
        const targetTier = tierOf({
          name: depName,
          cluster: ext?.cluster,
          filePath: ext?.filePath,
        });

        // Anchor the placeholder on whichever side of the bounding box best
        // matches the direction from the centroid to the source. Stable per
        // (target, source-tier) so the same external symbol renders in the
        // same spot across re-renders.
        let pos = placeholderPos.get(depName);
        if (!pos) {
          const sx = node.x + cardW / 2;
          const sy = node.y + cardH / 2;
          const dx = sx - cx;
          const dy = sy - cy;
          const horizontalDominant = Math.abs(dx) > Math.abs(dy);
          let bx: number, by: number;
          if (horizontalDominant) {
            bx = dx >= 0 ? maxX + margin : minX - margin;
            by = sy;
          } else {
            bx = sx;
            by = dy >= 0 ? maxY + margin : minY - margin;
          }
          pos = { bx, by, sourceTier };
          placeholderPos.set(depName, pos);
        }

        const sx = node.x + cardW / 2;
        const sy = node.y + cardH / 2;
        const protocol = stereotypeFor(sourceTier, targetTier, depName);
        stubs.push({
          key: `ext-${node.id}-${depName}`,
          sourceId: node.id,
          targetName: depName,
          targetGroup,
          protocol,
          sx,
          sy,
          bx: pos.bx,
          by: pos.by,
          labelX: (sx + pos.bx) / 2,
          labelY: (sy + pos.by) / 2,
        });
      }
    }
    return stubs;
  }, [nodes, allNodes, cardW, cardH]);

  // Deduplicated placeholder badges — one per external target.
  const externalPlaceholders = useMemo(() => {
    const seen = new Map<string, { name: string; group: string; bx: number; by: number }>();
    for (const s of externalStubs) {
      if (!seen.has(s.targetName)) {
        seen.set(s.targetName, {
          name: s.targetName,
          group: s.targetGroup,
          bx: s.bx,
          by: s.by,
        });
      }
    }
    return Array.from(seen.values());
  }, [externalStubs]);

  // Setter shim so existing code that calls `setNodes(prev => ...)` still
  // works. Translates updates into position overrides since projection is
  // store-owned and shouldn't be mutated locally.
  const setNodes = (updater: GraphNode[] | ((prev: GraphNode[]) => GraphNode[])) => {
    const next = typeof updater === 'function' ? (updater as (p: GraphNode[]) => GraphNode[])(nodes) : updater;
    setPositionOverrides((prev) => {
      const merged = { ...prev };
      for (const n of next) merged[n.id] = { x: n.x, y: n.y };
      return merged;
    });
  };

  // Keyboard zoom controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onZoomChange(Math.min(200, zoomLevel + 10));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        onZoomChange(Math.max(10, zoomLevel - 10));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [zoomLevel, onZoomChange]);

  // On first load: zoom to show ~10 of the most-connected nodes centered in viewport.
  // On sidebar/log toggle: reuse current zoom, just re-center on the same focal area.
  const initializedRef = useRef(false);
  const lastFilterRef = useRef<string | null>(null);
  useEffect(() => {
    const filterKey = pathFilter ? `${pathFilter.kind}:${pathFilter.path}` : null;
    if (filterKey !== lastFilterRef.current) {
      lastFilterRef.current = filterKey;
      initializedRef.current = false;
    }
    const timeoutId = setTimeout(() => {
      if (!canvasRef.current || nodes.length === 0) return;
      const vw = canvasRef.current.clientWidth;
      const vh = canvasRef.current.clientHeight;

      if (!initializedRef.current) {
        initializedRef.current = true;
        // Pick the 10 most-connected nodes as focal set
        const focal = [...nodes]
          .sort((a, b) => (b.dependencies?.length ?? 0) - (a.dependencies?.length ?? 0))
          .slice(0, 10);

        const pad = 80;
        const minX = Math.min(...focal.map(n => n.x));
        const minY = Math.min(...focal.map(n => n.y));
        const maxX = Math.max(...focal.map(n => n.x + cardW + 20));
        const maxY = Math.max(...focal.map(n => n.y + cardH + 20));
        const fw = maxX - minX;
        const fh = maxY - minY;

        const fitZoom = Math.min((vw - pad * 2) / fw, (vh - pad * 2) / fh, 1) * 100;
        const zoom = Math.max(10, Math.min(100, fitZoom));
        onZoomChange(Math.round(zoom));

        const scale = zoom / 100;
        setPanX((vw - fw * scale) / 2 - minX * scale);
        setPanY((vh - fh * scale) / 2 - minY * scale);
      } else {
        // Just re-center without changing zoom
        const scale = zoomLevel / 100;
        const minX = Math.min(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));
        const maxX = Math.max(...nodes.map(n => n.x + cardW + 20));
        const maxY = Math.max(...nodes.map(n => n.y + cardH + 20));
        setPanX((vw - (maxX - minX) * scale) / 2 - minX * scale);
        setPanY((vh - (maxY - minY) * scale) / 2 - minY * scale);
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [agentLogCollapsed, sidebarCollapsed, nodes, pathFilter]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('.graph-node')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeId) {
      handleNodeDrag(e);
    } else if (isDragging && canvasRef.current) {
      const newPanX = e.clientX - dragStart.x;
      const newPanY = e.clientY - dragStart.y;

      // Allow some panning but keep at least part of the graph visible
      const viewportWidth = canvasRef.current.clientWidth;
      const viewportHeight = canvasRef.current.clientHeight;
      const scale = zoomLevel / 100;

      // Calculate graph bounds
      if (nodes.length > 0) {
        const minX = Math.min(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));
        const maxX = Math.max(...nodes.map(n => n.x + cardW + 20));
        const maxY = Math.max(...nodes.map(n => n.y + cardH + 20));

        const graphWidth = (maxX - minX) * scale;
        const graphHeight = (maxY - minY) * scale;

        setPanX(newPanX);
        setPanY(newPanY);
      } else {
        setPanX(newPanX);
        setPanY(newPanY);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    handleNodeMouseUp();
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setDraggingNodeId(null);
  };


  // Node drag handlers
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setDraggingNodeId(nodeId);
      const scale = zoomLevel / 100;
      setNodeDragStart({
        x: (e.clientX - panX) / scale - node.x,
        y: (e.clientY - panY) / scale - node.y,
      });
    }
  };

  const handleNodeDrag = (e: React.MouseEvent) => {
    if (draggingNodeId && canvasRef.current) {
      const scale = zoomLevel / 100;
      const newX = (e.clientX - panX) / scale - nodeDragStart.x;
      const newY = (e.clientY - panY) / scale - nodeDragStart.y;

      // Constrain node within reasonable bounds
      const constrainedX = Math.max(-500, Math.min(2000, newX));
      const constrainedY = Math.max(-500, Math.min(2000, newY));

      setNodes(prevNodes =>
        prevNodes.map(node =>
          node.id === draggingNodeId
            ? { ...node, x: constrainedX, y: constrainedY }
            : node
        )
      );
    }
  };

  const handleNodeMouseUp = () => {
    setDraggingNodeId(null);
  };

  // Wheel/trackpad zoom handler. Smooth exponential factor scaled by deltaY
  // so a mouse wheel notch (~100) and a trackpad nudge (~5) feel comparable.
  // Floor matches the auto-fit floor (10%) so users can always scroll back to
  // the initial fit zoom.
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const zoomFactor = Math.exp(-e.deltaY * 0.0015);
    const newZoom = Math.max(10, Math.min(200, zoomLevel * zoomFactor));
    if (newZoom === zoomLevel) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const scaleFactor = newZoom / zoomLevel;

      setPanX(mouseX - (mouseX - panX) * scaleFactor);
      setPanY(mouseY - (mouseY - panY) * scaleFactor);
    }

    onZoomChange(newZoom);
  };

  // Touch handlers for mobile pinch zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      setLastTouchDistance(distance);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance !== null) {
      e.preventDefault();

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      const delta = distance - lastTouchDistance;
      const zoomFactor = 1 + (delta / 500);
      const newZoom = Math.max(10, Math.min(200, zoomLevel * zoomFactor));

      onZoomChange(newZoom);
      setLastTouchDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    setLastTouchDistance(null);
  };

  // Color palette per node type — border, header bg, header text, badge bg
  const NODE_COLORS: Record<string, { border: string; header: string; label: string; badge: string; dot: string }> = {
    class:     { border: '#3b82f6', header: '#1e3a5f', label: '#93c5fd', badge: '#172a4a', dot: '#3b82f6' },
    interface: { border: '#a855f7', header: '#3b1f5e', label: '#d8b4fe', badge: '#2a1545', dot: '#a855f7' },
    function:  { border: '#22c55e', header: '#14432a', label: '#86efac', badge: '#0e2e1c', dot: '#22c55e' },
    module:    { border: '#f59e0b', header: '#432d09', label: '#fcd34d', badge: '#2e1e06', dot: '#f59e0b' },
    variable:  { border: '#6b7280', header: '#1f2937', label: '#d1d5db', badge: '#111827', dot: '#6b7280' },
  };
  const getNodeColors = (type: string) => NODE_COLORS[type] ?? NODE_COLORS.variable;

  const getClusterColor = (cluster: string) => {
    const colors: Record<string, string> = {
      Controllers: 'border-yellow-500/30 bg-yellow-500/5',
      Services: 'border-[#2DD4BF]/30 bg-blue-500/5',
      Database: 'border-purple-500/30 bg-purple-500/5',
      Utils: 'border-green-500/30 bg-green-500/5',
      Routes: 'border-orange-500/30 bg-orange-500/5',
    };
    return colors[cluster] || 'border-gray-500/30 bg-gray-500/5';
  };

  const getAgentColor = (cluster: string) => {
    // Match the legend dot colors so the cluster backgrounds reinforce the
    // legend grouping. Falls back to gray for non-type clusters (legacy data).
    const typeColor = NODE_COLORS[cluster]?.dot;
    if (typeColor) return typeColor;
    const colors: Record<string, string> = {
      Controllers: '#eab308',
      Services: '#3b82f6',
      Database: '#a855f7',
      Utils: '#22c55e',
      Routes: '#f97316',
    };
    return colors[cluster] || '#6b7280';
  };

  // Calculate cluster boundaries dynamically based on node positions
  const getClusterBounds = (clusterName: string) => {
    const clusterNodes = nodes.filter(n => n.cluster === clusterName);
    if (clusterNodes.length === 0) return null;

    const padding = 30;
    const minX = Math.min(...clusterNodes.map(n => n.x)) - padding;
    const minY = Math.min(...clusterNodes.map(n => n.y)) - padding;
    const maxX = Math.max(...clusterNodes.map(n => n.x + cardW + 20)) + padding;
    const maxY = Math.max(...clusterNodes.map(n => n.y + cardH + 20)) + padding;

    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  // Map the active layer name to one of the four UML tier classes — each
  // class supplies a translucent wash on the canvas so the eye can track
  // which tier (Symbol / Flow / Architecture / Invariant) is in focus across
  // tab switches.
  const tierClass = layer === 'symbol'
    ? 'uml-tier-1'
    : layer === 'flow'
      ? 'uml-tier-2'
      : layer === 'architecture'
        ? 'uml-tier-3'
        : 'uml-tier-4';

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] uml-view-fade relative">
      {/* Mind Map Canvas */}
      <div
        ref={canvasRef}
        className={`flex-1 relative bg-[#1a1a1a] overflow-hidden ${tierClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          cursor: draggingNodeId ? 'move' : isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel / 100})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          {/* File regions — primary grouping. Each region is a single source
              file; symbols inside are laid out as a grid. When the
              Architecture overlay is on AND the file's symbols carry Layer 3
              cluster metadata, the region is tinted with a colour derived
              from the file's majority cluster (striped border for files
              whose top cluster covers <60% of symbols). ``pointer-events``
              is scoped to the header so clicks anywhere else on the region
              pass through to the canvas pan/zoom. */}
          {clusterRegions.map((r) => {
            const archOn = activeModes.has('architecture');
            const accent = archOn && r.clusterId ? clusterColor(r.clusterId) : null;
            const baseBg = accent
              ? `linear-gradient(135deg, ${accent}26, ${accent}0d)`
              : 'rgba(255,255,255,0.025)';
            const baseBorder = accent
              ? `2px solid ${accent}66`
              : '1px solid rgba(255,255,255,0.10)';
            const headerBg = '#1a1a1a';
            const headerColor = accent ?? '#e5e7eb';
            const headerBorder = accent ? `1px solid ${accent}66` : '1px solid #3e3e42';
            const tagText = r.clusterShort
              ? (r.mixed ? `${r.clusterShort}*` : r.clusterShort)
              : null;
            const tagTitle = r.mixed && r.mixedClusters && r.mixedClusters.length > 1
              ? `Mixed clusters: ${r.mixedClusters.map((m) => `${m.short} (${m.count})`).join(', ')}`
              : (r.clusterRole || r.clusterShort || '');
            return (
              <div
                key={`file-region-${r.id}`}
                className="absolute"
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.w,
                  height: r.h,
                  background: baseBg,
                  border: baseBorder,
                  borderStyle: archOn && r.mixed ? 'dashed' : undefined,
                  borderRadius: 12,
                  boxShadow: accent ? `inset 0 0 60px ${accent}1a` : undefined,
                  pointerEvents: 'none',
                  zIndex: 0,
                  transition: 'background 0.2s, border-color 0.2s',
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClusterSelect?.(r);
                  }}
                  className="text-left px-3 text-[12px] font-semibold tracking-wide text-gray-200 hover:text-white hover:bg-white/[0.05] transition-colors flex items-center gap-2"
                  style={{
                    pointerEvents: 'auto',
                    width: '100%',
                    height: REGION_HEADER_H,
                    lineHeight: `${REGION_HEADER_H}px`,
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 12,
                  }}
                  title={r.role}
                >
                  <span className="align-middle truncate" style={{ maxWidth: '60%' }}>{r.shortName}</span>
                  <span className="text-gray-500 font-normal text-[11px]">· {r.nodeCount}</span>
                  {archOn && tagText && (
                    <span
                      className="ml-auto px-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                      style={{
                        background: headerBg,
                        color: headerColor,
                        border: headerBorder,
                        lineHeight: '16px',
                        height: 18,
                      }}
                      title={tagTitle}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: accent ?? '#888' }}
                      />
                      {tagText}
                    </span>
                  )}
                </button>
              </div>
            );
          })}

          {/* Connection Lines — overflow:visible lets edges extend beyond SVG bounds */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              zIndex: 0,
              pointerEvents: 'none',
              transition: draggingNodeId ? 'none' : 'all 0.1s ease-out',
            }}
          >
            {/* Edges — drawn from EVERY active overlay's projection. Each
                edge knows which layer it came from (``sourceLayer``) so the
                styler can pick the right visual:
                  - ``flow`` source → teal line + ``arrowhead-flow``, amber
                    if the edge is tagged with a sensitivity (password/token).
                  - ``symbol`` / ``architecture`` source → UML 2.5
                    classification via ``classifyUmlEdge``.
                Edges whose source/target nodes aren't in the rendered set
                (e.g. flow edges between symbols when only Architecture is
                providing the node base) are skipped silently. Lines route
                from the right edge of the source to the left edge of the
                target so the layered (left→right) layout stays coherent. */}
            {overlayEdges.map(({ edge, sourceLayer }) => {
              const source = nodes.find((n) => n.id === edge.source);
              const target = nodes.find((n) => n.id === edge.target);
              if (!source || !target) return null;

              // Strictly source-layer-gated. The earlier
              // ``edge.kind.startsWith('flow')`` fallback caused leakage:
              // any edge with a flow-prefixed kind rendered as a teal flow
              // arrow even when Flow mode was off, so toggling to
              // Architecture-only could leave teal arrows on screen.
              const isFlow = sourceLayer === 'flow';
              const x1 = source.x + cardW;
              const y1 = source.y + cardH / 2;
              const x2 = target.x;
              const y2 = target.y + cardH / 2;

              if (isFlow) {
                // Flow edges: teal. Sensitive flows go warmer (amber) so the
                // eye picks them out instantly. Standard #2DD4BF teal
                // matches the legacy flow view.
                const sensitivity = (edge as unknown as { metadata?: { sensitivity?: string } })
                  .metadata?.sensitivity;
                const stroke = sensitivity ? '#f59e0b' : '#2DD4BF';
                return (
                  <g key={`flow-${edge.source}-${edge.target}-${edge.kind}`}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={stroke}
                      strokeWidth={2}
                      markerEnd="url(#arrowhead-flow)"
                      opacity={0.9}
                    />
                  </g>
                );
              }

              const style = classifyUmlEdge(edge.kind);
              const markerId =
                style.endMarker === 'open-arrow' ? 'uml-arrow-open' :
                style.endMarker === 'hollow-triangle' ? 'uml-arrow-triangle' :
                style.endMarker === 'hollow-diamond' ? 'uml-diamond-hollow' :
                'uml-diamond-filled';
              return (
                <g
                  key={`${sourceLayer}-uml-${edge.source}-${edge.target}-${edge.kind}`}
                  style={{ color: style.color }}
                >
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeDasharray={style.dashed ? '6 4' : undefined}
                    markerEnd={`url(#${markerId})`}
                    opacity={0.85}
                  />
                </g>
              );
            })}

            {/* Architecture overlay = folder backgrounds only (rendered
                below). No edges in this mode — the grouping is the signal. */}
            <defs>
              <marker
                id="arrowhead-symbol"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#3e3e42" />
              </marker>
              <marker
                id="arrowhead-flow"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 12 4, 0 8" fill="#2DD4BF" />
              </marker>
              <marker
                id="arrowhead-inter"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#dc2626" />
              </marker>
              <marker
                id="arrowhead-allow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#22c55e" />
              </marker>
              <marker
                id="arrowhead-external"
                markerWidth="9"
                markerHeight="9"
                refX="8"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 9 3.5, 0 7" fill="#B7553A" />
              </marker>

              {/* UML 2.5 line-end markers
                  - uml-arrow-open      : open V (association, dependency, calls)
                  - uml-arrow-triangle  : hollow triangle (generalization,
                                          realization)
                  - uml-diamond-hollow  : open diamond at the whole's end
                                          (aggregation)
                  - uml-diamond-filled  : filled diamond at the whole's end
                                          (composition)
                  Markers use markerUnits="strokeWidth" so the arrowheads
                  scale gracefully when we adjust line weight. */}
              <marker
                id="uml-arrow-open"
                viewBox="0 0 12 12"
                markerWidth="10"
                markerHeight="10"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0 0 L10 6 L0 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </marker>
              <marker
                id="uml-arrow-triangle"
                viewBox="0 0 14 12"
                markerWidth="12"
                markerHeight="10"
                refX="12"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0 0 L12 6 L0 12 z" fill="var(--uml-card-bg, #1e1e1e)" stroke="currentColor" strokeWidth="1.2" />
              </marker>
              <marker
                id="uml-diamond-hollow"
                viewBox="0 0 16 12"
                markerWidth="14"
                markerHeight="10"
                refX="14"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0 6 L7 0 L14 6 L7 12 z" fill="var(--uml-card-bg, #1e1e1e)" stroke="currentColor" strokeWidth="1.2" />
              </marker>
              <marker
                id="uml-diamond-filled"
                viewBox="0 0 16 12"
                markerWidth="14"
                markerHeight="10"
                refX="14"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0 6 L7 0 L14 6 L7 12 z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />
              </marker>
            </defs>

            {/* Cross-boundary stub arrows — emitted whenever an in-view node
                depends on a node that lives outside the current view. */}
            {externalStubs.map((s) => (
              <g key={s.key}>
                <line
                  x1={s.sx}
                  y1={s.sy}
                  x2={s.bx}
                  y2={s.by}
                  stroke="#B7553A"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.85"
                  markerEnd="url(#arrowhead-external)"
                />
                {s.protocol && (
                  <g>
                    {/* Background pill so the stereotype stays legible across
                        any underlying node card or cluster fill. */}
                    <rect
                      x={s.labelX - (s.protocol.length * 3.4 + 8)}
                      y={s.labelY - 9}
                      width={s.protocol.length * 6.8 + 16}
                      height={18}
                      rx={9}
                      ry={9}
                      fill="#1e1e1e"
                      stroke="#B7553A"
                      strokeWidth="1"
                      opacity="0.95"
                    />
                    <text
                      x={s.labelX}
                      y={s.labelY + 4}
                      textAnchor="middle"
                      fill="#F5C7B5"
                      fontSize="10"
                      fontWeight="600"
                      style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
                    >
                      {s.protocol}
                    </text>
                  </g>
                )}
              </g>
            ))}
          </svg>

          {/* External target placeholders — labeled with the external symbol's
              name and parent group, anchored just outside the diagram bounds. */}
          {externalPlaceholders.map((p) => (
            <div
              key={`ext-ph-${p.name}`}
              className="absolute pointer-events-none"
              style={{
                left: p.bx - 80,
                top: p.by - 20,
                width: 160,
              }}
            >
              <div
                className="rounded-md border border-dashed text-center px-2 py-1.5"
                style={{
                  borderColor: '#B7553A',
                  background: 'rgba(30,30,30,0.92)',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
                }}
              >
                <div
                  className="text-[10px] font-semibold truncate"
                  style={{ color: '#F5C7B5' }}
                  title={p.name}
                >
                  {p.name}
                </div>
                <div
                  className="text-[9px] text-gray-400 truncate"
                  title={p.group}
                >
                  {p.group}
                </div>
              </div>
            </div>
          ))}

          {/* Architecture overlay is now applied directly on file regions
              above (per-file majority-cluster tint). No separate folder
              bounding boxes here. */}

          {/* Graph Nodes */}
          {nodes.map((node) => {
            const colors = getNodeColors(node.type);
            const isSelected = selectedNode?.id === node.id;
            const isDraggingThis = draggingNodeId === node.id;
            // Agent-driven highlight: when an agent_activity SSE event names
            // this node's qualified_name in its citations, the workspace
            // pushes a 5s highlight into the store. We bring it forward with
            // a glowing emerald border + pulse so the user can SEE which
            // symbols a running agent just touched.
            const isAgentHighlighted = highlightedIds.has(node.id);
            return (
              <div
                key={node.id}
                onClick={() => handleNodeClick(node)}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                className="graph-node absolute cursor-move"
                style={{
                  left: node.x,
                  top: node.y,
                  width: cardW,
                  transition: isDraggingThis ? 'none' : 'transform 0.15s ease-out',
                  transform: isSelected || isDraggingThis ? 'scale(1.04)' : 'scale(1)',
                  zIndex: isAgentHighlighted ? 11 : (isSelected || isDraggingThis ? 10 : 1),
                }}
              >
                {/* Agent highlight pulse */}
                {highlightedCluster === node.cluster && (
                  <div className="absolute -top-2 -right-2 z-20 animate-pulse" style={{
                    width: 14, height: 14, borderRadius: '50%',
                    backgroundColor: colors.dot,
                    boxShadow: `0 0 10px ${colors.dot}`,
                    border: '2px solid white',
                  }} />
                )}

                {/* Live agent-touched node pulse (separate from cluster
                    highlight above): a soft emerald ring around the whole
                    card while the highlight is alive in the store. */}
                {isAgentHighlighted && (
                  <div
                    className="absolute inset-0 pointer-events-none rounded-lg animate-pulse"
                    style={{
                      boxShadow: '0 0 0 3px rgba(16,185,129,0.85), 0 0 24px 4px rgba(16,185,129,0.45)',
                      borderRadius: 10,
                    }}
                  />
                )}

                {node.type === 'module' ? (
                  // Higher-level grouping (modules / packages / clusters) —
                  // rendered as a single labeled container box per UML
                  // package/component conventions, no attribute or method
                  // compartments.
                  <div
                    style={{
                      minHeight: cardH,
                      borderRadius: 6,
                      border: `2px solid ${isSelected ? colors.border : colors.border + 'aa'}`,
                      background: `linear-gradient(135deg, ${colors.header}, #1a1a1a)`,
                      boxShadow: isSelected
                        ? `0 0 0 2px ${colors.border}40, 0 4px 16px ${colors.border}40`
                        : '0 2px 10px #0008',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontStyle: 'italic',
                        color: colors.label,
                        letterSpacing: '0.05em',
                      }}
                    >
                      «{node.stereotype ?? 'package'}»
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#fff',
                        wordBreak: 'break-all',
                        lineHeight: 1.25,
                      }}
                      title={node.name}
                    >
                      {node.name.split('.').pop() ?? node.name}
                    </span>
                  </div>
                ) : density === 'compact' ? (
                  <div
                    style={{
                      height: cardH,
                      borderRadius: 999,
                      border: `2px solid ${isSelected ? colors.border : colors.border + '88'}`,
                      background: `linear-gradient(135deg, ${colors.header}, #1e1e1e)`,
                      boxShadow: isSelected
                        ? `0 0 0 2px ${colors.border}40, 0 4px 16px ${colors.border}40`
                        : '0 2px 8px #0008',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 10px',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: colors.dot,
                        flexShrink: 0,
                        boxShadow: `0 0 6px ${colors.dot}`,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={node.name}
                    >
                      {node.name.split('.').pop() ?? node.name}
                    </span>
                  </div>
                ) : (
                <div style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: `2px solid ${isAgentHighlighted ? '#10b981' : (isSelected ? colors.border : '#3e3e42')}`,
                  boxShadow: isSelected ? `0 0 0 1px ${colors.border}40, 0 4px 20px ${colors.border}30` : '0 2px 8px #0008',
                  background: '#1e1e1e',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}>
                  {/* Colored left stripe + header.
                      UML 2.5 layout — when a stereotype is set it is shown
                      in guillemets above the class name; the class name
                      itself stays centered in the top compartment, with a
                      horizontal rule separating it from the attribute /
                      operation compartments below. */}
                  <div style={{
                    background: colors.header,
                    borderLeft: `4px solid ${colors.border}`,
                    padding: '6px 10px 7px',
                    fontFamily: 'var(--uml-mono, Menlo, Monaco, "Courier New", monospace)',
                  }}>
                    {node.stereotype && (
                      <div
                        style={{
                          fontSize: 10,
                          color: colors.label,
                          textAlign: 'center',
                          marginBottom: 2,
                          letterSpacing: '0.02em',
                          fontStyle: 'italic',
                        }}
                      >
                        «{node.stereotype}»
                      </div>
                    )}
                    {!node.stereotype && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: colors.label, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {node.type}
                        </span>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#fff',
                        lineHeight: 1.3,
                        wordBreak: 'break-all',
                        textAlign: node.stereotype ? 'center' : 'left',
                        // UML class names are typically italicized when the class is abstract.
                        fontStyle: node.type === 'interface' ? 'italic' : 'normal',
                      }}
                    >
                      {node.name.split('.').pop() ?? node.name}
                    </div>
                    {node.name.includes('.') && (
                      <div
                        style={{
                          fontSize: 10,
                          color: colors.label + 'aa',
                          marginTop: 2,
                          wordBreak: 'break-all',
                          textAlign: node.stereotype ? 'center' : 'left',
                        }}
                      >
                        {node.name}
                      </div>
                    )}
                  </div>

                  {/* Properties */}
                  {node.properties && node.properties.length > 0 && (
                    <div style={{ borderTop: `1px solid ${colors.border}30`, borderLeft: `4px solid ${colors.border}`, background: '#1a1a1a', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {node.properties.slice(0, 3).map((prop, idx) => (
                        <div
                          key={`${node.id}-p-${idx}`}
                          style={{
                            fontSize: 10,
                            color: '#9ca3af',
                            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                            letterSpacing: '0.02em',
                            lineHeight: 1.5,
                            padding: '2px 0',
                            wordSpacing: '0.1em',
                          }}
                        >
                          – {prop}
                        </div>
                      ))}
                      {node.properties.length > 3 && (
                        <div style={{ fontSize: 10, color: '#6b7280', paddingTop: 2 }}>+{node.properties.length - 3} more</div>
                      )}
                    </div>
                  )}

                  {/* Methods */}
                  {node.methods && node.methods.length > 0 && (
                    <div style={{ borderTop: `1px solid ${colors.border}30`, borderLeft: `4px solid ${colors.border}`, background: '#1a1a1a', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {node.methods.slice(0, 6).map((method, idx) => (
                        <div
                          key={`${node.id}-m-${idx}`}
                          style={{
                            fontSize: 10,
                            color: '#9ca3af',
                            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                            letterSpacing: '0.02em',
                            lineHeight: 1.5,
                            padding: '2px 0',
                            wordSpacing: '0.1em',
                          }}
                        >
                          + {method}
                        </div>
                      ))}
                      {node.methods.length > 6 && (
                        <div style={{ fontSize: 10, color: '#6b7280', paddingTop: 2 }}>+{node.methods.length - 6} more</div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ borderTop: `1px solid #2d2d2d`, background: '#1e1e1e', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>{node.cluster}</span>
                    {node.dependencies && node.dependencies.length > 0 && (
                      <span style={{ fontSize: 10, color: colors.label }}>{node.dependencies.length} deps</span>
                    )}
                  </div>
                </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty-state overlay — surfaces when the active layer's projection
            hasn't been indexed yet (e.g., toggling Flow on a repo where
            Layer 2 hasn't run). Without this, the canvas just looks blank
            and the toolbar appears broken. */}
        {nodes.length === 0 && !projection && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none">
            <div
              className="px-5 py-4 rounded-xl border border-white/10 bg-[#1e1e1e]/80 backdrop-blur-md max-w-sm pointer-events-auto"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
            >
              <div className="text-sm font-semibold text-white mb-1 capitalize">
                {layer} layer not ready
              </div>
              <div className="text-xs text-gray-400 leading-relaxed">
                The {layer} projection isn't available for this repository yet.
                The indexer may still be running, or this layer hasn't been
                generated. Try the Symbol layer for the base graph.
              </div>
            </div>
          </div>
        )}
        {nodes.length === 0 && projection && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none">
            <div
              className="px-5 py-4 rounded-xl border border-white/10 bg-[#1e1e1e]/80 backdrop-blur-md max-w-sm pointer-events-auto"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
            >
              <div className="text-sm font-semibold text-white mb-1 capitalize">
                Nothing to render
              </div>
              <div className="text-xs text-gray-400 leading-relaxed">
                The {layer} layer has no nodes matching the current filter.
                Clear the explorer filter or switch layers to see more.
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// Floating legend overlay shown on top of the canvas when the user toggles
// "Legend" from the activity bar. Documents the node-color palette and the
// six UML edge styles that ship with the renderer.
//
// Color values are sourced directly from the same NODE_COLORS table the
// renderer uses, so anything the user sees on the canvas has a matching
// chip in the legend (and vice versa).
function LegendOverlay({ activeModes }: { activeModes: Set<GraphMode> }) {
  const PALETTE: Record<GraphNode['type'], { border: string; header: string; dot: string }> = {
    class:     { border: '#3b82f6', header: '#1e3a5f', dot: '#3b82f6' },
    interface: { border: '#a855f7', header: '#3b1f5e', dot: '#a855f7' },
    function:  { border: '#22c55e', header: '#14432a', dot: '#22c55e' },
    module:    { border: '#f59e0b', header: '#432d09', dot: '#f59e0b' },
  };
  const nodeRows: Array<{ label: string; type: GraphNode['type']; description: string }> = [
    { label: 'Class',     type: 'class',     description: 'concrete class' },
    { label: 'Interface', type: 'interface', description: 'italic name' },
    { label: 'Function',  type: 'function',  description: 'free function' },
    { label: 'Module',    type: 'module',    description: 'package / file' },
  ];
  const edgeRows: Array<{ kind: 'open' | 'triangle' | 'diamondH' | 'diamondF'; dashed: boolean; label: string }> = [
    { kind: 'open',     dashed: false, label: 'Association' },
    { kind: 'diamondH', dashed: false, label: 'Aggregation' },
    { kind: 'diamondF', dashed: false, label: 'Composition' },
    { kind: 'triangle', dashed: false, label: 'Inheritance' },
    { kind: 'triangle', dashed: true,  label: 'Realization' },
    { kind: 'open',     dashed: true,  label: 'Dependency' },
  ];
  return (
    <div
      className="absolute top-3 right-3 z-30 rounded-lg border border-white/10 backdrop-blur-md p-3 shadow-2xl"
      style={{ background: 'rgba(20,20,20,0.85)', minWidth: 220 }}
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Legend</div>
      {/* Each chip mirrors the canvas card: colored left stripe + tinted
          header + dot, so the user can map a color back to a node at a
          glance instead of guessing what a flat swatch corresponds to. */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mb-3">
        {nodeRows.map((r) => {
          const c = PALETTE[r.type];
          return (
            <div
              key={r.label}
              className="flex items-center gap-2 rounded overflow-hidden"
              style={{
                background: '#1e1e1e',
                border: `1px solid ${c.border}aa`,
              }}
              title={r.description}
            >
              <span style={{ display: 'inline-block', width: 4, height: 18, background: c.border }} />
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: c.dot, marginLeft: 2 }} />
              <span className="text-[11px] text-gray-200 pr-2 py-0.5">{r.label}</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">UML edges</div>
      <div className="space-y-1">
        {edgeRows.map((e) => (
          <div key={`${e.kind}-${e.dashed}-${e.label}`} className="flex items-center gap-2">
            <svg width="60" height="14" viewBox="0 0 60 14">
              <line x1="2" y1="7" x2="44" y2="7" stroke="#cbd5e1" strokeWidth="1.4" strokeDasharray={e.dashed ? '4 3' : undefined} />
              {e.kind === 'open' && <path d="M52 7 L44 3 M52 7 L44 11" stroke="#cbd5e1" strokeWidth="1.4" fill="none" />}
              {e.kind === 'triangle' && <path d="M44 2 L56 7 L44 12 z" fill="#1a1a1a" stroke="#cbd5e1" strokeWidth="1.2" />}
              {e.kind === 'diamondH' && <path d="M44 7 L50 2 L56 7 L50 12 z" fill="#1a1a1a" stroke="#cbd5e1" strokeWidth="1.2" />}
              {e.kind === 'diamondF' && <path d="M44 7 L50 2 L56 7 L50 12 z" fill="#cbd5e1" stroke="#cbd5e1" strokeWidth="1.2" />}
            </svg>
            <span className="text-[11px] text-gray-200">{e.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-2 border-t border-white/10 text-[10px] text-gray-400">
        Active overlays:{' '}
        <span className="text-gray-200">
          {Array.from(activeModes).map((m) => m[0].toUpperCase() + m.slice(1)).join(' + ') || 'none'}
        </span>
      </div>
    </div>
  );
}
