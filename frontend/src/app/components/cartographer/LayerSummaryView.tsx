'use client';
import { useState, useMemo } from 'react';
import { Boxes, Workflow, Network } from 'lucide-react';
import { useCartographerStore } from '../../../lib/store';
import type { LayerName } from '../../../lib/types';

interface LayerSummaryViewProps {
  repositoryId: string;
  showLegend: boolean;
}

interface SymbolEntry {
  id: string;
  layer: 'symbol' | 'flow' | 'architecture';
  label: string;
  kind: string;
  cluster: string;
  dependencies: string[];
  metadata: Record<string, unknown>;
}

const LAYERS: Array<{ key: 'symbol' | 'flow' | 'architecture'; label: string; icon: typeof Boxes; tone: string }> = [
  { key: 'symbol', label: 'Symbol', icon: Boxes, tone: 'text-blue-400' },
  { key: 'flow', label: 'Flow', icon: Workflow, tone: 'text-cyan-400' },
  { key: 'architecture', label: 'Architecture', icon: Network, tone: 'text-orange-400' },
];

export function LayerSummaryView({ repositoryId }: LayerSummaryViewProps) {
  const [selected, setSelected] = useState<SymbolEntry | null>(null);
  const [filterLayer, setFilterLayer] = useState<'all' | 'symbol' | 'flow' | 'architecture'>('all');

  const byRepo = useCartographerStore((s) => s.byRepo[repositoryId]);

  const entries: SymbolEntry[] = useMemo(() => {
    if (!byRepo) return [];
    const out: SymbolEntry[] = [];
    for (const layer of ['symbol', 'flow', 'architecture'] as const) {
      const projection = byRepo.graphs[layer as LayerName];
      if (!projection) continue;
      const adjacency = new Map<string, string[]>();
      for (const n of projection.nodes) adjacency.set(n.id, []);
      for (const e of projection.edges) {
        const list = adjacency.get(e.source);
        if (list) list.push(e.target);
      }
      const idToLabel = new Map<string, string>();
      for (const n of projection.nodes) idToLabel.set(n.id, n.label);

      for (const n of projection.nodes) {
        const md = n.metadata ?? {};
        out.push({
          id: `${layer}:${n.id}`,
          layer,
          label: n.label,
          kind: n.kind,
          cluster:
            (md.cluster_id as string | undefined) ??
            (md.cluster as string | undefined) ??
            'Unclustered',
          dependencies: (adjacency.get(n.id) ?? []).map((tid) => idToLabel.get(tid) ?? tid),
          metadata: md as Record<string, unknown>,
        });
      }
    }
    return out;
  }, [byRepo]);

  const filtered = entries.filter((e) => filterLayer === 'all' || e.layer === filterLayer);

  const layerMeta = (layer: SymbolEntry['layer']) => LAYERS.find((l) => l.key === layer)!;

  return (
    <div className="h-full flex overflow-hidden bg-[#1e1e1e]">
      {/* Entries List */}
      <div className="flex-1 p-3 overflow-auto relative">
        {/* Filter Bar */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-gray-400">Filter by layer:</span>
          <div className="flex gap-2">
            {(['all', 'symbol', 'flow', 'architecture'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterLayer(filter)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  filterLayer === filter
                    ? 'bg-[#007acc] text-white'
                    : 'bg-[#3a3a3a] text-gray-300 hover:bg-[#424242]'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Grouped Entries */}
        <div className="space-y-3">
          {LAYERS.filter((l) => filterLayer === 'all' || filterLayer === l.key).map((layer) => {
            const layerEntries = filtered.filter((e) => e.layer === layer.key);
            if (layerEntries.length === 0) return null;
            const Icon = layer.icon;
            return (
              <div
                key={layer.key}
                className="rounded-lg overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  className="p-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${layer.tone}`} />
                    <h3 className="text-sm font-bold text-white">{layer.label}</h3>
                    <span className="text-xs text-gray-500">
                      {layerEntries.length} {layerEntries.length === 1 ? 'node' : 'nodes'}
                    </span>
                  </div>
                </div>

                <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  {layerEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setSelected(entry)}
                      className={`w-full p-3 text-left transition-colors ${
                        selected?.id === entry.id ? 'bg-[#007acc]/10' : 'hover:bg-[#2a2d2e]'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="text-xs text-white mb-1 font-mono break-all">{entry.label}</div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="capitalize">{entry.kind}</span>
                            <span>•</span>
                            <span>{entry.cluster}</span>
                            {entry.dependencies.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-blue-400">{entry.dependencies.length} deps</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <Boxes className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <div className="text-sm text-gray-500">No nodes match the filter</div>
          </div>
        )}
      </div>

      {/* Details Panel */}
      {selected && (
        <div
          className="w-96 p-5 overflow-auto"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h3 className="text-base font-bold text-white mb-3">Node Details</h3>

          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Layer</div>
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = layerMeta(selected.layer).icon;
                  return <Icon className={`h-4 w-4 ${layerMeta(selected.layer).tone}`} />;
                })()}
                <span className="text-xs text-white capitalize">{selected.layer}</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Label</div>
              <div className="text-xs text-white bg-[#1e1e1e] p-3 rounded border border-[#3e3e42] font-mono break-all">
                {selected.label}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Kind</div>
              <div className="text-xs text-white capitalize">{selected.kind}</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Cluster</div>
              <div className="text-xs text-white">{selected.cluster}</div>
            </div>

            {selected.dependencies.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Dependencies ({selected.dependencies.length})
                </div>
                <div className="text-xs bg-[#1e1e1e] p-3 rounded border border-[#3e3e42] space-y-1 max-h-48 overflow-auto">
                  {selected.dependencies.map((dep, idx) => (
                    <div key={`${selected.id}-dep-${idx}`} className="text-blue-400 font-mono break-all">
                      → {dep}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-[#3e3e42]">
              <div className="text-xs text-gray-500 mb-1">Interpretation</div>
              <div className="text-xs text-gray-300">
                {selected.layer === 'symbol' && (
                  <div className="text-blue-400">
                    ◆ Symbol layer — concrete classes, functions, and modules in the codebase
                  </div>
                )}
                {selected.layer === 'flow' && (
                  <div className="text-cyan-400">
                    ◆ Flow layer — call and data-flow relationships between symbols
                  </div>
                )}
                {selected.layer === 'architecture' && (
                  <div className="text-orange-400">
                    ◆ Architecture layer — high-level clusters and cross-module dependencies
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
