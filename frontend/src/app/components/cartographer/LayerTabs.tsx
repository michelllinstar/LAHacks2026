'use client';
interface LayerTabsProps {
  activeLayer: 'graph' | 'invariant';
  onLayerChange: (layer: 'graph' | 'invariant') => void;
}

export function LayerTabs({ activeLayer, onLayerChange }: LayerTabsProps) {
  return (
    <div
      className="h-9 bg-[#252526] border-b border-[#1e1e1e] flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-[#3e3e42] scrollbar-track-transparent"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#3e3e42 transparent',
      }}
    >
      <button
        onClick={() => onLayerChange('graph')}
        className={`h-9 px-3 flex items-center gap-2 border-r border-[#1e1e1e] cursor-pointer flex-shrink-0 ${
          activeLayer === 'graph'
            ? 'bg-[#1e1e1e] text-white'
            : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#1e1e1e]'
        }`}
      >
        <span className="text-xs">Layers 1-3: Graph View</span>
      </button>
      <button
        onClick={() => onLayerChange('invariant')}
        className={`h-9 px-3 flex items-center gap-2 border-r border-[#1e1e1e] cursor-pointer flex-shrink-0 ${
          activeLayer === 'invariant'
            ? 'bg-[#1e1e1e] text-white'
            : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#1e1e1e]'
        }`}
      >
        <span className="text-xs">Layer 4: Invariants</span>
      </button>
    </div>
  );
}
