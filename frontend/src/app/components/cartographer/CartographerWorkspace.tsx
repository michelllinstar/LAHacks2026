'use client';
import { useState, useEffect } from 'react';
import { ArrowLeft, Settings, Share2, Database, Files, Search, GitBranch, Info, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UnifiedGraphView, GraphNode, GraphMode } from './UnifiedGraphView';
import { InvariantView } from './InvariantView';
import { AgentActivityLog, AgentQuery } from './AgentActivityLog';
import { FilesPanel } from '../workspace/FilesPanel';
import { GraphInfoModal } from './GraphInfoModal';
import { GraphToolbar } from './GraphToolbar';
import { InvariantToolbar } from './InvariantToolbar';
import { LayerTabs } from './LayerTabs';

interface CartographerWorkspaceProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onShare: () => void;
}

type LayerView = 'graph' | 'invariant';
type ActivityBarItem = 'explorer' | 'search' | 'source-control' | 'info';

export function CartographerWorkspace({ projectId, projectName, onBack, onShare }: CartographerWorkspaceProps) {
  const navigate = useNavigate();
  const [activeLayer, setActiveLayer] = useState<LayerView>('graph');
  const [activeModes, setActiveModes] = useState<Set<GraphMode>>(new Set(['symbol']));
  const [selectedRepository, setSelectedRepository] = useState(projectName);
  const [activeActivity, setActiveActivity] = useState<ActivityBarItem>('explorer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth] = useState(280); // Fixed consistent width for explorer
  const [agentLogCollapsed, setAgentLogCollapsed] = useState(false);
  const [agentLogWidth, setAgentLogWidth] = useState(280);
  const [isResizingAgentLog, setIsResizingAgentLog] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [highlightedQuery, setHighlightedQuery] = useState<AgentQuery | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const handleHighlight = (query: AgentQuery) => {
    setHighlightedQuery(query);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setHighlightedQuery(null);
    }, 5000);
  };

  const toggleMode = (mode: GraphMode) => {
    setActiveModes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mode)) {
        if (newSet.size > 1) { // Keep at least one mode active
          newSet.delete(mode);
        }
      } else {
        newSet.add(mode);
      }
      return newSet;
    });
  };

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
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingAgentLog]);

  const handleFileSelect = (file: any) => {
    console.log('File selected:', file);
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
          className="p-1.5 hover:bg-[#3e3e42] rounded transition-colors mr-2"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-gray-400" />
        </button>

        <div className="flex items-center gap-2 flex-1">
          <Database className="h-3.5 w-3.5 text-[#007acc]" />
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
            className="p-1.5 hover:bg-[#3e3e42] rounded transition-colors"
          >
            <Share2 className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <button className="p-1.5 hover:bg-[#3e3e42] rounded transition-colors">
            <Settings className="h-3.5 w-3.5 text-gray-400" />
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
                  <GitBranch className="h-4 w-4" />
                  <span>main</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Editor Group */}
        <div className="flex-1 flex flex-col">
          {/* Layer Tabs Component */}
          <LayerTabs activeLayer={activeLayer} onLayerChange={setActiveLayer} />

          {/* Toolbar Component */}
          {activeLayer === 'graph' && (
            <GraphToolbar
              activeModes={activeModes}
              onToggleMode={toggleMode}
              zoomLevel={zoomLevel}
              onZoomChange={setZoomLevel}
              onResetView={resetView}
            />
          )}
          {activeLayer === 'invariant' && <InvariantToolbar />}

          {/* Visualization Content */}
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-hidden">
              {activeLayer === 'graph' && (
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
                />
              )}
              {activeLayer === 'invariant' && <InvariantView repositoryId={projectId} showLegend={showLegend} />}
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
                  {selectedNode && activeLayer === 'graph' && (
                    <div className="absolute top-0 left-0 right-0 bg-[#1e1e1e] border-b border-[#3e3e42] shadow-lg z-10">
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-bold text-white">{selectedNode.name}</h3>
                          <button
                            onClick={() => setSelectedNode(null)}
                            className="p-1 hover:bg-[#3e3e42] rounded transition-colors"
                            title="Close"
                          >
                            <X className="h-3 w-3 text-gray-400" />
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
                                  <div key={idx} className="text-blue-400 ml-2">
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
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#007acc] flex items-center px-3 text-xs text-white">
        <div className="flex items-center gap-3">
          <GitBranch className="h-3 w-3" />
          <span>main</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-4 text-white/90">
          <span>Index Status: Ready</span>
          <span>Last Updated: 2 minutes ago</span>
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
