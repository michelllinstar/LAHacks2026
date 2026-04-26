'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Play, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { findRelevantContext } from '../../../lib/api';
import { useCartographerStore } from '../../../lib/store';

// User-defined "custom agent" — a saved prompt the user can run on-demand
// against the active repo. Each Run posts an entry to the AgentActivityLog
// via the same store the live SSE feed writes to, so deployed agents are
// indistinguishable from any other agent activity downstream.
//
// Persistence is local to the browser (localStorage). Agents are scoped to
// the user, not the repo, so they're available across every project. A
// future iteration can promote this to a backend collection so agents are
// shared across teammates and runnable headlessly from the CLI.
interface CustomAgent {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
}

const STORAGE_KEY = 'cartographer.agents.custom';

function loadAgents(): CustomAgent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is CustomAgent =>
        typeof a === 'object' &&
        a !== null &&
        typeof a.id === 'string' &&
        typeof a.name === 'string' &&
        typeof a.prompt === 'string',
    );
  } catch {
    return [];
  }
}

function persistAgents(agents: CustomAgent[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // Storage full / disabled — agents stay in memory for this session.
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface AgentsPanelProps {
  onCollapse?: () => void;
}

export function AgentsPanel({ onCollapse }: AgentsPanelProps) {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  const activeRepoHash = useCartographerStore((s) => s.activeRepoHash);
  const pushActivity = useCartographerStore((s) => s.pushActivity);

  // Hydrate on first render. SSR-safe via the typeof window guard in loadAgents.
  useEffect(() => {
    setAgents(loadAgents());
  }, []);

  const sorted = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const addAgent = () => {
    const name = draftName.trim();
    const prompt = draftPrompt.trim();
    if (!name || !prompt) {
      toast.error('Name and prompt are required.');
      return;
    }
    const next: CustomAgent[] = [
      ...agents,
      { id: newId(), name, prompt, createdAt: new Date().toISOString() },
    ];
    setAgents(next);
    persistAgents(next);
    setDraftName('');
    setDraftPrompt('');
    setShowForm(false);
    toast.success(`Deployed "${name}"`);
  };

  const deleteAgent = (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    const next = agents.filter((a) => a.id !== id);
    setAgents(next);
    persistAgents(next);
    toast.success(`Deleted "${name}"`);
  };

  const runAgent = async (agent: CustomAgent) => {
    if (!activeRepoHash) {
      toast.error('Open a project first.');
      return;
    }
    setRunningId(agent.id);
    try {
      const bundle = await findRelevantContext({
        task: agent.prompt,
        repo_hash: activeRepoHash,
      });
      pushActivity({
        id: newId(),
        query_type: 'find_relevant_context',
        task: `[${agent.name}] ${agent.prompt}`,
        cluster_id: bundle.region.cluster_id ?? null,
        symbol_ids: bundle.relevant_symbols.map((s) => s.qualified_name),
        ts: Date.now(),
      });
      toast.success(
        `${agent.name}: ${bundle.relevant_symbols.length} symbol${
          bundle.relevant_symbols.length === 1 ? '' : 's'
        } found`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`${agent.name} failed: ${msg}`);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2.5 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="h-[13px] w-[13px] text-[#007acc]" />
          <h3 className="text-sm font-bold text-white flex-1">Agents</h3>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-2.5 hover:bg-[#3e3e42] rounded transition-colors"
              title="Hide panel"
              aria-label="Hide Agents panel"
            >
              <X className="h-[13px] w-[13px] text-gray-400" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">
          {agents.length === 0
            ? 'No agents yet — add one to get started.'
            : `${agents.length} deployed`}
        </p>
      </div>

      {/* New-agent form (toggled) or "+ New" button */}
      <div className="p-3 border-b border-[#1e1e1e] bg-[#252526]">
        {showForm ? (
          <div className="space-y-2">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Agent name"
              className="w-full bg-[#1e1e1e] border border-[#3e3e42] px-2 py-1.5 text-xs text-white rounded focus:outline-none focus:border-[#007acc]"
              autoFocus
            />
            <textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder="What should it ask Cartographer? e.g. 'find all auth middleware'"
              rows={3}
              className="w-full bg-[#1e1e1e] border border-[#3e3e42] px-2 py-1.5 text-xs text-white rounded resize-none focus:outline-none focus:border-[#007acc]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addAgent}
                className="flex-1 px-2 py-1.5 text-xs bg-[#007acc] hover:bg-[#0696e6] text-white rounded transition-colors"
              >
                Deploy
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setDraftName('');
                  setDraftPrompt('');
                }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-[#007acc]/10 hover:bg-[#007acc]/20 text-[#007acc] rounded transition-colors"
          >
            <Plus className="h-3 w-3" />
            New agent
          </button>
        )}
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-auto divide-y divide-[#1e1e1e]">
        {sorted.length === 0 && !showForm && (
          <div className="p-6 text-center text-xs text-gray-500">
            Define agents that turn natural-language tasks into Cartographer
            queries against the active repo.
          </div>
        )}
        {sorted.map((agent) => {
          const running = runningId === agent.id;
          return (
            <div key={agent.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white font-medium mb-1 truncate">{agent.name}</div>
                  <p className="text-xs text-gray-400 leading-snug mb-2 break-words">
                    {agent.prompt}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => runAgent(agent)}
                      disabled={running || !activeRepoHash}
                      className="flex-1 px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-center gap-1.5 bg-[#007acc]/10 hover:bg-[#007acc]/20 text-[#007acc] disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!activeRepoHash ? 'Open a project first' : 'Run against the active repo'}
                    >
                      {running ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Running…
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" />
                          Run
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAgent(agent.id, agent.name)}
                      disabled={running}
                      className="px-2 py-1.5 text-xs rounded transition-colors text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Delete agent"
                      aria-label={`Delete ${agent.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="p-3 border-t border-[#1e1e1e] bg-[#2d2d2d]">
        <p className="text-xs text-gray-500 leading-snug">
          Agents persist in this browser. Each Run dispatches{' '}
          <code className="text-gray-300">find_relevant_context</code> against the
          active repo and posts the result to the Agent Activity log.
        </p>
      </div>
    </div>
  );
}
