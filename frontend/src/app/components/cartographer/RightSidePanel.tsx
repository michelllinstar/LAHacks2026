'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Cpu, Workflow, Network, ShieldCheck, Layers } from 'lucide-react';
import { toast } from 'sonner';
import type { GraphNode } from './UnifiedGraphView';
import { AgentActivityLog, AgentQuery } from './AgentActivityLog';

type PanelKey = 'node' | 'agents' | 'activity';

const AGENT_ROSTER: Array<{ id: string; label: string; icon: typeof Cpu; hint: string }> = [
  { id: 'coordinator', label: 'Coordinator', icon: Cpu, hint: 'Routes context queries' },
  { id: 'symbol', label: 'Symbol Analyst', icon: Layers, hint: 'Layer 1 symbol lookups' },
  { id: 'flow', label: 'Flow Analyst', icon: Workflow, hint: 'Call / data flow tracing' },
  { id: 'arch', label: 'Architecture Analyst', icon: Network, hint: 'Cluster boundaries' },
  { id: 'invariant', label: 'Invariant Reporter', icon: ShieldCheck, hint: 'Constraint mining' },
];

interface RightSidePanelProps {
  selectedNode: GraphNode | null;
  onClearNode: () => void;
  onHighlight: (q: AgentQuery) => void;
  highlightedQueryId: string | null;
}

