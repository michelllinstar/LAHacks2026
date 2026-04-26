'use client';
// Drill-down explorer over `SYSTEM_HIERARCHY`. A toolbar selects the current
// viewLevel (Tiers → Layers → Contexts → Packages → Classes); each level
// renders a UML diagram of a different slice of the same dataset. Switching
// views is purely state-driven — no page reload — so transitions are instant.

import { useMemo, useState } from 'react';
import { ChevronRight, Layers, Boxes, Map, Package, ScrollText } from 'lucide-react';
import {
  SYSTEM_HIERARCHY,
  type AnyNode,
  type ContextNode,
  type LayerNode,
  type PackageNode,
  type TierNode,
} from './systemHierarchy';
import { UmlDiagram, type UmlEdge } from './UmlDiagram';

type ViewLevel = 'tiers' | 'layers' | 'contexts' | 'packages' | 'classes';

interface FocusPath {
  tierId?: string;
  layerId?: string;
  contextId?: string;
  packageId?: string;
}

const LEVELS: { id: ViewLevel; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'tiers',    label: 'Tiers',    icon: Layers },
  { id: 'layers',   label: 'Layers',   icon: Boxes },
  { id: 'contexts', label: 'Contexts', icon: Map },
  { id: 'packages', label: 'Packages', icon: Package },
  { id: 'classes',  label: 'Classes',  icon: ScrollText },
];

// Resolve focus → concrete subtree nodes, falling back to the first child
// when a deeper level is requested without explicit focus.
function resolveFocus(focus: FocusPath): {
  tier?: TierNode;
  layer?: LayerNode;
  context?: ContextNode;
  pkg?: PackageNode;
} {
  const tier = focus.tierId
    ? SYSTEM_HIERARCHY.find((t) => t.id === focus.tierId)
    : SYSTEM_HIERARCHY[0];
  const layer = tier
    ? focus.layerId
      ? tier.layers.find((l) => l.id === focus.layerId)
      : tier.layers[0]
    : undefined;
  const context = layer
    ? focus.contextId
      ? layer.contexts.find((c) => c.id === focus.contextId)
      : layer.contexts[0]
    : undefined;
  const pkg = context
    ? focus.packageId
      ? context.packages.find((p) => p.id === focus.packageId)
      : context.packages[0]
    : undefined;
  return { tier, layer, context, pkg };
}

