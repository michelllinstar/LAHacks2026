'use client';

export type ViewLevel = 'tiers' | 'layers' | 'contexts' | 'packages' | 'classes';

interface ViewLevelToolbarProps {
  value: ViewLevel;
  onChange: (next: ViewLevel) => void;
}

const LEVELS: { id: ViewLevel; label: string }[] = [
  { id: 'tiers',    label: 'Tiers' },
  { id: 'layers',   label: 'Layers' },
  { id: 'contexts', label: 'Contexts' },
  { id: 'packages', label: 'Packages' },
  { id: 'classes',  label: 'Classes' },
];

export function ViewLevelToolbar({ value, onChange }: ViewLevelToolbarProps) {
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
    </div>
  );
}
