'use client';
import { Boxes, GitMerge, Layers3, Database, FileCode } from 'lucide-react';
import type { GraphMode, GraphDensity } from './UnifiedGraphView';

interface DiagramToolbarProps {
  /** Set of currently-active overlay modes. Multi-select: any combination
   *  of symbol/flow/architecture can be on simultaneously. */
  activeLayers: Set<GraphMode>;
  onToggleLayer: (layer: GraphMode) => void;
  density: GraphDensity;
  onDensityChange: (density: GraphDensity) => void;
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

export function DiagramToolbar({ activeLayers, onToggleLayer, density, onDensityChange }: DiagramToolbarProps) {
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
      <div className="w-px bg-[#3e3e42] my-2" />
      <div
        className="relative flex items-center gap-1 m-2 rounded-md border border-white/10"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 w-[104px] rounded border border-white/15 transition-transform duration-300 ease-out"
          style={{
            left: 2,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05))',
            boxShadow: '0 1px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
            transform: density === 'detailed' ? 'translateX(0)' : 'translateX(104px)',
          }}
        />
        <button
          type="button"
          onClick={() => onDensityChange('detailed')}
          style={{ width: 104 }}
          className={`relative z-10 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm transition-colors ${
            density === 'detailed' ? 'text-white' : 'text-gray-400 hover:text-white'
          }`}
          title="Show full class cards (best for small repos)"
        >
          <FileCode className="h-3.5 w-3.5" />
          <span>Files</span>
        </button>
        <button
          type="button"
          onClick={() => onDensityChange('compact')}
          style={{ width: 104 }}
          className={`relative z-10 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm transition-colors ${
            density === 'compact' ? 'text-white' : 'text-gray-400 hover:text-white'
          }`}
          title="Show one node per class (best for large repos)"
        >
          <Database className="h-3.5 w-3.5" />
          <span>Database</span>
        </button>
      </div>
    </div>
  );
}
