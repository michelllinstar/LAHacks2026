// Cross-component state for the Cartographer workspace.
//
// Holds: the active repo hash, per-repo graph projections (loaded once on
// view mount), live SSE highlights, and an agent-activity log that the
// AgentActivityLog panel renders.
//
// Anything that survives across components or panels lives here so the
// workspace doesn't need a context provider tree.

import { create } from 'zustand';
import type {
  AgentRunStatus,
  GraphProjection,
  IndexStatus,
  LayerName,
  ReasoningStep,
  RepoSummary,
} from './types';

export type AgentActivityStatus = 'running' | 'done' | 'failed';

export interface AgentActivity {
  id: string;
  query_type: string;
  task: string;
  cluster_id?: string | null;
  symbol_ids: string[];
  ts: number; // epoch ms
  // Lifecycle of the entry. Defaults to 'done' for backward compatibility,
  // so existing call sites that just push a finished entry keep working.
  // External-agent dispatches push 'running' immediately on user submit so
  // the prompt is visible without waiting for the upstream call to finish.
  status?: AgentActivityStatus;
  // Optional natural-language summary the agent returned. Surfaced by the
  // AgentActivityLog under each entry. Built-in agents may omit it; external
  // agents always populate it from their response body's ``summary``.
  summary?: string;
  // Optional chain-of-reasoning the external agent reported (think/act/observe
  // turns). Rendered as a collapsible thread under the summary.
  steps?: ReasoningStep[];
}

export interface RegionHighlight {
  node_ids: string[];
  color: string;
  expires_at: number; // epoch ms
}

export interface RepoState {
  graphs: Partial<Record<LayerName, GraphProjection>>;
  highlights: RegionHighlight[];
  index?: IndexStatus;
}

interface CartographerState {
  user: { email: string; authenticated: boolean } | null;
  setUser: (user: CartographerState['user']) => void;

  repos: RepoSummary[];
  setRepos: (repos: RepoSummary[]) => void;

  // Per-repo domain (Personal / Work) chosen at create time. The backend
  // doesn't persist this yet; we keep it in the client store + localStorage
  // so the dashboard's Personal/Work toggle remembers the user's pick.
  repoDomains: Record<string, 'personal' | 'work'>;
  setRepoDomain: (hash: string, domain: 'personal' | 'work') => void;

  activeRepoHash: string | null;
  setActiveRepoHash: (hash: string | null) => void;

  byRepo: Record<string, RepoState>;
  setGraph: (hash: string, layer: LayerName, graph: GraphProjection) => void;
  setIndex: (hash: string, status: IndexStatus) => void;
  pushHighlight: (hash: string, h: RegionHighlight) => void;
  pruneExpiredHighlights: (hash: string) => void;

  activity: AgentActivity[];
  pushActivity: (a: AgentActivity) => void;
  // Patch an existing entry by id. No-op if the id isn't in the store.
  // Used by the external-agents flow to flip an entry from 'running' →
  // 'done' / 'failed' once the upstream call returns.
  updateActivity: (id: string, patch: Partial<AgentActivity>) => void;
  clearActivity: () => void;

  // Live agent-run state, keyed by run_id. Mirrors backend/routes/agents.py.
  agentRuns: Record<string, AgentRunLive>;
  upsertAgentRun: (run: AgentRunLive) => void;
  appendAgentStep: (runId: string, step: AgentStepEvent) => void;
  finishAgentRun: (runId: string, status: AgentRunStatus, result?: unknown, error?: string) => void;
}

export interface AgentStepEvent {
  step: number;
  role: 'thought' | 'tool_call' | 'tool_result' | 'final';
  payload: Record<string, unknown>;
  ts: number;
}

export interface AgentRunLive {
  run_id: string;
  template_id: string;
  prompt: string;
  status: AgentRunStatus;
  started_at: number;
  finished_at?: number;
  error?: string;
  steps: AgentStepEvent[];
  result?: unknown;
}

export const useCartographerStore = create<CartographerState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  repos: [],
  setRepos: (repos) => set({ repos }),

  repoDomains: (() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('markcodepolo:repoDomains');
      return raw ? (JSON.parse(raw) as Record<string, 'personal' | 'work'>) : {};
    } catch {
      return {};
    }
  })(),
  setRepoDomain: (hash, domain) =>
    set((state) => {
      const next = { ...state.repoDomains, [hash]: domain };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('markcodepolo:repoDomains', JSON.stringify(next));
        } catch {
          /* swallow — storage full / private mode */
        }
      }
      return { repoDomains: next };
    }),

  activeRepoHash: null,
  setActiveRepoHash: (hash) => set({ activeRepoHash: hash }),

  byRepo: {},
  setGraph: (hash, layer, graph) =>
    set((state) => ({
      byRepo: {
        ...state.byRepo,
        [hash]: {
          ...(state.byRepo[hash] ?? { graphs: {}, highlights: [] }),
          graphs: {
            ...((state.byRepo[hash]?.graphs) ?? {}),
            [layer]: graph,
          },
        },
      },
    })),
  setIndex: (hash, status) =>
    set((state) => ({
      byRepo: {
        ...state.byRepo,
        [hash]: {
          ...(state.byRepo[hash] ?? { graphs: {}, highlights: [] }),
          index: status,
        },
      },
    })),
  pushHighlight: (hash, h) =>
    set((state) => ({
      byRepo: {
        ...state.byRepo,
        [hash]: {
          ...(state.byRepo[hash] ?? { graphs: {}, highlights: [] }),
          highlights: [...(state.byRepo[hash]?.highlights ?? []), h],
        },
      },
    })),
  pruneExpiredHighlights: (hash) =>
    set((state) => {
      const now = Date.now();
      const repo = state.byRepo[hash];
      if (!repo) return state;
      const filtered = repo.highlights.filter((h) => h.expires_at > now);
      if (filtered.length === repo.highlights.length) return state;
      return {
        byRepo: {
          ...state.byRepo,
          [hash]: { ...repo, highlights: filtered },
        },
      };
    }),

  activity: [],
  // Idempotent on id: if an entry with the same id already exists we merge
  // the new payload into it in place rather than prepending a duplicate.
  // This is what lets the dispatching tab's optimistic row and the SSE
  // broadcast (which carries the same id) collapse into a single entry —
  // and what makes a second tab still see a real entry instead of nothing,
  // since the upsert pushes when the id is new.
  pushActivity: (a) =>
    set((state) => {
      const idx = state.activity.findIndex((e) => e.id === a.id);
      if (idx >= 0) {
        const merged = { ...state.activity[idx], ...a };
        const next = state.activity.slice();
        next[idx] = merged;
        return { activity: next };
      }
      return { activity: [a, ...state.activity].slice(0, 200) };
    }),
  updateActivity: (id, patch) =>
    set((state) => ({
      activity: state.activity.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    })),
  clearActivity: () => set({ activity: [] }),

  agentRuns: {},
  upsertAgentRun: (run) =>
    set((state) => ({ agentRuns: { ...state.agentRuns, [run.run_id]: run } })),
  appendAgentStep: (runId, step) =>
    set((state) => {
      const existing = state.agentRuns[runId];
      if (!existing) return state;
      return {
        agentRuns: {
          ...state.agentRuns,
          [runId]: { ...existing, steps: [...existing.steps, step] },
        },
      };
    }),
  finishAgentRun: (runId, status, result, error) =>
    set((state) => {
      const existing = state.agentRuns[runId];
      if (!existing) return state;
      return {
        agentRuns: {
          ...state.agentRuns,
          [runId]: { ...existing, status, finished_at: Date.now(), result, error },
        },
      };
    }),
}));
