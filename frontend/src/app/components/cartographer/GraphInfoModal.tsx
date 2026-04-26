'use client';
import React from 'react';
import { X, Layers3, Workflow, Network, Boxes, ShieldCheck, Files, Search, GitBranch, Bot, Mouse, Maximize2, Eye } from 'lucide-react';

interface GraphInfoModalProps {
  onClose: () => void;
}

// Workspace help dialog. Documents the actual UI as it ships:
//   - View-level toolbar: Tiers / Layers / Contexts / Packages / Classes
//   - Layer-overlay toolbar (Classes view): Symbol / Flow / Architecture
//   - Right side panel: Node Info / Agents / Activity
//   - Activity bar: Explorer / Search / Source Control / Agents
//   - UML edge notation legend
//
// Anything described here should match what the user sees in the app — when
// the UI changes, this dialog has to change with it.
export function GraphInfoModal({ onClose }: GraphInfoModalProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="glass-panel rounded-3xl max-w-3xl w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden anim-fade-up aurora-bg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Workspace Guide</h2>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-white/10 rounded transition-colors"
            title="Close"
          >
            <X className="h-[13px] w-[13px] text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* View levels */}
          <section>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-[#5EEAD4]" />
              View levels — top toolbar
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              The five buttons across the top zoom from coarse to fine. Clicking a node
              advances one level deeper and pushes a segment onto the breadcrumb.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Pill label="Tiers" desc="Frontend ⇄ Backend ⇄ Database with «HTTP»/«SQL» stereotypes" />
              <Pill label="Layers" desc="Controller → Service → Repository → Entity, dashed UML deps" />
              <Pill label="Contexts" desc="Bounded contexts within a layer (e.g. Ordering, Catalog)" />
              <Pill label="Packages" desc="Packages within a context, scoped by the breadcrumb" />
              <Pill label="Classes" desc="Per-class UML cards; supports Symbol/Flow/Architecture overlays" />
            </div>
          </section>

          {/* Layer overlays */}
          <section>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Workflow className="h-4 w-4 text-[#34D399]" />
              Layer overlays — Classes view only
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Multi-select. Toggling more than one stacks the overlays; the toolbar
              refuses to deselect the last active layer (so the canvas is never blank).
            </p>
            <div className="space-y-2 text-sm">
              <Row icon={<Boxes className="h-3.5 w-3.5" style={{ color: '#3b82f6' }} />} title="Symbol" body="Classes, functions, and their direct references." />
              <Row icon={<Workflow className="h-3.5 w-3.5" style={{ color: '#22c55e' }} />} title="Flow" body="Call & data flow arrows between symbols." />
              <Row icon={<Network className="h-3.5 w-3.5" style={{ color: '#f59e0b' }} />} title="Architecture" body="Cluster boundaries and cross-cluster dependencies." />
            </div>
          </section>

          {/* UML notation */}
          <section>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Network className="h-4 w-4 text-[#FBBF24]" />
              UML edge notation
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Edges respect UML 2.5 conventions. Line style + arrowhead encode the
              relationship; protocol stereotypes label cross-tier hops.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <EdgeRow style="solid"  end="open"     label="Association" />
              <EdgeRow style="solid"  end="diamondH" label="Aggregation (whole ◇—)" />
              <EdgeRow style="solid"  end="diamondF" label="Composition (whole ◆—)" />
              <EdgeRow style="solid"  end="triangle" label="Inheritance" />
              <EdgeRow style="dashed" end="triangle" label="Realization" />
              <EdgeRow style="dashed" end="open"     label="Dependency" />
            </div>
          </section>

          {/* Right side panel */}
          <section>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#5EEAD4]" />
              Right side panel
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Three stacked sections, each with an X to collapse and drag-handles between
              them to repartition height. Default split is 30 / 30 / 40.
            </p>
            <div className="space-y-2 text-sm">
              <Row icon="🔎" title="Node Info" body="Auto-opens whenever you click a node. Shows kind, cluster, file path, dependencies." />
              <Row icon="🤖" title="Agents" body="Available agents (Coordinator, Symbol/Flow/Architecture Analysts, Invariant Reporter). Click to dispatch." />
              <Row icon="📜" title="Activity" body="Live agent run feed via SSE. Click 'Highlight in view' to ping related nodes on the canvas." />
            </div>
          </section>

          {/* Activity bar */}
          <section>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Files className="h-4 w-4 text-[#5EEAD4]" />
              Activity bar — far left
            </h3>
            <div className="space-y-2 text-sm">
              <Row icon={<Files className="h-3.5 w-3.5 text-gray-300" />} title="Explorer" body="Indexed file tree. Selecting a row highlights it; the graph projection is unscoped." />
              <Row icon={<Search className="h-3.5 w-3.5 text-gray-300" />} title="Search" body="Symbol search across the active repo." />
              <Row icon={<GitBranch className="h-3.5 w-3.5 text-gray-300" />} title="Source Control" body="Branch / status info for the indexed repo." />
              <Row icon={<Bot className="h-3.5 w-3.5 text-gray-300" />} title="Agents" body="Manage user-defined and external HTTP agents." />
            </div>
          </section>

          {/* Canvas controls */}
          <section>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Mouse className="h-4 w-4 text-[#5EEAD4]" />
              Canvas controls
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Kbd k="Drag bg" v="Pan viewport" />
              <Kbd k="Drag node" v="Reposition (edges follow)" />
              <Kbd k="+ / =" v="Zoom in" />
              <Kbd k="− / _" v="Zoom out" />
              <Kbd k="Pinch / Ctrl-scroll" v="Zoom toward cursor" />
              <Kbd k="Reset btn" v="Recenter & re-fit" />
              <Kbd k="Click node" v="Open Node Info / drill down a level" />
              <Kbd k="Esc" v="Close this dialog" />
            </div>
          </section>

          <section className="p-3 rounded border border-white/10 bg-white/[0.03] text-xs text-gray-300">
            <strong className="text-white">Tip:</strong> the breadcrumb above the canvas is clickable —
            jump back to any earlier level without losing the path. Skipped levels appear faded
            in italics so you can still drill in manually.
          </section>
        </div>

        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-gray-500">Press ESC to close</div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2DD4BF] hover:bg-[#5EEAD4] text-black text-sm font-semibold rounded transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------
function Pill({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded border border-white/10 bg-white/[0.03]">
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold border border-white/15 bg-white/[0.06] text-white">
        {label}
      </span>
      <span className="text-xs text-gray-400 leading-snug">{desc}</span>
    </div>
  );
}

function Row({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-white font-medium text-sm">{title}</div>
        <div className="text-xs text-gray-400">{body}</div>
      </div>
    </div>
  );
}

function Kbd({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="px-2 py-1 bg-white/5 border border-white/15 rounded text-gray-200 text-[11px] whitespace-nowrap">
        {k}
      </kbd>
      <span className="text-gray-400">{v}</span>
    </div>
  );
}

interface EdgeRowProps {
  style: 'solid' | 'dashed';
  end: 'open' | 'triangle' | 'diamondH' | 'diamondF';
  label: string;
}
function EdgeRow({ style, end, label }: EdgeRowProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded border border-white/10 bg-white/[0.03]">
      <svg width="80" height="22" viewBox="0 0 80 22">
        <line x1="4" y1="11" x2="60" y2="11" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray={style === 'dashed' ? '5 4' : undefined} />
        {end === 'open' && (
          <path d="M68 11 L60 6 M68 11 L60 16" stroke="#cbd5e1" strokeWidth="1.5" fill="none" />
        )}
        {end === 'triangle' && (
          <path d="M60 5 L72 11 L60 17 z" fill="#1a1a1a" stroke="#cbd5e1" strokeWidth="1.4" />
        )}
        {end === 'diamondH' && (
          <path d="M60 11 L66 5 L72 11 L66 17 z" fill="#1a1a1a" stroke="#cbd5e1" strokeWidth="1.4" />
        )}
        {end === 'diamondF' && (
          <path d="M60 11 L66 5 L72 11 L66 17 z" fill="#cbd5e1" stroke="#cbd5e1" strokeWidth="1.4" />
        )}
      </svg>
      <span className="text-gray-300 text-xs">{label}</span>
    </div>
  );
}
