'use client';
import { useState, useMemo } from 'react';
import { Shield, AlertCircle, CheckCircle, FileCode } from 'lucide-react';
import { useCartographerStore } from '../../../lib/store';

interface InvariantViewProps {
  repositoryId: string;
  showLegend: boolean;
}

interface Invariant {
  id: string;
  targetSymbol: string;
  invariantText: string;
  sourceKind: 'test' | 'defensive-check' | 'comment';
  sourceLocation: string;
  confidence: number;
}

export function InvariantView({ repositoryId }: InvariantViewProps) {
  const [selectedInvariant, setSelectedInvariant] = useState<Invariant | null>(null);
  const [filterConfidence, setFilterConfidence] = useState<'all' | 'high' | 'medium'>('all');

  // Live invariants are projected as graph nodes on the `invariant` layer:
  // each node's metadata carries target_symbol, text, source_kind,
  // source_location, confidence (see backend/services/projector.py).
  const projection = useCartographerStore(
    (s) => s.byRepo[repositoryId]?.graphs.invariant,
  );

  const invariants: Invariant[] = useMemo(() => {
    if (!projection) return [];
    return projection.nodes.map((n) => {
      const md = n.metadata ?? {};
      const rawKind = String(md.source_kind ?? 'defensive').toLowerCase();
      const sourceKind: Invariant['sourceKind'] =
        rawKind === 'test' ? 'test' : rawKind === 'comment' ? 'comment' : 'defensive-check';
      return {
        id: n.id,
        targetSymbol: String(md.target_symbol ?? n.label),
        invariantText: String(md.text ?? n.label),
        sourceKind,
        sourceLocation: String(md.source_location ?? ''),
        confidence: typeof md.confidence === 'number' ? (md.confidence as number) : 0.5,
      };
    });
  }, [projection]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-400';
    if (confidence >= 0.7) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getSourceIcon = (kind: string) => {
    switch (kind) {
      case 'test':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'defensive-check':
        return <Shield className="h-4 w-4 text-blue-400" />;
      case 'comment':
        return <AlertCircle className="h-4 w-4 text-yellow-400" />;
      default:
        return null;
    }
  };

  const filteredInvariants = invariants.filter((inv) => {
    if (filterConfidence === 'high') return inv.confidence >= 0.9;
    if (filterConfidence === 'medium') return inv.confidence >= 0.7 && inv.confidence < 0.9;
    return true;
  });

  return (
    <div className="h-full flex overflow-hidden bg-[#1e1e1e]">
      {/* Invariants List */}
      <div className="flex-1 p-3 overflow-auto relative">
        {/* Filter Bar */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-gray-400">Filter by confidence:</span>
          <div className="flex gap-2">
            {(['all', 'high', 'medium'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterConfidence(filter)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  filterConfidence === filter
                    ? 'bg-[#007acc] text-white'
                    : 'bg-[#3a3a3a] text-gray-300 hover:bg-[#424242]'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Grouped Invariants */}
        <div className="space-y-3">
          {/* Group by symbol */}
          {Object.entries(
            filteredInvariants.reduce((acc, inv) => {
              if (!acc[inv.targetSymbol]) acc[inv.targetSymbol] = [];
              acc[inv.targetSymbol].push(inv);
              return acc;
            }, {} as Record<string, Invariant[]>)
          ).map(([symbol, invs]) => (
            <div
              key={symbol}
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
                  <FileCode className="h-4 w-4 text-[#007acc]" />
                  <h3 className="text-sm font-bold text-white">{symbol}</h3>
                  <span className="text-xs text-gray-500">
                    {invs.length} {invs.length === 1 ? 'invariant' : 'invariants'}
                  </span>
                </div>
              </div>

              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {invs.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedInvariant(inv)}
                    className={`w-full p-3 text-left transition-colors ${
                      selectedInvariant?.id === inv.id
                        ? 'bg-[#007acc]/10'
                        : 'hover:bg-[#2a2d2e]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-xs text-white mb-1">{inv.invariantText}</div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="capitalize">{inv.sourceKind.replace('-', ' ')}</span>
                          <span>•</span>
                          <span className={getConfidenceColor(inv.confidence)}>
                            {Math.round(inv.confidence * 100)}% confidence
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {filteredInvariants.length === 0 && (
          <div className="text-center py-20">
            <Shield className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <div className="text-sm text-gray-500">No invariants match the filter</div>
          </div>
        )}
      </div>

      {/* Invariant Details Panel */}
      {selectedInvariant && (
        <div
          className="w-96 p-5 overflow-auto"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h3 className="text-base font-bold text-white mb-3">Invariant Details</h3>

          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Target Symbol</div>
              <div className="text-xs text-white font-mono">{selectedInvariant.targetSymbol}</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Invariant</div>
              <div className="text-xs text-white bg-[#1e1e1e] p-3 rounded border border-[#3e3e42]">
                {selectedInvariant.invariantText}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Source Kind</div>
              <div className="flex items-center gap-2">
                {getSourceIcon(selectedInvariant.sourceKind)}
                <span className="text-xs text-white capitalize">
                  {selectedInvariant.sourceKind.replace('-', ' ')}
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Source Location</div>
              <div className="text-xs font-mono text-blue-400 hover:underline cursor-pointer">
                {selectedInvariant.sourceLocation}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Confidence Score</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#1e1e1e] rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${
                      selectedInvariant.confidence >= 0.9
                        ? 'bg-green-500'
                        : selectedInvariant.confidence >= 0.7
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${selectedInvariant.confidence * 100}%` }}
                  />
                </div>
                <span className={`text-xs font-medium ${getConfidenceColor(selectedInvariant.confidence)}`}>
                  {Math.round(selectedInvariant.confidence * 100)}%
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#3e3e42]">
              <div className="text-xs text-gray-500 mb-1">Interpretation</div>
              <div className="text-xs text-gray-300">
                {selectedInvariant.confidence >= 0.9 ? (
                  <div className="text-green-400">
                    ✓ High confidence - Extracted from test assertions or explicit checks
                  </div>
                ) : selectedInvariant.confidence >= 0.7 ? (
                  <div className="text-yellow-400">
                    ⚠ Medium confidence - Inferred from defensive checks or patterns
                  </div>
                ) : (
                  <div className="text-red-400">
                    ⚠ Low confidence - Extracted from comments or indirect evidence
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
