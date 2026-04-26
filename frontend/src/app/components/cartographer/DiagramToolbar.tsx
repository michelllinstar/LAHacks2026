'use client';
import { Boxes, GitMerge, Layers3 } from 'lucide-react';
import type { GraphMode } from './UnifiedGraphView';

interface DiagramToolbarProps {
  /** Set of currently-active overlay modes. Multi-select: any combination
   *  of symbol/flow/architecture can be on simultaneously. */
  activeLayers: Set<GraphMode>;
  onToggleLayer: (layer: GraphMode) => void;
}

interface LayerDef {
  id: GraphMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
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

export function DiagramToolbar({ activeLayers, onToggleLayer }: DiagramToolbarProps) {
  const enabled = LAYERS.filter((l) => activeLayers.has(l.id));
  const summary =
    enabled.length === 0
      ? 'No overlays — click a layer to enable'
      : enabled.map((l) => l.label).join(' + ');
  return (
    <div className="bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-stretch flex-shrink-0">
      <div className="flex items-center gap-2.5 p-2.5">
        {LAYERS.map(({ id, label, icon: Icon, accent }) => {
          const isActive = activeLayers.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggleLayer(id)}
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 p-2.5 rounded text-xs font-medium tracking-wide transition-colors border ${
                isActive
                  ? 'bg-[#1e1e1e] text-white'
                  : 'bg-transparent text-gray-400 border-transparent hover:text-white hover:bg-[#1e1e1e]'
              }`}
              style={isActive ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}55` } : undefined}
              title={`Toggle ${label} overlay`}
            >
              <Icon className="h-[13px] w-[13px]" style={{ color: accent }} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="w-px bg-[#3e3e42] my-2" />
      <div className="flex items-center gap-2 px-3 leading-snug min-w-0 flex-1">
        <div className="flex items-center gap-1 flex-shrink-0">
          {enabled.length === 0 ? (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-600" />
          ) : (
            enabled.map((l) => (
              <span
                key={l.id}
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: l.accent }}
              />
            ))
          )}
        </div>
        <span className="text-xs text-gray-300 font-medium">{summary}</span>
        {enabled.length > 0 && (
          <span className="text-[10px] text-gray-500 truncate">
            — overlays active
          </span>
        )}
      </div>
    </div>
  );
}
