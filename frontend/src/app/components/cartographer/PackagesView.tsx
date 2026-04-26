'use client';
//
// PackagesView — file-system + visibility decomposition of the focused context.
//
// Renders ONLY:
//   1. Package boxes (directories of related modules — containers, not class
//      rectangles).
//   2. Inter-package dashed dependency arrows.
//   3. Size badges (class count, sub-package count) on each box.
//   4. Cross-context stub arrows annotated with the destination context for
//      dependencies that leave the package set under inspection.
//
// Excludes: individual classes, methods, contexts, layers, and tiers — all of
// which live at different levels of the hierarchy. The package is the
// smallest enforced encapsulation unit above the class (Java
// package-private, Kotlin internal, Python leading-underscore, Go lowercase
// identifiers, Rust pub(crate) — all expressed at this level).
//
// Layout: longest-path topological sort, columns flow left → right with the
// most-foundational packages on the left and the most-orchestration packages
// on the right. Within a column, packages sort by descending class count.
//
import { useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useCartographerStore } from '../../../lib/store';

interface PackagesViewProps {
  repositoryId: string;
  /** Optional context (cluster id) to scope the package list. When set, only
   *  packages whose member symbols belong to that context are rendered, and
   *  the column-2 cross-stub arrows annotate destinations as "other contexts"
   *  rather than "outside the projection". */
  contextFilter?: string | null;
  /** Called when the user reaches a leaf package (no sub-packages) and
   *  clicks it — the workspace then advances viewLevel (Packages → Classes)
   *  and pushes the leaf path onto focusPath. Clicking a non-leaf package
   *  stays inside this component and narrows to its sub-packages. */
  onPackageFocus?: (packageName: string) => void;
}

interface Package {
  id: string;            // full directory path
  shortName: string;     // last segment of the path
  classCount: number;
  subPackageCount: number;
  context: string;       // cluster id of the dominant member
}

interface PackageEdge {
  source: string;
  target: string;
  count: number;
}

interface ExternalEdge {
  source: string;
  destinationContext: string;
}

const BOX_W = 240;
const BOX_H = 150;
const COL_GAP = 110;
const ROW_GAP = 36;
const PAD = 80;

function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}