// Per-level slice of the dataset + the edges to render.
function sliceForLevel(level: ViewLevel, focus: FocusPath): { nodes: AnyNode[]; edges: UmlEdge[] } {
  const { tier, layer, context, pkg } = resolveFocus(focus);

  if (level === 'tiers') {
    const nodes: AnyNode[] = SYSTEM_HIERARCHY;
    // Protocol-labeled inter-tier arrows. UML 'dependency' kind = dashed +
    // open arrow, which matches "Frontend depends on Backend over HTTPS".
    const edges: UmlEdge[] = [
      { source: 'tier.frontend', target: 'tier.backend',  kind: 'dependency', label: 'REST / HTTPS' },
      { source: 'tier.backend',  target: 'tier.database', kind: 'dependency', label: 'SQL / TCP'    },
    ];
    return { nodes, edges };
  }

  if (level === 'layers' && tier) {
    const nodes: AnyNode[] = tier.layers;
    const ids = new Set(nodes.map((n) => n.id));
    const edges: UmlEdge[] = nodes.flatMap((n) =>
      (n.dependencies ?? [])
        .filter((d) => ids.has(d))
        .map<UmlEdge>((d) => ({ source: n.id, target: d, kind: 'dependency' })),
    );
    return { nodes, edges };
  }

  if (level === 'contexts' && layer) {
    const nodes: AnyNode[] = layer.contexts;
    const ids = new Set(nodes.map((n) => n.id));
    const edges: UmlEdge[] = nodes.flatMap((n) =>
      (n.dependencies ?? [])
        .filter((d) => ids.has(d))
        .map<UmlEdge>((d) => ({ source: n.id, target: d, kind: 'dependency' })),
    );
    return { nodes, edges };
  }

  if (level === 'packages' && context) {
    const nodes: AnyNode[] = context.packages;
    const ids = new Set(nodes.map((n) => n.id));
    const edges: UmlEdge[] = nodes.flatMap((n) =>
      (n.dependencies ?? [])
        .filter((d) => ids.has(d))
        .map<UmlEdge>((d) => ({ source: n.id, target: d, kind: 'dependency' })),
    );
    return { nodes, edges };
  }

  if (level === 'classes' && pkg) {
    const nodes: AnyNode[] = pkg.classes;
    const ids = new Set(nodes.map((n) => n.id));
    // Class-level edges: dependencies become UML 'dependency' edges by
    // default. Caller could pass typed edges (association/aggregation/etc.)
    // when the schema gains UML edge typing.
    const edges: UmlEdge[] = nodes.flatMap((n) =>
      (n.dependencies ?? [])
        .filter((d) => ids.has(d))
        .map<UmlEdge>((d) => ({ source: n.id, target: d, kind: 'dependency' })),
    );
    return { nodes, edges };
  }

  return { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------

interface SystemDiagramExplorerProps {
  className?: string;
}

export function SystemDiagramExplorer({ className }: SystemDiagramExplorerProps) {
  const [level, setLevel] = useState<ViewLevel>('tiers');
  const [focus, setFocus] = useState<FocusPath>({});

  const { nodes, edges } = useMemo(() => sliceForLevel(level, focus), [level, focus]);
  const resolved = resolveFocus(focus);

  const setLevelClamped = (next: ViewLevel) => {
    // Auto-pick a default focus when descending without explicit focus so
    // deeper views always have something to show.
    if (next === 'layers' && !focus.tierId) {
      setFocus({ tierId: SYSTEM_HIERARCHY[0]?.id });
    } else if (next === 'contexts' && !focus.layerId) {
      const tier = resolved.tier ?? SYSTEM_HIERARCHY[0];
      setFocus({ tierId: tier?.id, layerId: tier?.layers[0]?.id });
    } else if (next === 'packages' && !focus.contextId) {
      const tier = resolved.tier ?? SYSTEM_HIERARCHY[0];
      const layer = resolved.layer ?? tier?.layers[0];
      setFocus({
        tierId: tier?.id,
        layerId: layer?.id,
        contextId: layer?.contexts[0]?.id,
      });
    } else if (next === 'classes' && !focus.packageId) {
      const tier = resolved.tier ?? SYSTEM_HIERARCHY[0];
      const layer = resolved.layer ?? tier?.layers[0];
      const ctx = resolved.context ?? layer?.contexts[0];
      setFocus({
        tierId: tier?.id,
        layerId: layer?.id,
        contextId: ctx?.id,
        packageId: ctx?.packages[0]?.id,
      });
    }
    setLevel(next);
  };

  const direction = level === 'tiers' || level === 'layers' ? 'TB' : 'LR';

  return (
    <div
      className={`flex flex-col h-full bg-[#1a1a1a] ${className ?? ''}`}
      style={{ minHeight: 0 }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] border-b border-[#1e1e1e] flex-shrink-0">
        <div className="flex items-center gap-1">
          {LEVELS.map(({ id, label, icon: Icon }) => {
            const active = level === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setLevelClamped(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors border ${
                  active
                    ? 'bg-[#1e1e1e] text-white border-[#2DD4BF]'
                    : 'bg-transparent text-gray-400 border-transparent hover:text-white hover:bg-[#1e1e1e]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Breadcrumb of focused path */}
        <div className="flex items-center gap-1 text-xs text-gray-400 ml-3 flex-1 min-w-0 overflow-hidden">
          {resolved.tier && (
            <Crumb
              label={resolved.tier.name}
              onClick={() => {
                setFocus({ tierId: resolved.tier!.id });
                setLevel('layers');
              }}
            />
          )}
          {resolved.layer && level !== 'tiers' && (
            <>
              <ChevronRight className="h-3 w-3 text-gray-600 flex-shrink-0" />
              <Crumb
                label={resolved.layer.name}
                onClick={() => {
                  setFocus({ tierId: resolved.tier!.id, layerId: resolved.layer!.id });
                  setLevel('contexts');
                }}
              />
            </>
          )}
          {resolved.context && (level === 'contexts' || level === 'packages' || level === 'classes') && (
            <>
              <ChevronRight className="h-3 w-3 text-gray-600 flex-shrink-0" />
              <Crumb
                label={resolved.context.name}
                onClick={() => {
                  setFocus({
                    tierId: resolved.tier!.id,
                    layerId: resolved.layer!.id,
                    contextId: resolved.context!.id,
                  });
                  setLevel('packages');
                }}
              />
            </>
          )}
          {resolved.pkg && (level === 'packages' || level === 'classes') && (
            <>
              <ChevronRight className="h-3 w-3 text-gray-600 flex-shrink-0" />
              <Crumb
                label={resolved.pkg.name}
                onClick={() => {
                  setFocus({
                    tierId: resolved.tier!.id,
                    layerId: resolved.layer!.id,
                    contextId: resolved.context!.id,
                    packageId: resolved.pkg!.id,
                  });
                  setLevel('classes');
                }}
              />
            </>
          )}
        </div>

        {/* Sibling pickers — let the user re-focus laterally without losing the level. */}
        {level !== 'tiers' && (
          <SiblingPicker
            options={SYSTEM_HIERARCHY.map((t) => ({ id: t.id, label: t.name }))}
            value={resolved.tier?.id}
            onChange={(id) => setFocus({ tierId: id })}
          />
        )}
        {(level === 'contexts' || level === 'packages' || level === 'classes') && resolved.tier && (
          <SiblingPicker
            options={resolved.tier.layers.map((l) => ({ id: l.id, label: l.name }))}
            value={resolved.layer?.id}
            onChange={(id) =>
              setFocus({ tierId: resolved.tier!.id, layerId: id })
            }
          />
        )}
        {(level === 'packages' || level === 'classes') && resolved.layer && (
          <SiblingPicker
            options={resolved.layer.contexts.map((c) => ({ id: c.id, label: c.name }))}
            value={resolved.context?.id}
            onChange={(id) =>
              setFocus({
                tierId: resolved.tier!.id,
                layerId: resolved.layer!.id,
                contextId: id,
              })
            }
          />
        )}
        {level === 'classes' && resolved.context && (
          <SiblingPicker
            options={resolved.context.packages.map((p) => ({ id: p.id, label: p.name }))}
            value={resolved.pkg?.id}
            onChange={(id) =>
              setFocus({
                tierId: resolved.tier!.id,
                layerId: resolved.layer!.id,
                contextId: resolved.context!.id,
                packageId: id,
              })
            }
          />
        )}
      </div>

      {/* Diagram canvas */}
      <div className="flex-1 min-h-0 overflow-auto" key={`${level}-${focus.packageId ?? focus.contextId ?? focus.layerId ?? focus.tierId ?? ''}`}>
        {nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Nothing to render at this level.
          </div>
        ) : (
          <UmlDiagram nodes={nodes} edges={edges} direction={direction} />
        )}
      </div>
    </div>
  );
}

function Crumb({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-0.5 rounded text-gray-300 hover:text-white hover:bg-[#1e1e1e] transition-colors truncate"
      title={label}
    >
      {label}
    </button>
  );
}

function SiblingPicker({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#252526] text-white text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
