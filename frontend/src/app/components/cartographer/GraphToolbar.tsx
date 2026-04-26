'use client';
import { Network, GitBranch, Boxes, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { GraphMode } from './UnifiedGraphView';

interface GraphToolbarProps {
  activeModes: Set<GraphMode>;
  onToggleMode: (mode: GraphMode) => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
}

export function GraphToolbar({ activeModes, onToggleMode, zoomLevel, onZoomChange, onResetView }: GraphToolbarProps) {
  return (
    <div
      className="h-10 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center px-3 gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-[#3e3e42] scrollbar-track-transparent hover:scrollbar-thumb-[#3e3e42]"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#3e3e42 transparent',
        flexWrap: 'nowrap',
      }}
    >
      {/* Graph Mode Toggle - Multi-select */}
      <div className="flex items-center gap-1 bg-[#1e1e1e] rounded border border-[#3e3e42] p-0.5 flex-shrink-0">
        <button
          onClick={() => onToggleMode('symbol')}
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            activeModes.has('symbol')
              ? 'bg-[#2DD4BF] text-white'
              : 'text-gray-300 hover:bg-[#252526]'
          }`}
          title="Toggle Symbol Graph"
        >
          <Network className="h-3 w-3" />
          Symbol
        </button>
        <button
          onClick={() => onToggleMode('flow')}
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            activeModes.has('flow')
              ? 'bg-[#2DD4BF] text-white'
              : 'text-gray-300 hover:bg-[#252526]'
          }`}
          title="Toggle Data Flow"
        >
          <GitBranch className="h-3 w-3" />
          Flow
        </button>
        <button
          onClick={() => onToggleMode('architecture')}
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            activeModes.has('architecture')
              ? 'bg-[#2DD4BF] text-white'
              : 'text-gray-300 hover:bg-[#252526]'
          }`}
          title="Toggle Architecture View"
        >
          <Boxes className="h-3 w-3" />
          Architecture
        </button>
      </div>

      <div className="w-px h-6 bg-[#3e3e42] flex-shrink-0" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1 bg-[#1e1e1e] rounded border border-[#3e3e42] p-0.5 flex-shrink-0">
        <button
          onClick={() => onZoomChange(Math.max(50, zoomLevel - 10))}
          className="p-1 hover:bg-[#252526] rounded transition-colors"
          title="Zoom Out (- key)"
        >
          <ZoomOut className="h-3.5 w-3.5 text-gray-300" />
        </button>
        <span className="text-xs text-gray-300 px-2 min-w-[45px] text-center">{zoomLevel}%</span>
        <button
          onClick={() => onZoomChange(Math.min(200, zoomLevel + 10))}
          className="p-1 hover:bg-[#252526] rounded transition-colors"
          title="Zoom In (+ key)"
        >
          <ZoomIn className="h-3.5 w-3.5 text-gray-300" />
        </button>
        <div className="w-px h-5 bg-[#3e3e42] mx-0.5" />
        <button
          onClick={onResetView}
          className="p-1 hover:bg-[#252526] rounded transition-colors"
          title="Reset View"
        >
          <Maximize className="h-3.5 w-3.5 text-gray-300" />
        </button>
      </div>

      <div className="w-px h-6 bg-[#3e3e42] flex-shrink-0" />

      <div className="flex items-center gap-2 px-3 py-1 bg-[#1e1e1e] rounded border border-[#3e3e42] flex-shrink-0">
        <span className="text-xs text-gray-400 whitespace-nowrap">Components:</span>
        <span className="text-xs text-white font-semibold">142</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1 bg-[#1e1e1e] rounded border border-[#3e3e42] flex-shrink-0">
        <span className="text-xs text-gray-400 whitespace-nowrap">Dependencies:</span>
        <span className="text-xs text-white font-semibold">86</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1 bg-[#1e1e1e] rounded border border-[#3e3e42] flex-shrink-0">
        <span className="text-xs text-gray-400 whitespace-nowrap">Clusters:</span>
        <span className="text-xs text-white font-semibold">5</span>
      </div>
      <div className="w-px h-6 bg-[#3e3e42] flex-shrink-0" />
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Class</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Function</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-purple-500 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Interface</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Module</span>
        </div>
      </div>
    </div>
  );
}
