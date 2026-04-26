'use client';
import React from 'react';
import { X, Mouse, Zap, Move, Maximize2, Eye } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#252526] border border-[#3e3e42] rounded-lg shadow-2xl max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#3e3e42]">
          <h2 className="text-lg font-bold text-white">Graph Controls & Navigation</h2>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-[#3e3e42] rounded transition-colors"
            title="Close"
          >
            <X className="h-[13px] w-[13px] text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Pan & Navigation */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Mouse className="h-4 w-4 text-[#2DD4BF]" />
              Pan & Navigation
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🖱️
                </div>
                <div>
                  <div className="text-white font-medium">Drag Background</div>
                  <div className="text-xs text-gray-400">Click and drag empty space to pan the viewport</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
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
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <kbd className="text-xs text-gray-400">+</kbd>
                </div>
                <div>
                  <div className="text-white font-medium">Keyboard Zoom In</div>
                  <div className="text-xs text-gray-400">Press + or = to zoom in</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <kbd className="text-xs text-gray-400">-</kbd>
                </div>
                <div>
                  <div className="text-white font-medium">Keyboard Zoom Out</div>
                  <div className="text-xs text-gray-400">Press - or _ to zoom out</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🤏
                </div>
                <div>
                  <div className="text-white font-medium">Pinch to Zoom</div>
                  <div className="text-xs text-gray-400">Use trackpad pinch gesture or Ctrl + scroll wheel</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
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
              <div className="mt-3 p-3 bg-[#1e1e1e] rounded border border-[#3e3e42]">
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
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  🎯
                </div>
                <div>
                  <div className="text-white font-medium">Click Node</div>
                  <div className="text-xs text-gray-400">Click any node to view detailed information in the side panel</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#1e1e1e] rounded flex items-center justify-center flex-shrink-0 mt-0.5">
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
          <div className="p-4 bg-[#1e1e1e] rounded border border-[#3e3e42]">
            <h3 className="text-sm font-bold text-white mb-3">Quick Reference</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-[#252526] border border-[#3e3e42] rounded text-gray-300">+</kbd>
                <span className="text-gray-400">Zoom in</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-[#252526] border border-[#3e3e42] rounded text-gray-300">-</kbd>
                <span className="text-gray-400">Zoom out</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-[#252526] border border-[#3e3e42] rounded text-gray-300">Drag</kbd>
                <span className="text-gray-400">Pan viewport</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-[#252526] border border-[#3e3e42] rounded text-gray-300">Click</kbd>
                <span className="text-gray-400">Select node</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#3e3e42] flex items-center justify-between">
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
