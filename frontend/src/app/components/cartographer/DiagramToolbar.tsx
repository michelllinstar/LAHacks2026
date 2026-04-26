'use client';
import { Boxes, GitMerge, Layers3 } from 'lucide-react';
import type { GraphMode } from './UnifiedGraphView';

interface DiagramToolbarProps {
  layer: GraphMode;
  onLayerChange: (layer: GraphMode) => void;
}

interface LayerDef {
  id: GraphMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const LAYERS: LayerDef[] = [
  {
    id: 'symbol',
    label: 'Symbol',
    description: 'Classes, functions & their direct references',
    icon: Boxes,
    accent: '#3b82f6',
  },
  {
    id: 'flow',
    label: 'Flow',
    description: 'Call & data flow between symbols',
    icon: GitMerge,
    accent: '#22c55e',
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'Cluster-level dependencies across the codebase',
    icon: Layers3,
    accent: '#f59e0b',
  },
];

export function DiagramToolbar({ layer, onLayerChange }: DiagramToolbarProps) {
  const active = LAYERS.find((l) => l.id === layer) ?? LAYERS[0];
  return (
    <div className="bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-stretch flex-shrink-0">
      <div className="flex items-center gap-2.5 p-2.5">
        {LAYERS.map(({ id, label, icon: Icon, accent }) => {
          const isActive = id === layer;
          return (
            <button
              key={id}
              onClick={() => onLayerChange(id)}
              className={`flex items-center gap-1.5 p-2.5 rounded text-xs font-medium tracking-wide transition-colors border ${
                isActive
                  ? 'bg-[#1e1e1e] text-white'
                  : 'bg-transparent text-gray-400 border-transparent hover:text-white hover:bg-[#1e1e1e]'
              }`}
              style={isActive ? { borderColor: accent } : undefined}
              title={label}
            >
              <Icon className="h-[13px] w-[13px]" style={{ color: accent }} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="w-px bg-[#3e3e42] my-2" />
      <div className="flex items-center gap-2 px-3 text-[11px] text-gray-400 min-w-0">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: active.accent }}
        />
        <span className="text-gray-300 font-medium">{active.label} layer</span>
        <span className="text-gray-500 truncate">— {active.description}</span>
      </div>
    </div>
  );
}
