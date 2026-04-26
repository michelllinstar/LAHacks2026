'use client';
import { useMemo, useState } from 'react';
import { Bot, Brain, ChevronDown, ChevronRight, Clock, Eye, Loader2, Wrench, X, XCircle, Zap } from 'lucide-react';
import { useCartographerStore } from '../../../lib/store';
import type { AgentActivityStatus } from '../../../lib/store';
import type { ReasoningStep } from '../../../lib/types';

export interface AgentQuery {
  id: string;
  timestamp: Date;
  agent: string;
  query: string;
  cluster: string;
  symbolsReturned: number;
  tokensSaved: number;
  // Lifecycle of the run. Defaults to 'done' for entries without an explicit
  // status (legacy/SSE-driven), so existing call sites keep rendering.
  status?: AgentActivityStatus;
  // The agent's natural-language summary, if it returned one. Rendered under
  // the query line in the activity card.
  summary?: string;
  // Optional chain-of-reasoning emitted by external agents. Rendered as a
  // collapsible thread under the summary.
  steps?: ReasoningStep[];
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

// Illustrative entry shown only while the live activity feed is empty so
// users see what a real Agentverse query looks like without firing one.
// As soon as the first real `agent_activity` SSE event lands the sample is
// replaced. Footer stats and the "Highlight in view" button are suppressed
// so the sample isn't mistaken for production data.
const SAMPLE_QUERY: AgentQuery = {
  id: '__sample__',
  timestamp: new Date(),
  agent: 'Coordinator',
  query: 'Add rate limiting to all public API endpoints',
  cluster: 'api/middleware',
  symbolsReturned: 7,
  tokensSaved: 7 * TOKENS_PER_SYMBOL,
};

function ReasoningThread({ steps }: { steps: ReasoningStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;
  // Drop the trailing "final" step if it just echoes the summary above; keep
  // it otherwise so agents that only emit a final step still get a thread.
  return (
    <div className="mt-1 mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-400 hover:text-white transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Reasoning ({steps.length})
      </button>
      {open && (
        <ol className="mt-2 ml-1 border-l border-[#3e3e42] pl-3 space-y-2">
          {steps.map((step, idx) => (
            <li key={idx} className="text-xs">
              <ReasoningStepRow step={step} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ReasoningStepRow({ step }: { step: ReasoningStep }) {
  const [expanded, setExpanded] = useState(step.kind !== 'tool_result');
  switch (step.kind) {
    case 'thought':
      return (
        <div className="flex items-start gap-1.5 text-gray-400">
          <Brain className="h-3 w-3 mt-0.5 flex-shrink-0 text-purple-300" />
          <span className="italic whitespace-pre-wrap break-words leading-relaxed">{step.text}</span>
        </div>
      );
    case 'tool_call':
      return (
        <div className="flex items-start gap-1.5">
          <Wrench className="h-3 w-3 mt-0.5 flex-shrink-0 text-cyan-300" />
          <span className="font-mono text-cyan-200 break-all">
            {step.tool ? `${step.tool}(${step.text})` : step.text}
          </span>
        </div>
      );
    case 'tool_result':
      return (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="font-mono">{step.tool ? `${step.tool} →` : 'result'}</span>
          </button>
          {expanded && (
            <div className="mt-1 ml-4 text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
              {step.text}
            </div>
          )}
        </div>
      );
    case 'final':
      return (
        <div className="font-medium text-white whitespace-pre-wrap break-words leading-relaxed">
          {step.text}
        </div>
      );
    default:
      return <div className="text-gray-300">{step.text}</div>;
  }
}

interface AgentActivityLogProps {
  onCollapse?: () => void;
  onHighlight?: (query: AgentQuery) => void;
  highlightedQueryId?: string | null;
}

export function AgentActivityLog({ onCollapse, onHighlight, highlightedQueryId }: AgentActivityLogProps) {
  // Live activity feed driven by SSE `agent_activity` events (see
  // CartographerWorkspace handleEvent dispatcher).
  const activity = useCartographerStore((s) => s.activity);
  // Track which OLD entries the user has manually expanded. The newest entry
  // is always expanded; running entries are always expanded. Older done/failed
  // entries collapse to a one-line row by default to keep the panel scannable.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
        status: a.status,
        summary: a.summary,
        steps: a.steps,
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
          <div className="px-3 pt-3 pb-1 text-center text-xs text-gray-500">
            No agent queries yet — sample shown below until the first one fires.
          </div>
        )}
        <div className="divide-y divide-[#1e1e1e]">
          {(queries.length === 0 ? [SAMPLE_QUERY] : queries).map((query, index) => {
            const isSample = query.id === '__sample__';
            // Auto-expand: the newest entry, anything still running, the
            // single sample. Older done/failed entries collapse unless the
            // user clicks them open.
            const autoExpanded =
              isSample || index === 0 || query.status === 'running';
            const isExpanded = autoExpanded || expanded.has(query.id);

            // Compact row for old, collapsed entries. Single line with agent,
            // truncated prompt, optional status indicator, click to expand.
            if (!isExpanded) {
              return (
                <button
                  key={query.id}
                  type="button"
                  onClick={() => toggleExpanded(query.id)}
                  className="w-full text-left p-2 hover:bg-[#2d2d2d] transition-colors flex items-center gap-2 group"
                  title="Click to expand"
                >
                  <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0 group-hover:text-gray-300" />
                  <Bot className="h-3 w-3 text-gray-500 flex-shrink-0" />
                  <span className="text-[11px] text-gray-400 font-medium flex-shrink-0 max-w-[80px] truncate">
                    {query.agent}
                  </span>
                  <span className="text-[11px] text-gray-300 truncate flex-1 min-w-0">
                    {query.query}
                  </span>
                  {query.status === 'failed' && (
                    <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                  )}
                  <span className="text-[10px] text-gray-500 flex-shrink-0">
                    {formatTimeAgo(query.timestamp)}
                  </span>
                </button>
              );
            }

            return (
              <div
                key={query.id}
                onClick={!autoExpanded ? () => toggleExpanded(query.id) : undefined}
                className={`p-3 transition-colors group ${
                  isSample ? 'opacity-70' : 'hover:bg-[#2d2d2d] cursor-pointer'
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-[#34D399] to-[#F59E0B] flex items-center justify-center flex-shrink-0">
                    <Bot className="h-3 w-3 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-xs text-white font-medium">{query.agent}</div>
                      {isSample && (
                        <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                          Sample
                        </span>
                      )}
                      {query.status === 'running' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Running
                        </span>
                      )}
                      {query.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-red-500/15 text-red-300 border border-red-500/30">
                          <XCircle className="h-2.5 w-2.5" />
                          Failed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-300 mb-2 whitespace-pre-wrap break-words">{query.query}</div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{isSample ? 'preview' : formatTimeAgo(query.timestamp)}</span>
                    </div>
                  </div>
                </div>

                {query.summary && (
                  <div className="mt-1 mb-2 bg-[#1e1e1e] rounded-[5px] p-2 border border-[#3e3e42]">
                    <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Output</div>
                    <div className="text-xs text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                      {query.summary}
                    </div>
                  </div>
                )}

                {query.steps && query.steps.length > 0 && (
                  <ReasoningThread steps={query.steps} />
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#1e1e1e] rounded-[5px] p-2 border border-[#3e3e42]">
                    <div className="text-gray-500 mb-0.5">Cluster</div>
                    <div className="text-white font-medium truncate">{query.cluster}</div>
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

                {!isSample && (
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
                )}
              </div>
            );
          })}
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
