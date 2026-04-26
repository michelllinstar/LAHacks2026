'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { GraphNode } from './UnifiedGraphView';
import { AgentActivityLog, AgentQuery } from './AgentActivityLog';

type PanelKey = 'node' | 'activity';

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
    activity: true,
  });
  const [size, setSize] = useState<Record<PanelKey, number>>({
    node: 40,
    activity: 60,
  });
  const containerRef = useRef<HTMLDivElement>(null);

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

  const orderedKeys: PanelKey[] = ['node', 'activity'];
  const visibleKeys = orderedKeys.filter((k) => open[k]);
  const totalSize = visibleKeys.reduce((s, k) => s + size[k], 0) || 1;
  const flexFor = (k: PanelKey) => (open[k] ? size[k] / totalSize : 0);

  const nextVisible = (k: PanelKey): PanelKey | null => {
    const idx = visibleKeys.indexOf(k);
    if (idx < 0 || idx === visibleKeys.length - 1) return null;
    return visibleKeys[idx + 1];
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
      {visibleKeys.length < orderedKeys.length && (
        <div className="px-2 py-1.5 border-b border-[#1e1e1e] flex items-center gap-1.5 flex-wrap flex-shrink-0">
          {!open.node && (
            <button
              onClick={() => toggle('node')}
              className="text-[11px] text-gray-300 hover:text-white px-2 py-1 rounded bg-[#1e1e1e] hover:bg-[#3e3e42] border border-[#3e3e42]"
            >
              + Node Info
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