export function RightSidePanel({
  selectedNode,
  onClearNode,
  onHighlight,
  highlightedQueryId,
}: RightSidePanelProps) {
  const [open, setOpen] = useState<Record<PanelKey, boolean>>({
    node: false,
    agents: true,
    activity: true,
  });
  // Sizes are unitless; the visible panels are normalized at render so the
  // sum always fills the column. Defaults map to the requested 30/30/40.
  const [size, setSize] = useState<Record<PanelKey, number>>({
    node: 30,
    agents: 30,
    activity: 40,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-open the node panel whenever a node is selected so clicking a
  // node always reveals its details, even after the user collapsed it.
  useEffect(() => {
    if (selectedNode) setOpen((p) => ({ ...p, node: true }));
  }, [selectedNode]);

  const toggle = (k: PanelKey) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const startResize = (above: PanelKey, below: PanelKey) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const containerH = containerRef.current?.clientHeight ?? 1;
    const aStart = size[above];
    const bStart = size[below];
    const onMove = (ev: MouseEvent) => {
      const deltaPct = ((ev.clientY - startY) / containerH) * 100;
      const newA = Math.max(10, Math.min(80, aStart + deltaPct));
      const newB = Math.max(10, Math.min(80, bStart - deltaPct));
      setSize((p) => ({ ...p, [above]: newA, [below]: newB }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const orderedKeys: PanelKey[] = ['node', 'agents', 'activity'];
  const visibleKeys = orderedKeys.filter((k) => open[k]);
  const totalSize = visibleKeys.reduce((s, k) => s + size[k], 0) || 1;
  const flexFor = (k: PanelKey) => (open[k] ? size[k] / totalSize : 0);

  // Index helpers so we know which panel sits below a given panel for the
  // resize handle. Returns null when the given panel is the last visible.
  const nextVisible = (k: PanelKey): PanelKey | null => {
    const idx = visibleKeys.indexOf(k);
    if (idx < 0 || idx === visibleKeys.length - 1) return null;
    return visibleKeys[idx + 1];
  };

  const handleRunAgent = (label: string) => {
    toast.info(`${label} dispatched`, {
      description: 'Watch the activity feed for results',
    });
  };

  const SectionHeader = ({ title, panel }: { title: string; panel: PanelKey }) => (
    <div className="flex items-center justify-between px-3 py-2 bg-[#2d2d2d] border-b border-[#1e1e1e] flex-shrink-0">
      <h3 className="text-xs font-bold text-white uppercase tracking-wide">{title}</h3>
      <button
        onClick={() => toggle(panel)}
        className="p-1 hover:bg-[#3e3e42] rounded transition-colors"
        title="Hide"
      >
        <X className="h-3 w-3 text-gray-400" />
      </button>
    </div>
  );

  const ResizeHandle = ({ above }: { above: PanelKey }) => {
    const below = nextVisible(above);
    if (!below) return null;
    return (
      <div
        onMouseDown={startResize(above, below)}
        className="h-1 bg-[#1e1e1e] hover:bg-[#2DD4BF] cursor-row-resize transition-colors flex-shrink-0"
        title="Drag to resize"
      />
    );
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#252526]">
      {/* Re-open chips for any collapsed panels */}
      {visibleKeys.length < 3 && (
        <div className="px-2 py-1.5 border-b border-[#1e1e1e] flex items-center gap-1.5 flex-wrap flex-shrink-0">
          {!open.node && (
            <button
              onClick={() => toggle('node')}
              className="text-[11px] text-gray-300 hover:text-white px-2 py-1 rounded bg-[#1e1e1e] hover:bg-[#3e3e42] border border-[#3e3e42]"
            >
              + Node Info
            </button>
          )}
          {!open.agents && (
            <button
              onClick={() => toggle('agents')}
              className="text-[11px] text-gray-300 hover:text-white px-2 py-1 rounded bg-[#1e1e1e] hover:bg-[#3e3e42] border border-[#3e3e42]"
            >
              + Agents
            </button>
          )}
          {!open.activity && (
            <button
              onClick={() => toggle('activity')}
              className="text-[11px] text-gray-300 hover:text-white px-2 py-1 rounded bg-[#1e1e1e] hover:bg-[#3e3e42] border border-[#3e3e42]"
            >
              + Activity
            </button>
          )}
        </div>
      )}

      {/* Node Info */}
      {open.node && (
        <div
          className="flex flex-col min-h-0 overflow-hidden"
          style={{ flex: `${flexFor('node')} 0 0` }}
        >
          <SectionHeader title="Node Info" panel="node" />
          <div className="flex-1 overflow-auto p-3 text-xs">
            {selectedNode ? (
              <div className="space-y-2">
                <div className="text-sm font-bold text-white break-all">{selectedNode.name}</div>
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="text-white capitalize ml-2">{selectedNode.type}</span>
                </div>
                <div>
                  <span className="text-gray-500">Cluster:</span>
                  <span className="text-white ml-2">{selectedNode.cluster}</span>
                </div>
                {selectedNode.filePath && (
                  <div>
                    <span className="text-gray-500">File:</span>
                    <span className="text-white ml-2 font-mono break-all">{selectedNode.filePath}</span>
                  </div>
                )}
                {selectedNode.dependencies && selectedNode.dependencies.length > 0 && (
                  <div>
                    <div className="text-gray-500 mb-1">
                      Dependencies ({selectedNode.dependencies.length})
                    </div>
                    <div className="space-y-0.5">
                      {selectedNode.dependencies.map((d, i) => (
                        <div key={`${d}-${i}`} className="text-[#5EEAD4] font-mono break-all">
                          → {d}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={onClearNode}
                  className="mt-3 text-[11px] text-gray-400 hover:text-white"
                >
                  Clear selection
                </button>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                Click a node in the graph to see its details.
              </div>
            )}
          </div>
        </div>
      )}
      <ResizeHandle above="node" />

      {/* Available Tools */}
      {open.agents && (
        <div
          className="flex flex-col min-h-0 overflow-hidden"
          style={{ flex: `${flexFor('agents')} 0 0` }}
        >
          <SectionHeader title="Available Tools" panel="agents" />
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {AGENT_ROSTER.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => handleRunAgent(a.label)}
                  className="w-full flex items-start gap-2 p-2 rounded text-left hover:bg-[#2d2d2d] transition-colors border border-[#3e3e42] bg-[#1e1e1e]"
                >
                  <Icon className="h-4 w-4 text-[#2DD4BF] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white">{a.label}</div>
                    <div className="text-[10px] text-gray-400 truncate">{a.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <ResizeHandle above="agents" />

      {/* Agent Activity — uses AgentActivityLog's own header (it already has X) */}
      {open.activity && (
        <div
          className="flex flex-col min-h-0 overflow-hidden"
          style={{ flex: `${flexFor('activity')} 0 0` }}
        >
          <AgentActivityLog
            onCollapse={() => toggle('activity')}
            onHighlight={onHighlight}
            highlightedQueryId={highlightedQueryId}
          />
        </div>
      )}
    </div>
  );
}
