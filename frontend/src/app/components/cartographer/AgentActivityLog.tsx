'use client';
import { useMemo } from 'react';
import { Bot, Clock, Zap, Eye, X } from 'lucide-react';
import { useCartographerStore } from '../../../lib/store';

export interface AgentQuery {
  id: string;
  timestamp: Date;
  agent: string;
  query: string;
  cluster: string;
  symbolsReturned: number;
  tokensSaved: number;
}

// Rough token-savings heuristic: each symbol the engine answered with stands
// in for ~700 tokens of raw source the agent would have otherwise pulled.
const TOKENS_PER_SYMBOL = 700;

const QUERY_TYPE_LABEL: Record<string, string> = {
  find_relevant_context: 'Coordinator',
  trace_data_flow: 'Flow Analyst',
  find_invariants: 'Invariant Reporter',
  describe_architecture: 'Architecture Analyst',
  find_exemplars: 'Exemplar Finder',
};

interface AgentActivityLogProps {
  onCollapse?: () => void;
  onHighlight?: (query: AgentQuery) => void;
  highlightedQueryId?: string | null;
}

export function AgentActivityLog({ onCollapse, onHighlight, highlightedQueryId }: AgentActivityLogProps) {
  // Live activity feed driven by SSE `agent_activity` events (see
  // CartographerWorkspace handleEvent dispatcher).
  const activity = useCartographerStore((s) => s.activity);
  const queries: AgentQuery[] = useMemo(
    () =>
      activity.map((a) => ({
        id: a.id,
        timestamp: new Date(a.ts),
        agent: QUERY_TYPE_LABEL[a.query_type] ?? a.query_type,
        query: a.task || a.query_type,
        cluster: a.cluster_id ?? '—',
        symbolsReturned: a.symbol_ids.length,
        tokensSaved: a.symbol_ids.length * TOKENS_PER_SYMBOL,
      })),
    [activity],
  );

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2.5 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="h-[13px] w-[13px] text-[#2DD4BF]" />
          <h3 className="text-sm font-bold text-white flex-1">Agent Activity</h3>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-2.5 hover:bg-[#3e3e42] rounded transition-colors"
              title="Hide Agent Log"
            >
              <X className="h-[13px] w-[13px] text-gray-400" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">Live query monitoring</p>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-auto">
        {queries.length === 0 && (
          <div className="p-6 text-center text-xs text-gray-500">
            No agent queries yet. Live activity will appear here as the
            Query Engine handles requests.
          </div>
        )}
        <div className="divide-y divide-[#1e1e1e]">
          {queries.map((query) => (
            <div key={query.id} className="p-3 hover:bg-[#2d2d2d] cursor-pointer transition-colors group">
              <div className="flex items-start gap-2 mb-2">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-[#34D399] to-[#F59E0B] flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white font-medium mb-1">{query.agent}</div>
                  <div className="text-xs text-gray-300 mb-2">{query.query}</div>

                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    <span>{formatTimeAgo(query.timestamp)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#1e1e1e] rounded-[5px] p-2 border border-[#3e3e42]">
                  <div className="text-gray-500 mb-0.5">Cluster</div>
                  <div className="text-white font-medium">{query.cluster}</div>
                </div>
                <div className="bg-[#1e1e1e] rounded-[5px] p-2 border border-[#3e3e42]">
                  <div className="text-gray-500 mb-0.5">Symbols</div>
                  <div className="text-white font-medium">{query.symbolsReturned}</div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                <Zap className="h-3 w-3" />
                <span>~{query.tokensSaved.toLocaleString()} tokens saved</span>
              </div>

              <button
                onClick={() => onHighlight?.(query)}
                className={`mt-2 w-full px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 ${
                  highlightedQueryId === query.id
                    ? 'bg-[#2DD4BF] text-white'
                    : 'bg-[#2DD4BF]/10 hover:bg-[#2DD4BF]/20 text-[#2DD4BF]'
                }`}
              >
                <Eye className="h-3 w-3" />
                {highlightedQueryId === query.id ? 'Highlighting...' : 'Highlight in view'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Footer */}
      <div className="p-3 border-t border-[#1e1e1e] bg-[#2d2d2d]">
        <div className="grid grid-cols-2 gap-3 text-xs text-center">
          <div>
            <div className="text-lg font-bold text-white mb-0.5">{queries.length}</div>
            <div className="text-gray-400">Queries</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400 mb-0.5">
              {queries.reduce((sum, q) => sum + q.tokensSaved, 0).toLocaleString()}
            </div>
            <div className="text-gray-400">Tokens Saved</div>
          </div>
        </div>
      </div>
    </div>
  );
}
