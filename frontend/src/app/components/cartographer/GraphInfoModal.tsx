'use client';
import React from 'react';
import { X, Mouse, Zap, Move, Maximize2, Eye, Layers, Compass } from 'lucide-react';

interface GraphInfoModalProps {
  onClose: () => void;
}

export function GraphInfoModal({ onClose }: GraphInfoModalProps) {
  // Handle ESC key to close
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="glass-panel rounded-3xl max-w-2xl w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden anim-fade-up aurora-bg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Workspace & Graph Controls</h2>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-white/10 rounded transition-colors"
            title="Close"
          >
            <X className="h-[13px] w-[13px] text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* View Hierarchy — drill-down */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#2DD4BF]" />
              View Hierarchy
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-medium flex-shrink-0 mt-0.5 text-white">
                  Tiers › Layers › Contexts › Packages › Classes
                </div>
              </div>
              <div className="text-xs text-gray-400 pl-1">
                The toolbar above the graph drills from the broadest view down to
                individual classes. Click a region in the canvas to drop into the
                next level focused on what you clicked. Levels with nothing
                meaningful to split are auto-skipped and rendered as faded stubs
                in the breadcrumb.
              </div>
              <div className="flex items-start gap-3 mt-2">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🍞
                </div>
                <div>
                  <div className="text-white font-medium">Focus Breadcrumb</div>
                  <div className="text-xs text-gray-400">
                    Tiers › Backend › Service › … — click any segment to jump
                    back to that level. Faded segments are skipped levels you
                    can still re-enter manually.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="px-2 py-1 bg-[#2DD4BF] text-white rounded text-xs font-medium flex-shrink-0 mt-0.5">
                  Classes
                </div>
                <div>
                  <div className="text-white font-medium">Multi-layer overlay (Classes view only)</div>
                  <div className="text-xs text-gray-400">
                    The Symbol / Flow / Architecture toggle lights up at the
                    Classes level, where you can overlay any combination of
                    the three projections. Coarser levels pin to one canonical
                    projection.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Workspace Layout — sidebars */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Compass className="h-4 w-4 text-[#2DD4BF]" />
              Workspace Layout
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  📂
                </div>
                <div>
                  <div className="text-white font-medium">Activity Bar (left)</div>
                  <div className="text-xs text-gray-400">
                    Explorer, Search, Source Control, Agents, and Info. Click
                    a tab to swap the side panel; click the active tab again
                    to collapse it for a wider canvas.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  📋
                </div>
                <div>
                  <div className="text-white font-medium">Right Side Panel</div>
                  <div className="text-xs text-gray-400">
                    Stacks Node Info on top of Agent Activity. Drag the
                    divider between them to resize, or hide either section
                    with its × button — the toolbar above will show a + chip
                    so you can bring it back.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🤖
                </div>
                <div>
                  <div className="text-white font-medium">Agents Tab</div>
                  <div className="text-xs text-gray-400">
                    Register an external agent (any HTTP endpoint that speaks
                    the Cartographer wire contract); each run posts a card to
                    Agent Activity with the model&rsquo;s reasoning steps and
                    citation links back to the graph.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pan & Navigation */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Mouse className="h-4 w-4 text-[#2DD4BF]" />
              Pan & Navigation
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🖱️
                </div>
                <div>
                  <div className="text-white font-medium">Drag Background</div>
                  <div className="text-xs text-gray-400">Click and drag empty space to pan the viewport</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  📦
                </div>
                <div>
                  <div className="text-white font-medium">Drag Nodes</div>
                  <div className="text-xs text-gray-400">Click and drag individual nodes to reposition them - connections follow automatically</div>
                </div>
              </div>
            </div>
          </div>

          {/* Zoom Controls */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#2DD4BF]" />
              Zoom Controls
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <kbd className="text-xs text-gray-400">+</kbd>
                </div>
                <div>
                  <div className="text-white font-medium">Keyboard Zoom In</div>
                  <div className="text-xs text-gray-400">Press + or = to zoom in</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <kbd className="text-xs text-gray-400">-</kbd>
                </div>
                <div>
                  <div className="text-white font-medium">Keyboard Zoom Out</div>
                  <div className="text-xs text-gray-400">Press - or _ to zoom out</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🤏
                </div>
                <div>
                  <div className="text-white font-medium">Pinch to Zoom</div>
                  <div className="text-xs text-gray-400">Use trackpad pinch gesture or Ctrl + scroll wheel</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Maximize2 className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div>
                  <div className="text-white font-medium">Reset View</div>
                  <div className="text-xs text-gray-400">Click Reset button in toolbar to return to default zoom and position</div>
                </div>
              </div>
            </div>
          </div>

          {/* Graph Modes */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Move className="h-4 w-4 text-[#2DD4BF]" />
              Graph Modes
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="px-2 py-1 bg-[#2DD4BF] text-white rounded text-xs font-medium flex-shrink-0 mt-0.5">
                  Symbol
                </div>
                <div>
                  <div className="text-white font-medium">Symbol Graph</div>
                  <div className="text-xs text-gray-400">View dependencies between classes, functions, and modules with dashed arrows</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="px-2 py-1 bg-[#2DD4BF] text-white rounded text-xs font-medium flex-shrink-0 mt-0.5">
                  Flow
                </div>
                <div>
                  <div className="text-white font-medium">Data Flow</div>
                  <div className="text-xs text-gray-400">Trace parameter passing and return flows with curved blue arrows</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="px-2 py-1 bg-[#2DD4BF] text-white rounded text-xs font-medium flex-shrink-0 mt-0.5">
                  Architecture
                </div>
                <div>
                  <div className="text-white font-medium">Architecture View</div>
                  <div className="text-xs text-gray-400">See cluster boundaries and cross-cluster dependencies (red = cross-cluster)</div>
                </div>
              </div>
              <div className="mt-3 p-3 bg-white/5 rounded border border-white/10">
                <div className="text-xs text-gray-400">
                  <strong className="text-white">💡 Tip:</strong> You can enable multiple modes at once to overlay different connection types
                </div>
              </div>
            </div>
          </div>

          {/* Node Interaction */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-[#2DD4BF]" />
              Node Interaction
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🎯
                </div>
                <div>
                  <div className="text-white font-medium">Click Node</div>
                  <div className="text-xs text-gray-400">Click any node to view detailed information in the side panel</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  ✨
                </div>
                <div>
                  <div className="text-white font-medium">Agent Highlights</div>
                  <div className="text-xs text-gray-400">Click "Highlight in view" in the agent log to see color-coded dots on related nodes</div>
                </div>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="p-4 bg-white/5 rounded border border-white/10">
            <h3 className="text-sm font-bold text-white mb-3">Quick Reference</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white/5 border border-white/15 rounded text-gray-200">+</kbd>
                <span className="text-gray-400">Zoom in</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white/5 border border-white/15 rounded text-gray-200">-</kbd>
                <span className="text-gray-400">Zoom out</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white/5 border border-white/15 rounded text-gray-200">Drag</kbd>
                <span className="text-gray-400">Pan viewport</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white/5 border border-white/15 rounded text-gray-200">Click</kbd>
                <span className="text-gray-400">Select node</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-gray-500">Press ESC to close</div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2DD4BF] hover:bg-[#006bb3] text-white text-sm rounded transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
