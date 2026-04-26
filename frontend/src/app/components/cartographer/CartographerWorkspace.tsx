'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Share2, Files, Search, GitBranch, Info, X, Layers, ShieldCheck, Bot } from 'lucide-react';
import { AnimatedLogo } from '../ui/AnimatedLogo';
import { useRouter } from 'next/navigation';
import { UnifiedGraphView, GraphNode, GraphMode, GraphDensity, PathFilter, type ClusterRegion } from './UnifiedGraphView';

// Layer-band classifier — moved into the workspace because the unified graph
// view (restored to its pre-Layers design) no longer exports it. Only the
// focus-stack counting code below uses this; it filters nodes by which of
// the four canonical bands their name + path pattern fits, so the breadcrumb
// can show "{n} classes" at the layer focus level.
type LayerBand = 'Controller' | 'Service' | 'Repository' | 'Entity';
function classifyLayerBand(name: string, filePath: string | null | undefined): LayerBand {
  const n = (name || '').toLowerCase();
  const p = (filePath || '').toLowerCase();
  if (/(controller|handler|router|view|page|api)/.test(n) || /(controllers?|handlers?|routes?|views?|pages?|api)\//.test(p)) return 'Controller';
  if (/(repository|repo|dao|store|gateway)/.test(n) || /(repositor(y|ies)|daos?|stores?|gateways?)\//.test(p)) return 'Repository';
  if (/(entity|model|schema|dto|domain)/.test(n) || /(entit(y|ies)|models?|schemas?|dto|domain)\//.test(p)) return 'Entity';
  return 'Service';
}
import { InvariantView } from './InvariantView';
import { ContextsView } from './ContextsView';
import { PackagesView } from './PackagesView';
import { RootFlowView } from './RootFlowView';
import { DiagramToolbar } from './DiagramToolbar';
import { ViewLevelToolbar, type ViewLevel } from './ViewLevelToolbar';
import { AgentQuery } from './AgentActivityLog';
import { RightSidePanel } from './RightSidePanel';
import { FilesPanel, SelectedPath } from '../workspace/FilesPanel';
import { AgentsPanel } from './AgentsPanel';
import { GraphInfoModal } from './GraphInfoModal';
import { InvariantToolbar } from './InvariantToolbar';
import { getGraph, getIndexStatus, listRepos } from '../../../lib/api';
import { useRepoStream } from '../../../lib/sse';
import { useCartographerStore, type AgentActivity } from '../../../lib/store';
import type { GraphProjection, IndexStatus, LayerName, SseEvent } from '../../../lib/types';

interface CartographerWorkspaceProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onShare: () => void;
}

type ActiveView = 'diagram' | 'invariant';

const LEVEL_ORDER: ViewLevel[] = ['tiers', 'layers', 'contexts', 'packages', 'classes'];
const LEVEL_LABELS: Record<ViewLevel, string> = {
  tiers: 'Tiers',
  layers: 'Layers',
  contexts: 'Contexts',
  packages: 'Packages',
  classes: 'Classes',
};

interface FocusBreadcrumbProps {
  viewLevel: ViewLevel;
  focusPath: string[];
  /** Levels that the navigator skipped because they had no children for the
   *  current focus. Rendered as faded "(SkippedLevel)" stubs in the trail
   *  so the user understands why the toolbar jumped two steps. */
  skippedLevels: Set<ViewLevel>;
  onJump: (idx: number) => void;
}

// Renders the focus chain (e.g. Tiers › Backend › Service › ⟨Contexts⟩ › payments).
// Segments may be either:
//   - a focus pick (clickable, e.g. "Backend"),
//   - a skipped-level stub like "(Contexts)" rendered faded — clicking it
//     jumps back to that level so the user can drill in manually if their
//     mental model differs from the auto-skipper's.
function FocusBreadcrumb({ viewLevel, focusPath, skippedLevels, onJump }: FocusBreadcrumbProps) {
  const currentIdx = LEVEL_ORDER.indexOf(viewLevel);
  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[#252526] border-b border-[#1e1e1e] text-[11px] text-gray-400 flex-wrap">
      <button
        type="button"
        onClick={() => onJump(0)}
        className={`px-1.5 py-0.5 rounded hover:bg-white/[0.06] hover:text-white transition-colors ${
          currentIdx === 0 ? 'text-white font-medium' : ''
        }`}
      >
        {LEVEL_LABELS[LEVEL_ORDER[0]]}
      </button>
      {focusPath.map((segment, i) => {
        const targetLevel = LEVEL_ORDER[i + 1];
        const isCurrent = i + 1 === currentIdx;
        const isSkipped = skippedLevels.has(targetLevel);
        return (
          <span key={`${i}-${segment}`} className="flex items-center gap-1.5">
            <span className="text-gray-600">›</span>
            <button
              type="button"
              onClick={() => onJump(i + 1)}
              className={`px-1.5 py-0.5 rounded hover:bg-white/[0.06] hover:text-white transition-colors max-w-[200px] truncate ${
                isSkipped ? 'opacity-40 italic' : ''
              } ${isCurrent ? 'text-white font-medium' : ''}`}
              title={
                isSkipped
                  ? `${LEVEL_LABELS[targetLevel]} skipped — no meaningful split at this level`
                  : `${segment} (${LEVEL_LABELS[targetLevel]})`
              }
            >
              {isSkipped ? `(${LEVEL_LABELS[targetLevel]})` : segment}
            </button>
          </span>
        );
      })}
    </div>
  );
}

type ActivityBarItem = 'explorer' | 'search' | 'source-control' | 'agents' | 'info';

export function CartographerWorkspace({ projectId, projectName, onBack, onShare }: CartographerWorkspaceProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ActiveView>('diagram');
  // Multi-overlay layer toggle — any combination of symbol/flow/architecture
  // can be on at once. The renderer picks Symbol as the node base when it's
  // on (symbols + cluster backgrounds + flow arrows all overlay together);
  // otherwise Architecture (cluster nodes); otherwise Flow alone. Clicking
  // the last-remaining active layer is a no-op so we never end up empty
  // (which would render a blank canvas).
  const [diagramLayers, setDiagramLayers] = useState<Set<GraphMode>>(
    () => new Set<GraphMode>(['symbol']),
  );
  const toggleDiagramLayer = (mode: GraphMode) => {
    setDiagramLayers((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        if (next.size === 1) return prev; // refuse to leave an empty selection
        next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  };
  const [diagramDensity, setDiagramDensity] = useState<GraphDensity>('detailed');
  const [selectedRepository, setSelectedRepository] = useState(projectId);
  const [activeActivity, setActiveActivity] = useState<ActivityBarItem>('explorer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth] = useState(280);
  const [agentLogCollapsed, setAgentLogCollapsed] = useState(false);
  const [agentLogWidth, setAgentLogWidth] = useState(280);
  const [isResizingAgentLog, setIsResizingAgentLog] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  // Cluster the user clicked on the symbol-view background. Rendered as an
  // inline overlay card in the canvas area; doesn't touch RightSidePanel.
  const [selectedCluster, setSelectedCluster] = useState<ClusterRegion | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [highlightedQuery, setHighlightedQuery] = useState<AgentQuery | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [viewLevel, setViewLevel] = useState<ViewLevel>('tiers');
  // focusPath[i] is the focus chosen at LEVEL_ORDER[i]. Length == index of the
  // current viewLevel: an empty path means the user is at the root level.
  const [focusPath, setFocusPath] = useState<string[]>([]);
  // Levels that were auto-skipped because they had no meaningful split for
  // the current focus (e.g. Contexts skipped on a small backend that has no
  // bounded-context decomposition). Surfaced as faded breadcrumb stubs.
  const [skippedLevels, setSkippedLevels] = useState<Set<ViewLevel>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<SelectedPath | null>(null);
  // File click in the explorer panel keeps the row highlighted, but no longer
  // narrows the graph projection — the path filter behaviour was disorienting
  // when users just wanted to peek at a file. Selecting an explorer row is now
  // purely a visual cue.
  const pathFilter: PathFilter | null = null;

  // ``activeModes`` is just the user's diagram-toolbar selection. The toolbar
  // is a 3-way switch over Cartographer's actual projections (symbol / flow /
  // architecture); UnifiedGraphView's ``pickLayer`` resolves it to one of
  // those when reading from the store.
  const isGraphView = activeView === 'diagram';
  // The view-level toolbar drives the projection at coarse levels:
  //   Tiers / Layers / Contexts → architecture (cluster-bounded boxes)
  //   Packages                  → symbol (per-symbol nodes, scoped by ctx)
  //   Classes                   → user-toggled multi-select overlay
  //                               (symbol + flow + architecture in any combo)
  // The Classes branch preserves main's diagramLayers multi-select so the
  // user can flip between the 3 underlying graph projections at the leaf
  // level; coarser views always pin to a single canonical projection.
  const levelToLayer: Record<Exclude<ViewLevel, 'classes'>, GraphMode> = {
    tiers: 'architecture',
    layers: 'architecture',
    contexts: 'architecture',
    packages: 'symbol',
  };
  const activeModes: Set<GraphMode> = isGraphView
    ? (viewLevel === 'classes'
        ? diagramLayers
        : new Set<GraphMode>([levelToLayer[viewLevel]]))
    : new Set();

  // ---------------------------------------------------------------------
  // Live data wiring — projectId is the repo hash after dashboard wiring.
  // ---------------------------------------------------------------------
  const setGraph = useCartographerStore((s) => s.setGraph);
  const setIndex = useCartographerStore((s) => s.setIndex);
  const pushHighlight = useCartographerStore((s) => s.pushHighlight);
  const pushActivity = useCartographerStore((s) => s.pushActivity);
  const upsertAgentRun = useCartographerStore((s) => s.upsertAgentRun);
  const appendAgentStep = useCartographerStore((s) => s.appendAgentStep);
  const finishAgentRun = useCartographerStore((s) => s.finishAgentRun);
  const indexStatus = useCartographerStore((s) => s.byRepo[projectId]?.index);

  // Refs for timeout cleanup
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchDebounceRefs = useRef<Partial<Record<LayerName, ReturnType<typeof setTimeout>>>>({});

  // Initial parallel fetch: index status + all four layer projections.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const layers: LayerName[] = ['symbol', 'flow', 'architecture', 'invariant'];
    (async () => {
      try {
        const [status, ...graphs] = await Promise.all([
          getIndexStatus(projectId),
          ...layers.map((l) => getGraph(projectId, l).catch(() => null as GraphProjection | null)),
        ]);
        if (cancelled) return;
        setIndex(projectId, status);
        graphs.forEach((g, i) => {
          if (g) setGraph(projectId, layers[i], g);
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[CartographerWorkspace] initial load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, setGraph, setIndex]);

  // Refetch a single layer (used on node/edge_added when payload doesn't
  // carry the full delta).
  const refetchLayer = useCallback(
    async (layer: LayerName) => {
      try {
        const g = await getGraph(projectId, layer);
        setGraph(projectId, layer, g);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[CartographerWorkspace] refetch layer failed', layer, err);
      }
    },
    [projectId, setGraph],
  );

  // SSE event dispatcher.
  const handleEvent = useCallback(
    (event: SseEvent) => {
      const payload = event.payload as Record<string, unknown>;
      switch (event.type) {
        case 'index_progress': {
          // Backend may send a full snapshot or just a progress hint; either
          // way, re-fetch the canonical status to stay authoritative.
          if (payload && typeof payload === 'object' && 'layers' in payload) {
            setIndex(projectId, payload as unknown as IndexStatus);
          } else {
            getIndexStatus(projectId)
              .then((s) => setIndex(projectId, s))
              .catch(() => {});
          }
          break;
        }
        case 'node_added':
        case 'node_updated':
        case 'edge_added': {
          const layer = (payload.layer as LayerName | undefined) ?? null;
          const layersToRefetch: LayerName[] = layer
            ? [layer]
            : (['symbol', 'flow', 'architecture', 'invariant'] as LayerName[]);
          layersToRefetch.forEach((l) => {
            if (refetchDebounceRefs.current[l]) {
              clearTimeout(refetchDebounceRefs.current[l]);
            }
            refetchDebounceRefs.current[l] = setTimeout(() => {
              refetchLayer(l);
              delete refetchDebounceRefs.current[l];
            }, 100);
          });
          break;
        }
        case 'region_highlighted': {
          const nodeIds = (payload.node_ids as string[] | undefined) ?? [];
          const color = (payload.color as string | undefined) ?? 'yellow';
          const fadeMs = (payload.fade_ms as number | undefined) ?? 5000;
          pushHighlight(projectId, {
            node_ids: nodeIds,
            color,
            expires_at: Date.now() + fadeMs,
          });
          break;
        }
        case 'agent_activity': {
          const symbolNames = (payload.symbol_ids as string[] | undefined) ?? [];
          pushActivity({
            id: (payload.id as string | undefined) ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
            query_type: (payload.query_type as string | undefined) ?? 'unknown',
            task: (payload.task as string | undefined) ?? '',
            cluster_id: (payload.cluster_id as string | null | undefined) ?? null,
            symbol_ids: symbolNames,
            ts: Date.now(),
            summary: payload.summary as string | undefined,
            steps: (payload.steps as AgentActivity['steps']) ?? [],
          });

          // Light up touched symbols on the graph. The agent's symbol_ids
          // are qualified_names (the bundle wire format); the graph's node
          // ids are stringified ObjectIds. Translate by scanning the current
          // symbol projection's labels. Pulled imperatively from the store
          // so the SSE handler doesn't need to be re-keyed when projections
          // change.
          if (symbolNames.length > 0) {
            const symGraph = useCartographerStore
              .getState()
              .byRepo[projectId]?.graphs?.symbol;
            if (symGraph) {
              const nameToId = new Map<string, string>();
              for (const n of symGraph.nodes) nameToId.set(n.label, n.id);
              const nodeIds = symbolNames
                .map((n) => nameToId.get(n))
                .filter((v): v is string => !!v);
              if (nodeIds.length > 0) {
                pushHighlight(projectId, {
                  node_ids: nodeIds,
                  color: 'emerald',
                  expires_at: Date.now() + 5000,
                });
              }
            }
          }
          break;
        }
        case 'agent_run_started': {
          const runId = payload.run_id as string | undefined;
          if (!runId) break;
          upsertAgentRun({
            run_id: runId,
            template_id: (payload.template_id as string | undefined) ?? '',
            prompt: (payload.prompt as string | undefined) ?? '',
            status: 'running',
            started_at: Date.now(),
            steps: [],
          });
          break;
        }
        case 'agent_step': {
          const runId = payload.run_id as string | undefined;
          if (!runId) break;
          appendAgentStep(runId, {
            step: (payload.step as number | undefined) ?? 0,
            role: (payload.role as 'thought' | 'tool_call' | 'tool_result' | 'final' | undefined) ?? 'thought',
            payload: (payload.payload as Record<string, unknown> | undefined) ?? {},
            ts: Date.now(),
          });
          break;
        }
        case 'agent_run_finished': {
          const runId = payload.run_id as string | undefined;
          if (!runId) break;
          const status = (payload.status as 'succeeded' | 'failed' | 'cancelled' | undefined) ?? 'succeeded';
          finishAgentRun(runId, status, payload.result, payload.error as string | undefined);
          break;
        }
      }
    },
    [projectId, refetchLayer, setIndex, pushHighlight, pushActivity, upsertAgentRun, appendAgentStep, finishAgentRun],
  );

  useRepoStream(projectId, handleEvent);

  // Prune expired highlights every 1s so the visual fade actually fires —
  // without this, a 5s expiry window only "ends" the next time something
  // else writes to the store. Cheap: it's a no-op when nothing has expired.
  const pruneExpiredHighlights = useCartographerStore((s) => s.pruneExpiredHighlights);
  useEffect(() => {
    if (!projectId) return;
    const t = setInterval(() => pruneExpiredHighlights(projectId), 1000);
    return () => clearInterval(t);
  }, [projectId, pruneExpiredHighlights]);

  const handleHighlight = (query: AgentQuery) => {
    setHighlightedQuery(query);
    // Auto-dismiss after 5 seconds — clear any previous pending dismiss first.
    if (highlightTimeoutRef.current !== null) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedQuery(null);
      highlightTimeoutRef.current = null;
    }, 5000);
  };

  // Cleanup the highlight timeout and all debounce timeouts on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        clearTimeout(highlightTimeoutRef.current);
      }
      Object.values(refetchDebounceRefs.current).forEach((id) => {
        if (id !== undefined) clearTimeout(id);
      });
    };
  }, []);


  const resetView = () => {
    // Reset will be handled by the auto-fit logic in UnifiedGraphView
    setZoomLevel(100);
  };

  // Symbol projection used to count children at a given hierarchy level.
  // Drives the empty-level skip logic so the toolbar never lands on a view
  // that would render a single box (or none).
  const symbolGraphForProbe = useCartographerStore(
    (s) => s.byRepo[projectId]?.graphs?.symbol,
  );

  // Probe: how many distinct child names exist at `level` for the given
  // focus path? An empty (size 0) or singleton (size 1) result means the
  // level is trivial and should be skipped during navigation. Returns the
  // distinct names so we can auto-pick when there's a singleton.
  const childrenAt = useCallback(
    (level: ViewLevel, focus: string[]): { names: string[]; total: number } => {
      // Layers always has the four standard bands — never trivial.
      if (level === 'layers') {
        return { names: ['Controller', 'Service', 'Repository', 'Entity'], total: 4 };
      }
      if (!symbolGraphForProbe) return { names: [], total: 0 };

      // Restrict to symbols matching the current focus stack. We use file_path
      // as the universal coordinate: the tier focus picks the top-level dir,
      // the layer focus filters by classifyLayerBand, etc.
      const tierFocus = focus[0]; // index 0 → tier
      const layerFocus = focus[1] as LayerBand | undefined;

      const inFocus = symbolGraphForProbe.nodes.filter((n) => {
        const fp = (n.metadata?.file_path as string | undefined) ?? '';
        if (tierFocus) {
          const top = fp.split('/').filter(Boolean)[0] ?? '';
          if (top !== tierFocus) return false;
        }
        if (layerFocus) {
          if (classifyLayerBand(n.label, fp) !== layerFocus) return false;
        }
        return true;
      });

      const set = new Set<string>();
      if (level === 'contexts') {
        // Heuristic: the segment immediately following the layer-keyword
        // directory is a "context". Falls back to second path segment.
        for (const n of inFocus) {
          const fp = (n.metadata?.file_path as string | undefined) ?? '';
          const parts = fp.split('/').filter(Boolean);
          // Skip the tier prefix, then look for a non-layer-keyword segment.
          const start = tierFocus ? 1 : 0;
          let key: string | null = null;
          for (let i = start; i < parts.length - 1; i++) {
            const seg = parts[i].toLowerCase();
            if (/(controller|handler|router|routes?|view|page|api|service|manager|usecase|workflow|repository|repo|dao|store|gateway|entity|model|schema|dto|domain)/.test(seg)) continue;
            key = parts[i];
            break;
          }
          if (key) set.add(key);
        }
      } else if (level === 'packages') {
        // Distinct directory paths — these are the "packages".
        for (const n of inFocus) {
          const fp = (n.metadata?.file_path as string | undefined) ?? '';
          const idx = fp.lastIndexOf('/');
          if (idx > 0) set.add(fp.slice(0, idx));
        }
      } else if (level === 'classes') {
        for (const n of inFocus) set.add(n.label);
      }
      return { names: [...set], total: set.size };
    },
    [symbolGraphForProbe],
  );

  // Walk forward from `startIdx` skipping any trivial level (≤1 child). When
  // a level has exactly one child, we auto-fill its focus segment so the
  // breadcrumb still shows what was selected (just rendered faded). Returns
  // the (level, focusPath, skippedLevels) the navigator should land on.
  const skipEmpty = useCallback(
    (startIdx: number, basePath: string[]) => {
      let idx = startIdx;
      const path = [...basePath];
      const skipped = new Set<ViewLevel>();
      while (idx < LEVEL_ORDER.length - 1) {
        const probe = LEVEL_ORDER[idx];
        // Tiers/Layers always render as the abstract tier or layers diagram —
        // they're never trivial in this app.
        if (probe === 'tiers' || probe === 'layers') break;
        const { names, total } = childrenAt(probe, path);
        if (total > 1) break;
        skipped.add(probe);
        if (total === 1) {
          path.push(names[0]);
        }
        idx += 1;
      }
      return { idx, path, skipped };
    },
    [childrenAt],
  );

  // Drilling: focusing on a name at the current level advances to the next
  // finer level. Auto-skips any level that would render a single box (or
  // none) so the user isn't dropped on a useless Contexts view when the
  // codebase has no bounded-context decomposition.
  const advanceFocus = useCallback(
    (name: string) => {
      const currentIdx = LEVEL_ORDER.indexOf(viewLevel);
      if (currentIdx < 0 || currentIdx >= LEVEL_ORDER.length - 1) return;
      const baseNext = [...focusPath.slice(0, currentIdx), name];
      const { idx, path, skipped } = skipEmpty(currentIdx + 1, baseNext);
      setFocusPath(path);
      setSkippedLevels(skipped);
      setViewLevel(LEVEL_ORDER[idx]);
    },
    [viewLevel, focusPath, skipEmpty],
  );

  const handleNodeFocus = useCallback((node: GraphNode) => {
    advanceFocus(node.name);
  }, [advanceFocus]);

  // Toolbar level click: jumps to that level and trims the breadcrumb so the
  // path never claims focus we don't have. If the user clicks a level the
  // navigator would normally skip, we honor it (clicking explicitly is an
  // override) but also rerun the probe to fade out any further empty levels.
  const handleLevelChange = useCallback(
    (next: ViewLevel) => {
      const idx = LEVEL_ORDER.indexOf(next);
      const baseNext = focusPath.slice(0, idx);
      const { idx: landedIdx, path, skipped } = skipEmpty(idx, baseNext);
      setViewLevel(LEVEL_ORDER[landedIdx]);
      setFocusPath(path);
      setSkippedLevels(skipped);
    },
    [focusPath, skipEmpty],
  );

  // Breadcrumb click: jump back to the level whose focus segment was clicked.
  // Skipped levels are still clickable — the user can override the auto-skip
  // and inspect the (single-box) view directly if they want.
  const handleBreadcrumbJump = useCallback((idx: number) => {
    setViewLevel(LEVEL_ORDER[idx]);
    setFocusPath((prev) => prev.slice(0, idx));
    setSkippedLevels((prev) => {
      // Drop any skip markers at or after the level we jumped to — they no
      // longer apply since the user is choosing this level explicitly.
      const next = new Set(prev);
      for (let i = idx; i < LEVEL_ORDER.length; i++) next.delete(LEVEL_ORDER[i]);
      return next;
    });
  }, []);

  // Real repositories from store; fallback to a single-entry list of the
  // currently-loaded repo if the store hasn't been hydrated yet.
  const reposFromStore = useCartographerStore((s) => s.repos);
  const setReposInStore = useCartographerStore((s) => s.setRepos);
  useEffect(() => {
    setSelectedRepository(projectId);
  }, [projectId]);
  useEffect(() => {
    if (reposFromStore.length === 0) {
      listRepos()
        .then((data) => setReposInStore(data))
        .catch(() => {});
    }
  }, [reposFromStore.length, setReposInStore]);
  const repositories = reposFromStore.length > 0
    ? reposFromStore.map((r) => ({ id: r.hash, name: r.name, status: r.status }))
    : [{ id: projectId, name: projectName, status: 'ready' as const }];

  // Handle agent log resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingAgentLog) {
        const windowWidth = window.innerWidth;
        const newWidth = windowWidth - e.clientX;
        setAgentLogWidth(Math.max(250, Math.min(800, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingAgentLog(false);
    };

    if (isResizingAgentLog) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingAgentLog]);

  const handleFileSelect = (item: SelectedPath | null) => {
    setSelectedPath(item);
  };

  return (
    <div
      className="h-screen flex flex-col bg-[#1e1e1e]"
      style={{
        cursor: isResizingAgentLog ? 'col-resize' : 'default',
        userSelect: isResizingAgentLog ? 'none' : 'auto'
      }}
    >
      {/* Top Navigation — sized to match the other workspace toolbars */}
      <nav className="bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center px-3 py-3">
        <div className="flex items-center justify-between w-full">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2"
            title="Back to dashboard"
          >
            <AnimatedLogo size={28} />
            <div className="text-left leading-tight">
              <h1 className="text-lg font-bold text-white leading-none">Repositories</h1>
              <p className="text-[8px] text-gray-400 leading-none mt-1">markcodepolo</p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={selectedRepository}
                onChange={(e) => {
                  const nextHash = e.target.value;
                  setSelectedRepository(nextHash);
                  if (nextHash && nextHash !== projectId) {
                    router.push(`/workspace/${nextHash}`);
                  }
                }}
                className="bg-[#252526] text-white text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.name} {repo.status === 'indexing' ? '(indexing...)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (typeof document === 'undefined') return;
                const root = document.documentElement;
                const next = root.getAttribute('data-theme') === 'light' ? null : 'light';
                if (next) root.setAttribute('data-theme', next);
                else root.removeAttribute('data-theme');
              }}
              className="p-2.5 hover:bg-[#252526] rounded transition-colors text-gray-300"
              title="Toggle light / dark mode"
            >
              ☀︎
            </button>
            <button
              onClick={onShare}
              className="p-2.5 hover:bg-[#252526] rounded transition-colors"
              title="Share"
            >
              <Share2 className="h-5 w-5 text-gray-300" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar (Far Left) */}
        <div className="w-12 bg-[#2d2d2d] flex flex-col items-center py-2 border-r border-[#1e1e1e] flex-shrink-0">
          <button
            onClick={() => {
              if (activeActivity === 'explorer' && !sidebarCollapsed) {
                setSidebarCollapsed(true);
              } else {
                setActiveActivity('explorer');
                setSidebarCollapsed(false);
              }
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'explorer' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Explorer"
          >
            <Files className="h-6 w-6" />
            {activeActivity === 'explorer' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <button
            onClick={() => {
              setActiveActivity('search');
              setSidebarCollapsed(false);
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'search' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Search"
          >
            <Search className="h-6 w-6" />
            {activeActivity === 'search' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <button
            onClick={() => {
              setActiveActivity('source-control');
              setSidebarCollapsed(false);
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'source-control' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Source Control"
          >
            <GitBranch className="h-6 w-6" />
            {activeActivity === 'source-control' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <button
            onClick={() => {
              if (activeActivity === 'agents' && !sidebarCollapsed) {
                setSidebarCollapsed(true);
              } else {
                setActiveActivity('agents');
                setSidebarCollapsed(false);
              }
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'agents' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Agents"
          >
            <Bot className="h-6 w-6" />
            {activeActivity === 'agents' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <div className="flex-1" />

          {/* Legend toggle — flips the floating legend overlay on the canvas. */}
          <button
            onClick={() => setShowLegend((v) => !v)}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              showLegend ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
            title={showLegend ? 'Hide legend' : 'Show legend'}
          >
            <Layers className="h-6 w-6" />
            {showLegend && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />}
          </button>

          {/* Graph Info */}
          <button
            onClick={() => setShowInfoModal(true)}
            className="w-12 h-12 flex items-center justify-center transition-colors relative text-gray-400 hover:text-white"
            title="Workspace help"
          >
            <Info className="h-6 w-6" />
          </button>
        </div>

        {/* Sidebar */}
        {!sidebarCollapsed && (
          <div
            className="bg-[#252526] border-r border-[#1e1e1e] flex flex-col flex-shrink-0"
            style={{ width: `${sidebarWidth}px` }}
          >
            {activeActivity === 'explorer' && (
              <FilesPanel
                repositoryId={projectId}
                selected={selectedPath}
                onFileSelect={handleFileSelect}
                onCollapse={() => setSidebarCollapsed(true)}
              />
            )}
            {activeActivity === 'search' && (
              <div className="p-4">
                <h3 className="text-xs uppercase text-gray-400 font-semibold mb-3">Search</h3>
                <input
                  type="text"
                  placeholder="Search symbols..."
                  className="w-full bg-[#252526] border border-[#1e1e1e] px-3 py-1.5 text-sm text-white rounded focus:outline-none focus:border-[#2DD4BF]"
                />
              </div>
            )}
            {activeActivity === 'source-control' && (
              <div className="p-4">
                <h3 className="text-xs uppercase text-gray-400 font-semibold mb-3">Source Control</h3>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <GitBranch className="h-[17px] w-[17px]" />
                  <span>main</span>
                </div>
              </div>
            )}
            {activeActivity === 'agents' && (
              <AgentsPanel onCollapse={() => setSidebarCollapsed(true)} />
            )}
          </div>
        )}

        {/* Editor Group */}
        <div className="flex-1 flex flex-col">
          {/* Top Bar — primary view tabs (VSCode file-tab style) */}
          <div className="h-9 bg-[#252526] border-b border-[#1e1e1e] flex items-center gap-1 flex-shrink-0 overflow-x-auto overflow-y-hidden">
            {(['diagram', 'invariant'] as ActiveView[]).map((view) => {
              const labels: Record<ActiveView, string> = {
                diagram: 'Diagram',
                invariant: 'Invariants',
              };
              const icons: Record<ActiveView, React.ReactElement> = {
                diagram: <Layers className="h-3.5 w-3.5 text-[#c586c0] flex-shrink-0" />,
                invariant: <ShieldCheck className="h-3.5 w-3.5 text-[#dcdcaa] flex-shrink-0" />,
              };
              const isActive = activeView === view;
              return (
                <div
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`group h-9 px-3 flex items-center gap-2 border-r border-[#1e1e1e] cursor-pointer flex-shrink-0 relative ${
                    isActive
                      ? 'bg-[#1e1e1e] text-white'
                      : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#1e1e1e]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 left-0 right-0 h-[1px] bg-[#2DD4BF]" />
                  )}
                  {icons[view]}
                  <span className="text-sm whitespace-nowrap">{labels[view]}</span>
                  <span className="opacity-0 group-hover:opacity-100 hover:bg-[#3e3e42] rounded p-0.5 transition-all flex-shrink-0">
                    <X className="h-3 w-3" />
                  </span>
                </div>
              );
            })}
          </div>

          {activeView === 'diagram' && (
            <>
              {/* View-level selector (Tiers / Layers / Contexts / Packages /
                  Classes). Files / Database density toggle lives here too. */}
              <ViewLevelToolbar
                value={viewLevel}
                onChange={handleLevelChange}
                density={diagramDensity}
                onDensityChange={setDiagramDensity}
              />
              {/* Symbol/Flow/Architecture multi-toggle from main — kept only at
                  the Classes level (the leaf view supports flipping between
                  the three underlying projections; coarser levels pin to one
                  canonical layer). */}
              {viewLevel === 'classes' && (
                <DiagramToolbar
                  activeLayers={diagramLayers}
                  onToggleLayer={toggleDiagramLayer}
                />
              )}
            </>
          )}
          {activeView === 'invariant' && <InvariantToolbar />}

          {/* Visualization Content */}
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-hidden flex flex-col">
              {isGraphView && (
                <FocusBreadcrumb
                  viewLevel={viewLevel}
                  focusPath={focusPath}
                  skippedLevels={skippedLevels}
                  onJump={handleBreadcrumbJump}
                />
              )}
              {/* `key` forces a remount on view swap so the uml-view-fade
                  keyframe re-runs and the user perceives the swap as a brief
                  zoom-in rather than an instant page swap. */}
              <div key={`${activeView}-${viewLevel}`} className="flex-1 overflow-hidden uml-view-fade relative">
              {isGraphView && (viewLevel === 'tiers' || viewLevel === 'layers') && (
                /* Root flowchart — synthetic tier/layer view that always
                   renders, even on repos whose architecture projection is
                   sparse or empty. Layer counts come from the live symbol
                   projection so the user sees real numbers. */
                <RootFlowView repositoryId={projectId} level={viewLevel} />
              )}
              {isGraphView && viewLevel === 'contexts' && (
                <ContextsView repositoryId={projectId} onContextFocus={advanceFocus} />
              )}
              {isGraphView && viewLevel === 'packages' && (
                <PackagesView
                  repositoryId={projectId}
                  /* focusPath at packages depth: [tier, layer, context]; the
                     context segment scopes the package set so users see the
                     packages that belong to the context they drilled from. */
                  contextFilter={focusPath[2] ?? null}
                  onPackageFocus={advanceFocus}
                />
              )}
              {isGraphView && viewLevel !== 'tiers' && viewLevel !== 'layers' && viewLevel !== 'contexts' && viewLevel !== 'packages' && (
                <UnifiedGraphView
                  repositoryId={projectId}
                  showLegend={showLegend}
                  agentLogCollapsed={agentLogCollapsed}
                  activeModes={activeModes}
                  onNodeSelect={setSelectedNode}
                  onClusterSelect={setSelectedCluster}
                  zoomLevel={zoomLevel}
                  onZoomChange={setZoomLevel}
                  onResetView={resetView}
                  highlightedCluster={highlightedQuery?.cluster || null}
                  sidebarCollapsed={sidebarCollapsed}
                  pathFilter={pathFilter}
                  density={diagramDensity}
                />
              )}
              {activeView === 'invariant' && <InvariantView repositoryId={projectId} showLegend={showLegend} />}
              {/* Cluster info overlay — appears top-right of the canvas
                  when the user clicks a region's header. Stays fixed in
                  screen space (independent of pan/zoom). */}
              {isGraphView && selectedCluster && (
                <div className="absolute top-3 right-3 z-30 max-w-[320px] bg-[#252526] border border-[#3e3e42] rounded-lg shadow-xl p-3">
                  <div className="flex items-start gap-2">
                    <Layers className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                        Cluster
                      </div>
                      <div className="text-sm text-white font-medium leading-snug mb-2 break-words">
                        {selectedCluster.role}
                      </div>
                      <div className="text-xs text-gray-400">
                        {selectedCluster.nodeCount} symbol{selectedCluster.nodeCount === 1 ? '' : 's'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-2 font-mono break-all">
                        id: {selectedCluster.id}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCluster(null)}
                      className="p-1 -m-1 hover:bg-[#3e3e42] rounded transition-colors flex-shrink-0"
                      aria-label="Close cluster info"
                    >
                      <X className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Right Side Panel — Node Info / Agents / Activity */}
            {!agentLogCollapsed && (
              <>
                <div
                  onMouseDown={() => setIsResizingAgentLog(true)}
                  className="w-1 bg-[#1e1e1e] hover:bg-[#2DD4BF] cursor-col-resize transition-colors flex-shrink-0"
                  title="Drag to resize"
                />
                <div
                  className="border-l border-[#1e1e1e] flex-shrink-0"
                  style={{ width: `${agentLogWidth}px` }}
                >
                  <RightSidePanel
                    selectedNode={isGraphView ? selectedNode : null}
                    onClearNode={() => setSelectedNode(null)}
                    onHighlight={handleHighlight}
                    highlightedQueryId={highlightedQuery?.id || null}
                  />
                </div>
              </>
            )}
          </div>

          {/* Bottom Bar — zoom controls */}
          <div className="h-9 bg-[#252526] border-t border-[#1e1e1e] flex items-center px-4 gap-3 flex-shrink-0">
            <span className="text-xs text-gray-500 tracking-wide">ZOOM</span>
            <div className="w-px h-4 bg-[#3e3e42]" />
            <button
              onClick={() => setZoomLevel(Math.max(3, zoomLevel - 10))}
              className="p-2.5 flex items-center justify-center text-sm leading-none text-gray-400 hover:text-white hover:bg-[#252526] rounded transition-colors"
              title="Zoom Out"
            >
              <span className="block w-[13px] h-[13px] text-center leading-[13px]">−</span>
            </button>
            <span className="text-xs text-gray-300 min-w-[42px] text-center">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}
              className="p-2.5 flex items-center justify-center text-sm leading-none text-gray-400 hover:text-white hover:bg-[#252526] rounded transition-colors"
              title="Zoom In"
            >
              <span className="block w-[13px] h-[13px] text-center leading-[13px]">+</span>
            </button>
            <div className="w-px h-4 bg-[#3e3e42]" />
            <button
              onClick={resetView}
              className="p-2.5 flex items-center text-xs leading-none text-gray-400 hover:text-white hover:bg-[#252526] rounded transition-colors"
              title="Reset View"
            >Reset</button>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#2DD4BF] flex items-center px-3 text-xs text-white">
        <div className="flex items-center gap-3">
          <GitBranch className="h-[17px] w-[17px]" />
          <span>main</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-4 text-white/90">
          <span>
            Index Status: {indexStatus
              ? (Object.values(indexStatus.layers).every((l) => l.state === 'done')
                  ? 'Ready'
                  : Object.values(indexStatus.layers).some((l) => l.state === 'running')
                    ? 'Indexing…'
                    : Object.values(indexStatus.layers).some((l) => l.state === 'error')
                      ? 'Error'
                      : 'Pending')
              : 'Loading…'}
          </span>
          <button
            onClick={() => setAgentLogCollapsed(!agentLogCollapsed)}
            className="hover:bg-white/10 px-2 py-0.5 rounded transition-colors"
          >
            {agentLogCollapsed ? 'Show Agent Log' : 'Hide Agent Log'}
          </button>
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && <GraphInfoModal onClose={() => setShowInfoModal(false)} />}
    </div>
  );
}
