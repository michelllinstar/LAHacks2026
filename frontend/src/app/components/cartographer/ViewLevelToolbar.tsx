'use client';
import { Database, FileCode } from 'lucide-react';
import type { GraphDensity } from './UnifiedGraphView';

export type ViewLevel = 'tiers' | 'layers' | 'contexts' | 'packages' | 'classes';

interface ViewLevelToolbarProps {
  value: ViewLevel;
  onChange: (next: ViewLevel) => void;
  /** Density (Files vs Database) is only meaningful at the Classes level —
   *  the toolbar shows the segmented control there and hides it elsewhere. */
  density?: GraphDensity;
  onDensityChange?: (density: GraphDensity) => void;
}

const LEVELS: { id: ViewLevel; label: string }[] = [
  { id: 'tiers',    label: 'Tiers' },
  { id: 'layers',   label: 'Layers' },
  { id: 'packages', label: 'Packages' },
  { id: 'classes',  label: 'Classes' },
];

export function ViewLevelToolbar({ value, onChange, density, onDensityChange }: ViewLevelToolbarProps) {
  const showDensity = value === 'classes' && density && onDensityChange;
  return (
    <div
      role="toolbar"
      aria-label="Diagram view level"
      className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 bg-[#2d2d2d] border-b border-[#1e1e1e] backdrop-blur-md"
    >
      {LEVELS.map(({ id, label }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={
              active
                ? 'px-3 py-1.5 text-xs font-semibold rounded-md border border-white/30 bg-white/[0.08] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_6px_24px_rgba(183,85,58,0.22)]'
                : 'hover-glow px-3 py-1.5 text-xs font-medium rounded-md border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white'
            }
          >
            {label}
          </button>
        );
      })}

      {showDensity && (
        <>
          <div className="mx-2 h-5 w-px bg-[#3e3e42]" aria-hidden />
          <div
            className="relative flex items-center gap-1 rounded-md border border-white/10"
            style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <span
              aria-hidden
              className="absolute top-0.5 bottom-0.5 w-[88px] rounded border border-white/15 transition-transform duration-300 ease-out"
              style={{
                left: 2,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05))',
                boxShadow: '0 1px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                transform: density === 'detailed' ? 'translateX(0)' : 'translateX(88px)',
              }}
            />
            <button
              type="button"
              onClick={() => onDensityChange!('detailed')}
              style={{ width: 88 }}
              className={`relative z-10 flex items-center justify-center gap-1.5 py-1 rounded text-xs transition-colors ${
                density === 'detailed' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Show full class cards (best for small repos)"
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Files</span>
            </button>
            <button
              type="button"
              onClick={() => onDensityChange!('compact')}
              style={{ width: 88 }}
              className={`relative z-10 flex items-center justify-center gap-1.5 py-1 rounded text-xs transition-colors ${
                density === 'compact' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Show one node per class (best for large repos)"
            >
              <Database className="h-3.5 w-3.5" />
              <span>Database</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
