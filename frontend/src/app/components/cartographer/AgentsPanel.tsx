'use client';
import { useEffect, useState } from 'react';
import { Bot, Globe, Loader2, Play, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createExternalAgent,
  deleteExternalAgent,
  listExternalAgents,
  runExternalAgent,
} from '../../../lib/api';
import { useCartographerStore } from '../../../lib/store';
import type { ExternalAgent } from '../../../lib/types';

// External agents are user-owned HTTP endpoints registered with the backend.
// The website's run dispatcher pre-fetches a Cartographer ContextBundle and
// POSTs ``{prompt, repo_hash, context_bundle}`` to the agent's URL, then
// surfaces the agent's ``{summary, citations}`` reply in the activity log.
//
// Wire contract + backend route: backend/routes/external_agents.py.

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
  const [externalAgents, setExternalAgents] = useState<ExternalAgent[]>([]);
  // Default to expanded so the URL field is visible on first open. Once the
  // user has registered an agent we collapse to the + button to save space.
  const [showForm, setShowForm] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftAuth, setDraftAuth] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  const activeRepoHash = useCartographerStore((s) => s.activeRepoHash);
  const pushActivity = useCartographerStore((s) => s.pushActivity);
  const updateActivity = useCartographerStore((s) => s.updateActivity);

  // Fetch the registered set on mount. Defensive Array.isArray fallback in
  // case the backend ever returns a non-array shape (it currently doesn't,
  // but a future error envelope shouldn't crash the panel).
  useEffect(() => {
    listExternalAgents()
      .then((data) => setExternalAgents(Array.isArray(data) ? data : []))
      .catch(() => setExternalAgents([]));
  }, []);

  const addExternal = async () => {
    const name = draftName.trim();
    const url = draftUrl.trim();
    if (!name || !url) {
      toast.error('Missing required fields', {
        description: 'Name and endpoint URL are both required.',
      });
      return;
    }
    try {
      const created = await createExternalAgent({
        name,
        endpoint_url: url,
        auth_header: draftAuth.trim() || undefined,
      });
      setExternalAgents([...externalAgents, created]);
      setDraftName('');
      setDraftUrl('');
      setDraftAuth('');
      setShowForm(false);
      toast.success(`Registered "${name}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Couldn\u2019t register agent', { description: msg });
    }
  };

  const deleteExternal = async (agent: ExternalAgent) => {
    if (!window.confirm(`Delete "${agent.name}"?`)) return;
    try {
      await deleteExternalAgent(agent.agent_id);
      setExternalAgents(externalAgents.filter((a) => a.agent_id !== agent.agent_id));
      toast.success(`Deleted "${agent.name}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Couldn\u2019t delete agent', { description: msg });
    }
  };

  const runExternal = async (agent: ExternalAgent) => {
    if (!activeRepoHash) {
      toast.error('No project selected', {
        description: 'Open a project before running this action.',
      });
      return;
    }
    const prompt = window.prompt(`Prompt for ${agent.name}:`);
    if (!prompt || !prompt.trim()) return;
    const trimmed = prompt.trim();
    setRunningId(agent.agent_id);

    // Push the entry IMMEDIATELY in 'running' state so the user sees the
    // prompt land in Agent Activity right away — instead of waiting tens of
    // seconds for the upstream call to return. The id is generated here so
    // we can patch the same row in-place when the result arrives.
    const entryId = newId();
    pushActivity({
      id: entryId,
      query_type: `external:${agent.name}`,
      task: trimmed,
      cluster_id: null,
      symbol_ids: [],
      ts: Date.now(),
      status: 'running',
    });

    try {
      const result = await runExternalAgent(agent.agent_id, {
        prompt: trimmed,
        repo_hash: activeRepoHash,
      });
      const summary = result.summary ?? '';
      toast.success(`${agent.name}: ${summary.slice(0, 80)}${summary.length > 80 ? '…' : ''}`);
      updateActivity(entryId, {
        status: 'done',
        summary,
        symbol_ids: result.citations || [],
        steps: result.steps || [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`${agent.name} failed`, { description: msg });
      updateActivity(entryId, {
        status: 'failed',
        summary: `Error: ${msg}`,
      });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2.5 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="h-[13px] w-[13px] text-emerald-400" />
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
          Register HTTP endpoints — the backend POSTs work to your runtime.
        </p>
      </div>

      {/* Form / + button */}
      <div className="p-3 border-b border-[#1e1e1e] bg-[#252526]">
        {showForm ? (
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Name
              </label>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g. Claude Code"
                className="w-full bg-[#1e1e1e] border border-[#3e3e42] px-2 py-1.5 text-xs text-white rounded focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Endpoint URL
              </label>
              <input
                // ``text`` not ``url`` — browser URL validation rejects bare
                // hosts like ``127.0.0.1:5050``. The backend's
                // ``_validate_endpoint_url`` does the real check.
                type="text"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="http://127.0.0.1:5050"
                className="w-full bg-[#1e1e1e] border border-[#3e3e42] px-2 py-1.5 text-xs text-white rounded focus:outline-none focus:border-emerald-500 font-mono"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Full URL with <code>http://</code> or <code>https://</code>.
                Localhost works for agents running on this machine.
              </p>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Auth header <span className="text-gray-600 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={draftAuth}
                onChange={(e) => setDraftAuth(e.target.value)}
                placeholder="Bearer sk-…"
                className="w-full bg-[#1e1e1e] border border-[#3e3e42] px-2 py-1.5 text-xs text-white rounded focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addExternal}
                className="flex-1 px-2 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setDraftName('');
                  setDraftUrl('');
                  setDraftAuth('');
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
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded transition-colors"
          >
            <Plus className="h-3 w-3" />
            Register endpoint
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto divide-y divide-[#1e1e1e]">
        {externalAgents.length === 0 && !showForm && (
          <div className="p-4 text-center text-xs text-gray-500 italic">
            No agents registered yet.
          </div>
        )}
        {externalAgents.map((agent) => {
          const running = runningId === agent.agent_id;
          return (
            <div key={agent.agent_id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-xs text-white font-medium truncate">{agent.name}</div>
                    {agent.has_auth && (
                      <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Authorized
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono mb-2 truncate">
                    <Globe className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{agent.endpoint_url}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => runExternal(agent)}
                      disabled={running || !activeRepoHash}
                      title={!activeRepoHash ? 'Open a project first' : 'Run against the active repo'}
                      className="flex-1 px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
                      onClick={() => deleteExternal(agent)}
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
          Each <strong>Run</strong> sends the active repo&apos;s context bundle to the agent&apos;s URL
          and posts the result to the Agent Activity log.
        </p>
      </div>
    </div>
  );
}
