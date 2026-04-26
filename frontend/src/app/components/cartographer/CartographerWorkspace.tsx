'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Settings, Share2, Database, Files, Search, GitBranch, Info, X, Layers, ShieldCheck, Bot } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UnifiedGraphView, GraphNode, GraphMode, PathFilter } from './UnifiedGraphView';
import { InvariantView } from './InvariantView';
import { DiagramToolbar } from './DiagramToolbar';
import { AgentActivityLog, AgentQuery } from './AgentActivityLog';
import { FilesPanel, SelectedPath } from '../workspace/FilesPanel';
import { AgentsPanel } from './AgentsPanel';
import { GraphInfoModal } from './GraphInfoModal';
import { InvariantToolbar } from './InvariantToolbar';
import { getGraph, getIndexStatus } from '../../../lib/api';
import { useRepoStream } from '../../../lib/sse';
import { useCartographerStore } from '../../../lib/store';
import type { GraphProjection, IndexStatus, LayerName, SseEvent } from '../../../lib/types';

interface CartographerWorkspaceProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onShare: () => void;
}

type ActiveView = 'diagram' | 'invariant';
type ActivityBarItem = 'explorer' | 'search' | 'source-control' | 'agents' | 'info';

export function CartographerWorkspace({ projectId, projectName, onBack, onShare }: CartographerWorkspaceProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ActiveView>('diagram');
  const [diagramLayer, setDiagramLayer] = useState<GraphMode>('symbol');
  const [selectedRepository, setSelectedRepository] = useState(projectName);
  const [activeActivity, setActiveActivity] = useState<ActivityBarItem>('explorer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth] = useState(280);
  const [agentLogCollapsed, setAgentLogCollapsed] = useState(false);
  const [agentLogWidth, setAgentLogWidth] = useState(280);
  const [isResizingAgentLog, setIsResizingAgentLog] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [highlightedQuery, setHighlightedQuery] = useState<AgentQuery | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedPath, setSelectedPath] = useState<SelectedPath | null>(null);
  const pathFilter: PathFilter | null = selectedPath
    ? { path: selectedPath.path, kind: selectedPath.kind }
    : null;

  // Derive activeModes from the selected diagram layer.
  const isGraphView = activeView === 'diagram';
  const activeModes: Set<GraphMode> = new Set(isGraphView ? [diagramLayer] : []);

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
          pushActivity({
            id: (payload.id as string | undefined) ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
            query_type: (payload.query_type as string | undefined) ?? 'unknown',
            task: (payload.task as string | undefined) ?? '',
            cluster_id: (payload.cluster_id as string | null | undefined) ?? null,
            symbol_ids: (payload.symbol_ids as string[] | undefined) ?? [],
            ts: Date.now(),
          });
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

  // Mock repositories for demo
  const repositories = [
    { id: '1', name: projectName, status: 'ready', indexedAt: new Date() },
    { id: '2', name: 'react-codebase', status: 'indexing', indexedAt: null },
    { id: '3', name: 'python-backend', status: 'ready', indexedAt: new Date() },
  ];

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
      {/* VS Code Title Bar */}
      <div className="h-9 bg-[#323233] flex items-center px-2 text-xs border-b border-[#1e1e1e]">
        <button
          onClick={onBack}
          className="p-2.5 hover:bg-[#3e3e42] rounded transition-colors mr-2"
        >
          <ArrowLeft className="h-[17px] w-[17px] text-gray-400" />
        </button>

        <div className="flex items-center gap-2 flex-1">
          <Database className="h-[17px] w-[17px] text-[#007acc]" />
          <select
            value={selectedRepository}
            onChange={(e) => setSelectedRepository(e.target.value)}
            className="bg-[#3a3a3a] text-white text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.name}>
                {repo.name} {repo.status === 'indexing' ? '(indexing...)' : ''}
              </option>
            ))}
          </select>
          <span className="text-gray-500 text-[11px]">Codebase Cartographer</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onShare}
            className="p-2.5 hover:bg-[#3e3e42] rounded transition-colors"
          >
            <Share2 className="h-[17px] w-[17px] text-gray-400" />
          </button>
          <button className="p-2.5 hover:bg-[#3e3e42] rounded transition-colors">
            <Settings className="h-[17px] w-[17px] text-gray-400" />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar (Far Left) */}
        <div className="w-12 bg-[#333333] flex flex-col items-center py-2 border-r border-[#1e1e1e] flex-shrink-0">
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

          {/* Graph Info */}
          <button
            onClick={() => setShowInfoModal(true)}
            className="w-12 h-12 flex items-center justify-center transition-colors relative text-gray-400 hover:text-white"
            title="Graph Controls & Help"
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
                  className="w-full bg-[#3c3c3c] border border-[#1e1e1e] px-3 py-1.5 text-sm text-white rounded focus:outline-none focus:border-[#007acc]"
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
                    <span className="absolute top-0 left-0 right-0 h-[1px] bg-[#007acc]" />
                  )}
                  {icons[view]}
                  <span className="text-xs whitespace-nowrap">{labels[view]}</span>
                  <span className="opacity-0 group-hover:opacity-100 hover:bg-[#3e3e42] rounded p-0.5 transition-all flex-shrink-0">
                    <X className="h-3 w-3" />
                  </span>
                </div>
              );
            })}
          </div>

          {activeView === 'diagram' && (
            <DiagramToolbar layer={diagramLayer} onLayerChange={setDiagramLayer} />
          )}
          {activeView === 'invariant' && <InvariantToolbar />}

          {/* Visualization Content */}
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-hidden">
              {isGraphView && (
                <UnifiedGraphView
                  repositoryId={projectId}
                  showLegend={showLegend}
                  agentLogCollapsed={agentLogCollapsed}
                  activeModes={activeModes}
                  onNodeSelect={setSelectedNode}
                  zoomLevel={zoomLevel}
                  onZoomChange={setZoomLevel}
                  onResetView={resetView}
                  highlightedCluster={highlightedQuery?.cluster || null}
                  sidebarCollapsed={sidebarCollapsed}
                  pathFilter={pathFilter}
                />
              )}
              {activeView === 'invariant' && <InvariantView repositoryId={projectId} showLegend={showLegend} />}
            </div>

            {/* Agent Activity Log */}
            {!agentLogCollapsed && (
              <>
                {/* Resize Handle */}
                <div
                  onMouseDown={() => setIsResizingAgentLog(true)}
                  className="w-1 bg-[#1e1e1e] hover:bg-[#007acc] cursor-col-resize transition-colors flex-shrink-0"
                  title="Drag to resize"
                />

                <div className="bg-[#252526] border-l border-[#1e1e1e] relative" style={{ width: `${agentLogWidth}px` }}>
                  <AgentActivityLog
                    onCollapse={() => setAgentLogCollapsed(true)}
                    onHighlight={handleHighlight}
                    highlightedQueryId={highlightedQuery?.id || null}
                  />

                  {/* Node Details Overlay */}
                  {selectedNode && isGraphView && (
                    <div className="absolute top-0 left-0 right-0 bg-[#1e1e1e] border-b border-[#3e3e42] shadow-lg z-10">
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-bold text-white">{selectedNode.name}</h3>
                          <button
                            onClick={() => setSelectedNode(null)}
                            className="p-2.5 hover:bg-[#3e3e42] rounded transition-colors"
                            title="Close"
                          >
                            <X className="h-[17px] w-[17px] text-gray-400" />
                          </button>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-gray-500">Type:</span>
                            <span className="text-white ml-2 capitalize">{selectedNode.type}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Cluster:</span>
                            <span className="text-white ml-2">{selectedNode.cluster}</span>
                          </div>
                          {selectedNode.dependencies && selectedNode.dependencies.length > 0 && (
                            <div>
                              <span className="text-gray-500">Dependencies:</span>
                              <div className="mt-1 space-y-1">
                                {selectedNode.dependencies.map((dep, idx) => (
                                  <div key={`${selectedNode?.id}-${dep}-${idx}`} className="text-blue-400 ml-2">
                                    → {dep}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
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
              className="p-2.5 flex items-center justify-center text-sm leading-none text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded transition-colors"
              title="Zoom Out"
            >
              <span className="block w-[13px] h-[13px] text-center leading-[13px]">−</span>
            </button>
            <span className="text-xs text-gray-300 min-w-[42px] text-center">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}
              className="p-2.5 flex items-center justify-center text-sm leading-none text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded transition-colors"
              title="Zoom In"
            >
              <span className="block w-[13px] h-[13px] text-center leading-[13px]">+</span>
            </button>
            <div className="w-px h-4 bg-[#3e3e42]" />
            <button
              onClick={resetView}
              className="p-2.5 flex items-center text-xs leading-none text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded transition-colors"
              title="Reset View"
            >Reset</button>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#007acc] flex items-center px-3 text-xs text-white">
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
