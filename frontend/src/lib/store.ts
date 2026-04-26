// Cross-component state for the Cartographer workspace.
//
// Holds: the active repo hash, per-repo graph projections (loaded once on
// view mount), live SSE highlights, and an agent-activity log that the
// AgentActivityLog panel renders.
//
// Anything that survives across components or panels lives here so the
// workspace doesn't need a context provider tree.

import { create } from 'zustand';
import type { AgentRunStatus, GraphProjection, IndexStatus, LayerName, RepoSummary } from './types';

export interface AgentActivity {
  id: string;
  query_type: string;
  task: string;
  cluster_id?: string | null;
  symbol_ids: string[];
  ts: number; // epoch ms
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

  activeRepoHash: string | null;
  setActiveRepoHash: (hash: string | null) => void;

  byRepo: Record<string, RepoState>;
  setGraph: (hash: string, layer: LayerName, graph: GraphProjection) => void;
  setIndex: (hash: string, status: IndexStatus) => void;
  pushHighlight: (hash: string, h: RegionHighlight) => void;
  pruneExpiredHighlights: (hash: string) => void;

  activity: AgentActivity[];
  pushActivity: (a: AgentActivity) => void;
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
  pushActivity: (a) =>
    set((state) => ({ activity: [a, ...state.activity].slice(0, 200) })),
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
