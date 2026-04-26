'use client';
import { Bot, Clock, Zap, Eye, X } from 'lucide-react';

export interface AgentQuery {
  id: string;
  timestamp: Date;
  agent: string;
  query: string;
  cluster: string;
  symbolsReturned: number;
  tokensSaved: number;
}

interface AgentActivityLogProps {
  onCollapse?: () => void;
  onHighlight?: (query: AgentQuery) => void;
  highlightedQueryId?: string | null;
}

export function AgentActivityLog({ onCollapse, onHighlight, highlightedQueryId }: AgentActivityLogProps) {
  // Mock agent activity
  const queries: AgentQuery[] = [
    {
      id: '1',
      timestamp: new Date(Date.now() - 5000),
      agent: 'Coordinator',
      query: 'Find rate limiting middleware conventions',
      cluster: 'Controllers',
      symbolsReturned: 12,
      tokensSaved: 8400,
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 45000),
      agent: 'Symbol Analyst',
      query: 'Lookup AuthController dependencies',
      cluster: 'Controllers',
      symbolsReturned: 8,
      tokensSaved: 5200,
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 120000),
      agent: 'Flow Analyst',
      query: 'Trace user credentials flow',
      cluster: 'Services',
      symbolsReturned: 15,
      tokensSaved: 12000,
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 180000),
      agent: 'Invariant Reporter',
      query: 'Get payment validation constraints',
      cluster: 'Services',
      symbolsReturned: 6,
      tokensSaved: 3800,
    },
  ];

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
      <div className="p-3 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="h-4 w-4 text-[#007acc]" />
          <h3 className="text-sm font-bold text-white flex-1">Agent Activity</h3>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 hover:bg-[#3e3e42] rounded transition-colors"
              title="Hide Agent Log"
            >
              <X className="h-3 w-3 text-gray-400" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">Live query monitoring</p>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-[#1e1e1e]">
          {queries.map((query) => (
            <div key={query.id} className="p-3 hover:bg-[#2a2d2e] cursor-pointer transition-colors group">
              <div className="flex items-start gap-2 mb-2">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
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
                    ? 'bg-[#007acc] text-white'
                    : 'bg-[#007acc]/10 hover:bg-[#007acc]/20 text-[#007acc]'
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
