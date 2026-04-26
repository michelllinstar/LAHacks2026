'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Loader2, Play, Plus, Trash2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createAgentRun, listAgentTemplates } from '../../../lib/api';
import { useCartographerStore } from '../../../lib/store';
import type { AgentTemplateSummary } from '../../../lib/types';

// User-defined agent — a saved (template, prompt, name) tuple. Pressing "Run"
// dispatches POST /api/agents/runs against the active repo, which spawns the
// Phase 1 ReAct runner on the backend. Live progress streams over SSE and is
// reflected in the agentRuns store; this panel pairs each agent with its most
// recent run so the user can watch it work.
//
// Persistence is local to the browser (localStorage), keyed per browser, not
// per repo — agents are user-level templates the user reaches for across
// projects. The actual run records live in Mongo (collection: agent_runs).
interface CustomAgent {
  id: string;
  name: string;
  prompt: string;
  templateId: string;
  createdAt: string;
  // Most-recent run id, so the panel can mirror live SSE state from the store.
  lastRunId?: string;
}

const STORAGE_KEY = 'cartographer.agents.custom.v2';

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
        typeof a.prompt === 'string' &&
        typeof a.templateId === 'string',
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
  const [templates, setTemplates] = useState<AgentTemplateSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftTemplate, setDraftTemplate] = useState('region-auditor');
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const activeRepoHash = useCartographerStore((s) => s.activeRepoHash);
  const agentRuns = useCartographerStore((s) => s.agentRuns);

  // Hydrate from localStorage and fetch the backend's template catalog.
  useEffect(() => {
    setAgents(loadAgents());
    listAgentTemplates()
      .then(setTemplates)
      .catch(() => {
        // Fall back to a known set so the form still renders if the backend
        // is briefly unreachable. Order matches backend/routes/agents.py.
        setTemplates([
          { id: 'region-auditor', name: 'Region Auditor', description: 'Describe the area and surface invariants.' },
          { id: 'flow-tracer', name: 'Flow Tracer', description: 'Trace data flows from a seed.' },
          { id: 'convention-scout', name: 'Convention Scout', description: 'Identify role + exemplars in this region.' },
          { id: 'refactor-planner', name: 'Refactor Planner', description: 'Propose a refactor citing exemplars.' },
        ]);
      });
  }, []);

  const sorted = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const templateById = useMemo(() => {
    const map = new Map<string, AgentTemplateSummary>();
    for (const t of templates) map.set(t.id, t);
    return map;
  }, [templates]);

  const addAgent = () => {
    const name = draftName.trim();
    const prompt = draftPrompt.trim();
    if (!name || !prompt) {
      toast.error('Name and prompt are required.');
      return;
    }
    const next: CustomAgent[] = [
      ...agents,
      {
        id: newId(),
        name,
        prompt,
        templateId: draftTemplate,
        createdAt: new Date().toISOString(),
      },
    ];
    setAgents(next);
    persistAgents(next);
    setDraftName('');
    setDraftPrompt('');
    setDraftTemplate('region-auditor');
    setShowForm(false);
    toast.success(`Saved "${name}"`);
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
    setDispatchingId(agent.id);
    try {
      const { run_id } = await createAgentRun({
        repo_hash: activeRepoHash,
        template_id: agent.templateId,
        scope: null,
        prompt: agent.prompt,
      });
      const next = agents.map((a) => (a.id === agent.id ? { ...a, lastRunId: run_id } : a));
      setAgents(next);
      persistAgents(next);
      toast.success(`${agent.name} dispatched`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`${agent.name} failed to dispatch: ${msg}`);
    } finally {
      setDispatchingId(null);
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
            : `${agents.length} saved`}
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
            <select
              value={draftTemplate}
              onChange={(e) => setDraftTemplate(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#3e3e42] px-2 py-1.5 text-xs text-white rounded focus:outline-none focus:border-[#007acc]"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {templateById.get(draftTemplate)?.description && (
              <p className="text-[11px] text-gray-500 leading-snug">
                {templateById.get(draftTemplate)?.description}
              </p>
            )}
            <textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder="What should the agent do? e.g. 'audit the auth module for missing rate limiting'"
              rows={3}
              className="w-full bg-[#1e1e1e] border border-[#3e3e42] px-2 py-1.5 text-xs text-white rounded resize-none focus:outline-none focus:border-[#007acc]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addAgent}
                className="flex-1 px-2 py-1.5 text-xs bg-[#007acc] hover:bg-[#0696e6] text-white rounded transition-colors"
              >
                Save
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
            Pick a template, write a prompt, and run it against the active
            repo. Live tool calls stream into the activity log.
          </div>
        )}
        {sorted.map((agent) => {
          const dispatching = dispatchingId === agent.id;
          const liveRun = agent.lastRunId ? agentRuns[agent.lastRunId] : undefined;
          const running = liveRun?.status === 'running' || liveRun?.status === 'queued';
          const lastStep = liveRun?.steps[liveRun.steps.length - 1];
          const tpl = templateById.get(agent.templateId);
          return (
            <div key={agent.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-xs text-white font-medium truncate flex-1">{agent.name}</div>
                    {liveRun?.status === 'succeeded' && <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />}
                    {liveRun?.status === 'failed' && <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
                    {running && <Loader2 className="h-3 w-3 text-[#007acc] animate-spin flex-shrink-0" />}
                  </div>
                  <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">
                    {tpl?.name ?? agent.templateId}
                  </div>
                  <p className="text-xs text-gray-400 leading-snug mb-2 break-words">
                    {agent.prompt}
                  </p>
                  {liveRun && (
                    <div className="text-[11px] text-gray-500 mb-2">
                      {liveRun.status === 'running' && lastStep && (
                        <span>
                          step {lastStep.step}: <span className="text-gray-300">{lastStep.role}</span>
                          {lastStep.role === 'tool_call' && lastStep.payload.tool ? (
                            <span className="text-[#007acc]"> · {String(lastStep.payload.tool)}</span>
                          ) : null}
                        </span>
                      )}
                      {liveRun.status === 'succeeded' && (
                        <span className="text-green-400">finished · {liveRun.steps.length} steps</span>
                      )}
                      {liveRun.status === 'failed' && (
                        <span className="text-red-400">failed{liveRun.error ? ` · ${liveRun.error}` : ''}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => runAgent(agent)}
                      disabled={dispatching || running || !activeRepoHash}
                      className="flex-1 px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-center gap-1.5 bg-[#007acc]/10 hover:bg-[#007acc]/20 text-[#007acc] disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!activeRepoHash ? 'Open a project first' : 'Run against the active repo'}
                    >
                      {dispatching || running ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {dispatching ? 'Dispatching…' : 'Running…'}
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
                      disabled={dispatching || running}
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
          Each Run dispatches the chosen template against the active repo via{' '}
          <code className="text-gray-300">/api/agents/runs</code>. Tool calls
          stream live into the agent activity log on the right.
        </p>
      </div>
    </div>
  );
}