export function PackagesView({ repositoryId, contextFilter, onPackageFocus }: PackagesViewProps) {
  const projection = useCartographerStore((s) => s.byRepo[repositoryId]?.graphs.symbol);

  // ``packagePrefix`` is the Packages-level zoom: clicking a parent package
  // sets the prefix so the view narrows to its immediate sub-packages, still
  // showing package boxes (not class cards). Clicking a leaf advances to
  // Classes via ``onPackageFocus``. Crumb trail at the top lets the user
  // walk back up the package tree without leaving Packages.
  const [packagePrefix, setPackagePrefix] = useState<string | null>(null);

  const { packages, edges, externals } = useMemo(() => {
    if (!projection) {
      return { packages: [] as Package[], edges: [] as PackageEdge[], externals: [] as ExternalEdge[] };
    }

    const idToPkg = new Map<string, string>();
    const idToContext = new Map<string, string>();
    const pkgMembers = new Map<string, typeof projection.nodes>();
    const pkgContexts = new Map<string, Map<string, number>>(); // pkg -> cluster -> count

    for (const n of projection.nodes) {
      const fp = (n.metadata?.file_path as string | undefined) ?? '';
      if (!fp) continue;
      const cluster =
        (n.metadata?.cluster_id as string | undefined) ??
        (n.metadata?.cluster as string | undefined) ??
        'Unclustered';
      idToContext.set(n.id, cluster);
      if (contextFilter && cluster !== contextFilter) continue;

      const pkg = dirname(fp);
      if (!pkg) continue;
      idToPkg.set(n.id, pkg);
      const list = pkgMembers.get(pkg) ?? [];
      list.push(n);
      pkgMembers.set(pkg, list);
      const cmap = pkgContexts.get(pkg) ?? new Map<string, number>();
      cmap.set(cluster, (cmap.get(cluster) ?? 0) + 1);
      pkgContexts.set(pkg, cmap);
    }

    // Sub-package count: a directory is a sub-package of another if its path
    // starts with the parent's path + '/'.
    const allPkgPaths = [...pkgMembers.keys()];
    const subPkgCount = (parent: string): number =>
      allPkgPaths.filter((p) => p !== parent && p.startsWith(parent + '/')).length;

    const pkgs: Package[] = [];
    for (const [path, members] of pkgMembers) {
      const classes = members.filter((n) => {
        const k = ((n.metadata?.symbol_kind as string | undefined) ?? n.kind ?? '').toLowerCase();
        return k === 'class' || k === 'interface' || k === 'type';
      });
      // Pick the dominant cluster as this package's "home" context for tinting.
      const cmap = pkgContexts.get(path) ?? new Map<string, number>();
      let dominantCtx = 'Unclustered';
      let bestCount = -1;
      for (const [ctx, count] of cmap) {
        if (count > bestCount) {
          bestCount = count;
          dominantCtx = ctx;
        }
      }
      pkgs.push({
        id: path,
        shortName: path.split('/').pop() ?? path,
        classCount: classes.length,
        subPackageCount: subPkgCount(path),
        context: dominantCtx,
      });
    }

    // Aggregate cross-package edges; cross-context edges become external stubs.
    const edgeMap = new Map<string, number>();
    const externalMap = new Map<string, ExternalEdge>();
    const pkgSet = new Set(pkgMembers.keys());
    for (const e of projection.edges) {
      const sPkg = idToPkg.get(e.source);
      if (!sPkg) continue;
      const tPkg = idToPkg.get(e.target);
      if (!tPkg) {
        const tCtx = idToContext.get(e.target);
        if (tCtx && tCtx !== contextFilter) {
          const key = `${sPkg}->${tCtx}`;
          if (!externalMap.has(key)) {
            externalMap.set(key, { source: sPkg, destinationContext: tCtx });
          }
        }
        continue;
      }
      if (!pkgSet.has(tPkg) || sPkg === tPkg) continue;
      const key = `${sPkg}=>${tPkg}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
    const eds: PackageEdge[] = Array.from(edgeMap, ([k, count]) => {
      const [source, target] = k.split('=>');
      return { source, target, count };
    });

    return { packages: pkgs, edges: eds, externals: Array.from(externalMap.values()) };
  }, [projection, contextFilter]);

  // Narrow ``packages`` to the immediate children of ``packagePrefix`` (if
  // any) so the user is always looking at one level of the package tree at a
  // time. Edges and externals follow the same filter.
  const { visiblePackages, visibleEdges, visibleExternals } = useMemo(() => {
    const isImmediateChild = (id: string): boolean => {
      if (!packagePrefix) {
        // At the root: show every top-level package (the shallowest path
        // segment count present in the projection). Filter to packages whose
        // path has no proper-prefix sibling — i.e. no other package in the
        // set is itself a strict prefix of this path. That keeps the root
        // listing scannable instead of showing every nested directory.
        for (const p of packages) {
          if (p.id !== id && id.startsWith(p.id + '/')) return false;
        }
        return true;
      }
      if (!id.startsWith(packagePrefix + '/')) return false;
      const tail = id.slice(packagePrefix.length + 1);
      return tail.length > 0 && !tail.includes('/');
    };
    const visiblePackages = packages.filter((p) => isImmediateChild(p.id));
    const visibleIds = new Set(visiblePackages.map((p) => p.id));
    const visibleEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    const visibleExternals = externals.filter((x) => visibleIds.has(x.source));
    return { visiblePackages, visibleEdges, visibleExternals };
  }, [packages, edges, externals, packagePrefix]);

  // Topological layering — operates on the visible (drilled-into) set.
  const layout = useMemo(() => {
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const p of visiblePackages) {
      adj.set(p.id, []);
      inDeg.set(p.id, 0);
    }
    for (const e of visibleEdges) {
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
    for (const p of visiblePackages) if (!layer.has(p.id)) layer.set(p.id, max + 1);

    const byCol = new Map<number, Package[]>();
    for (const p of visiblePackages) {
      const col = layer.get(p.id) ?? 0;
      const arr = byCol.get(col) ?? [];
      arr.push(p);
      byCol.set(col, arr);
    }
    for (const [, list] of byCol) {
      list.sort((a, b) => b.classCount - a.classCount || a.shortName.localeCompare(b.shortName));
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
      list.forEach((p, i) => {
        positions.set(p.id, {
          x: PAD + idx * (BOX_W + COL_GAP),
          y: yStart + i * (BOX_H + ROW_GAP),
        });
      });
    });

    return { positions, totalW: Math.max(totalW, 800), totalH: Math.max(totalH, 600) };
  }, [visiblePackages, visibleEdges]);

  const tintFor = (id: string): string => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360}deg 30% 22%)`;
  };

  if (packages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a] text-gray-500 text-sm px-8 text-center">
        {contextFilter
          ? `No packages indexed under "${contextFilter}". The symbol projection has no file-path metadata for this context yet.`
          : 'No packages available — the symbol projection has no file-path metadata for this repository yet.'}
      </div>
    );
  }

  const { positions, totalW, totalH } = layout;
  // Crumbs for the in-Packages drill: empty when at the root of the package
  // tree, otherwise one segment per directory level so the user can step
  // back up without leaving the Packages view.
  const prefixCrumbs = packagePrefix ? packagePrefix.split('/') : [];
  const handleBoxClick = (p: Package) => {
    if (p.subPackageCount > 0) {
      setPackagePrefix(p.id);
    } else {
      onPackageFocus?.(p.id);
    }
  };
  const jumpPrefix = (idx: number | null) => {
    if (idx === null) {
      setPackagePrefix(null);
      return;
    }
    setPackagePrefix(prefixCrumbs.slice(0, idx + 1).join('/'));
  };

  // ---------------------------------------------------------------------
  // Two flavors of drag:
  //   1. Background-pan: grabbing empty canvas scrolls the diagram (like
  //      Figma / VS Code drag-pan).
  //   2. Box-drag: pressing on a package box and moving lifts that box and
  //      lets the user reposition it. Click-without-drag still drills in,
  //      so the same pointer interaction does both intuitively.
  //
  // Per-box positions are stored as a delta map keyed by package id; the
  // computed layout is the source of truth, the override moves a single
  // box on top of it. A click that didn't actually drag (movement under
  // 4px) falls through to ``handleBoxClick`` and triggers drill-in.
  // ---------------------------------------------------------------------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
  const boxDragRef = useRef<{ id: string; startClientX: number; startClientY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [draggingBoxId, setDraggingBoxId] = useState<string | null>(null);
  const [boxPositions, setBoxPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());

  const onScrollMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // If the press landed on a package box, the box's own onMouseDown took
    // over already — skip pan setup so the two don't fight.
    const target = e.target as HTMLElement;
    if (target.closest('[data-pkg-box="1"]')) return;
    if (target.closest('button')) return;
    const el = scrollRef.current;
    if (!el) return;
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
    setIsPanning(true);
  };
  const onScrollMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Box drag wins over pan if both are active.
    const boxDrag = boxDragRef.current;
    if (boxDrag) {
      const dx = e.clientX - boxDrag.startClientX;
      const dy = e.clientY - boxDrag.startClientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) boxDrag.moved = true;
      setBoxPositions((prev) => {
        const next = new Map(prev);
        next.set(boxDrag.id, { x: boxDrag.baseX + dx, y: boxDrag.baseY + dy });
        return next;
      });
      return;
    }
    const drag = panDragRef.current;
    const el = scrollRef.current;
    if (!drag || !el) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    el.scrollLeft = drag.scrollLeft - dx;
    el.scrollTop = drag.scrollTop - dy;
  };
  const endDrag = () => {
    panDragRef.current = null;
    boxDragRef.current = null;
    setIsPanning(false);
    setDraggingBoxId(null);
  };

  const startBoxDrag = (e: React.MouseEvent, p: Package, basePos: { x: number; y: number }) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    boxDragRef.current = {
      id: p.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseX: basePos.x,
      baseY: basePos.y,
      moved: false,
    };
    setDraggingBoxId(p.id);
  };

  // Click handler that respects box-drag — only drill in when the user
  // didn't actually drag. ``moved`` is set on the boxDragRef in mousemove.
  const handleBoxClickGuarded = (p: Package) => {
    // boxDragRef is already cleared by endDrag (mouseup) before click fires
    // in some browsers, so mirror the moved flag onto a transient ref.
    if (justDraggedBoxRef.current) {
      justDraggedBoxRef.current = false;
      return;
    }
    handleBoxClick(p);
  };
  const justDraggedBoxRef = useRef(false);
  const onBoxMouseUp = (e: React.MouseEvent) => {
    const drag = boxDragRef.current;
    if (drag?.moved) {
      justDraggedBoxRef.current = true;
      e.stopPropagation();
    }
    endDrag();
  };

  // Resolve a package's rendered position: drag overrides win over the
  // computed layout so the user's manual placement persists across renders.
  const positionFor = (id: string): { x: number; y: number } | undefined => {
    return boxPositions.get(id) ?? positions.get(id);
  };

  return (
    <div
      ref={scrollRef}
      className="w-full h-full overflow-auto bg-[#1a1a1a]"
      style={{
        cursor: draggingBoxId ? 'grabbing' : isPanning ? 'grabbing' : 'grab',
        userSelect: draggingBoxId || isPanning ? 'none' : 'auto',
      }}
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
            <marker id="pkg-arrow-end" markerWidth="10" markerHeight="10" refX="9" refY="4" orient="auto">
              <polygon points="0 0, 10 4, 0 8" fill="#cbd5e1" />
            </marker>
            <marker id="pkg-arrow-stub" markerWidth="10" markerHeight="10" refX="9" refY="4" orient="auto">
              <polygon points="0 0, 10 4, 0 8" fill="#B7553A" />
            </marker>
          </defs>

          {/* Inter-package dashed dependency arrows. */}
          {visibleEdges.map((e) => {
            const s = positionFor(e.source);
            const t = positionFor(e.target);
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
                  markerEnd="url(#pkg-arrow-end)"
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

          {/* Cross-context stub arrows. */}
          {visibleExternals.map((ext, i) => {
            const s = positionFor(ext.source);
            if (!s) return null;
            const x1 = s.x + BOX_W;
            const y1 = s.y + BOX_H / 2;
            const x2 = totalW - 12;
            const y2 = y1;
            const labelText = `↗ ${ext.destinationContext}`;
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
                  markerEnd="url(#pkg-arrow-stub)"
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

        {/* Package boxes — directories, not class cards. Each box is
            click-and-drag movable; clicking without dragging still drills in. */}
        {visiblePackages.map((p) => {
          const layoutPos = positions.get(p.id);
          if (!layoutPos) return null;
          const overridePos = boxPositions.get(p.id);
          const pos = overridePos ?? layoutPos;
          const tint = tintFor(p.context);
          const interactive = p.subPackageCount > 0 || !!onPackageFocus;
          const willDrillIn = p.subPackageCount > 0;
          const isDraggingThis = draggingBoxId === p.id;
          return (
            <div
              key={p.id}
              data-pkg-box="1"
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              onMouseDown={(e) => startBoxDrag(e, p, pos)}
              onMouseUp={onBoxMouseUp}
              onClick={() => handleBoxClickGuarded(p)}
              onKeyDown={(e) => {
                if (!interactive) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleBoxClick(p);
                }
              }}
              title={
                willDrillIn
                  ? `Drag to reposition · click to drill into ${p.shortName}`
                  : interactive
                    ? `Drag to reposition · click for Classes view`
                    : p.id
              }
              className={`absolute rounded-xl border-2 border-white/20 flex flex-col p-4 shadow-[0_8px_28px_rgba(0,0,0,0.45)] ${
                isDraggingThis ? '' : 'transition-all duration-200'
              } ${
                interactive
                  ? 'cursor-grab hover:border-white/50 hover:shadow-[0_14px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.18),0_18px_60px_rgba(183,85,58,0.30)]'
                  : ''
              } ${isDraggingThis ? '!cursor-grabbing scale-[1.02]' : ''}`}
              style={{
                left: pos.x,
                top: pos.y,
                width: BOX_W,
                height: BOX_H,
                background: `linear-gradient(135deg, ${tint}, #1e1e1e)`,
                zIndex: isDraggingThis ? 50 : undefined,
              }}
            >
              <div className="flex items-start justify-between mb-1 gap-2">
                <div className="text-base font-bold text-white truncate" title={p.id}>
                  {p.shortName}
                </div>
                <span
                  className="px-2 py-0.5 text-[10px] font-semibold bg-white/10 border border-white/20 rounded-full text-white flex-shrink-0"
                  title={`${p.classCount} classes · ${p.subPackageCount} sub-packages`}
                >
                  {p.classCount}c
                  {p.subPackageCount > 0 ? ` · ${p.subPackageCount}p` : ''}
                </span>
              </div>
              <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">
                package
              </div>
              <div className="text-[10px] text-gray-300 break-all leading-snug" style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}>
                {p.id}
              </div>
              <div className="flex-1" />
              <div className="text-[9px] text-gray-500 italic">
                {willDrillIn ? `package · ${p.subPackageCount} sub-packages` : 'package · leaf'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky in-Packages crumb bar — lets the user step back up the
          package tree without leaving the Packages view. */}
      <div className="absolute top-0 left-0 right-0 px-4 py-1.5 bg-[#252526]/95 backdrop-blur-md border-b border-[#1e1e1e] flex items-center gap-1.5 text-[11px] text-gray-400 flex-wrap">
        <button
          type="button"
          onClick={() => jumpPrefix(null)}
          disabled={packagePrefix === null}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
            packagePrefix === null
              ? 'text-white font-medium'
              : 'hover:bg-white/[0.06] hover:text-white'
          }`}
          title="Back to package roots"
        >
          {packagePrefix !== null && <ChevronLeft className="h-3 w-3" />}
          packages
        </button>
        {prefixCrumbs.map((seg, i) => (
          <span key={`${i}-${seg}`} className="flex items-center gap-1.5">
            <span className="text-gray-600">/</span>
            <button
              type="button"
              onClick={() => jumpPrefix(i)}
              className={`px-1.5 py-0.5 rounded hover:bg-white/[0.06] hover:text-white transition-colors max-w-[200px] truncate ${
                i === prefixCrumbs.length - 1 ? 'text-white font-medium' : ''
              }`}
              title={prefixCrumbs.slice(0, i + 1).join('/')}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
