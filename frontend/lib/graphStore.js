import { create } from 'zustand';

function emptyRepoSlice() {
  return {
    layers: {
      symbol: { nodes: [], edges: [] },
      flow: { nodes: [], edges: [] },
      architecture: { nodes: [], edges: [] },
      invariant: { nodes: [], edges: [] },
    },
    highlights: {}, // { nodeId: color }
    activity: [], // ActivityEntry[]
    indexStatus: null,
  };
}

const useGraphStore = create((set, get) => ({
  byRepo: {},
  currentRepo: null,

  setCurrentRepo: (hash) => set({ currentRepo: hash }),

  ensureRepo: (hash) => {
    const cur = get().byRepo[hash];
    if (!cur) {
      set((state) => ({ byRepo: { ...state.byRepo, [hash]: emptyRepoSlice() } }));
    }
  },

  hydrateLayer: (hash, layer, projection) =>
    set((state) => {
      const slice = state.byRepo[hash] || emptyRepoSlice();
      return {
        byRepo: {
          ...state.byRepo,
          [hash]: {
            ...slice,
            layers: {
              ...slice.layers,
              [layer]: projection || { nodes: [], edges: [] },
            },
          },
        },
      };
    }),

  setIndexStatus: (hash, status) =>
    set((state) => {
      const slice = state.byRepo[hash] || emptyRepoSlice();
      return { byRepo: { ...state.byRepo, [hash]: { ...slice, indexStatus: status } } };
    }),

  pushActivity: (hash, entry) =>
    set((state) => {
      const slice = state.byRepo[hash] || emptyRepoSlice();
      const next = [
        { ...entry, ts: entry.ts || Date.now() },
        ...slice.activity,
      ].slice(0, 100);
      return { byRepo: { ...state.byRepo, [hash]: { ...slice, activity: next } } };
    }),

  clearHighlightsAfter: (hash, ttl) => {
    const ms = Math.max(100, Number(ttl) || 1500);
    setTimeout(() => {
      set((state) => {
        const slice = state.byRepo[hash];
        if (!slice) return {};
        return { byRepo: { ...state.byRepo, [hash]: { ...slice, highlights: {} } } };
      });
    }, ms);
  },

  applyDelta: (hash, event) => {
    const { type, payload } = event;
    const state = get();
    const slice = state.byRepo[hash] || emptyRepoSlice();

    if (type === 'index_progress') {
      set({
        byRepo: {
          ...state.byRepo,
          [hash]: { ...slice, indexStatus: payload },
        },
      });
      return;
    }

    if (type === 'node_added') {
      const layer = payload.layer || layerForKind(payload.node?.kind);
      const layerKey = layerNumberToKey(layer) || 'symbol';
      const cur = slice.layers[layerKey] || { nodes: [], edges: [] };
      const exists = cur.nodes.some((n) => n.id === payload.node.id);
      if (exists) return;
      set({
        byRepo: {
          ...state.byRepo,
          [hash]: {
            ...slice,
            layers: {
              ...slice.layers,
              [layerKey]: { nodes: [...cur.nodes, payload.node], edges: cur.edges },
            },
          },
        },
      });
      return;
    }

    if (type === 'edge_added') {
      const layerKey = layerNumberToKey(payload.layer) || 'symbol';
      const cur = slice.layers[layerKey] || { nodes: [], edges: [] };
      set({
        byRepo: {
          ...state.byRepo,
          [hash]: {
            ...slice,
            layers: {
              ...slice.layers,
              [layerKey]: { nodes: cur.nodes, edges: [...cur.edges, payload.edge] },
            },
          },
        },
      });
      return;
    }

    if (type === 'region_highlighted') {
      const ids = payload.node_ids || [];
      const color = payload.color || '#fbbf24';
      const ttl = payload.ttl_ms || 2500;
      const next = { ...slice.highlights };
      ids.forEach((id) => {
        next[id] = color;
      });
      set({
        byRepo: {
          ...state.byRepo,
          [hash]: { ...slice, highlights: next },
        },
      });
      get().clearHighlightsAfter(hash, ttl);
      return;
    }

    if (type === 'agent_activity') {
      get().pushActivity(hash, {
        query_id: payload.query_id,
        query_type: payload.query_type,
        cluster_id: payload.cluster_id,
        symbol_ids: payload.symbol_ids || [],
      });
      return;
    }
  },
}));

function layerNumberToKey(layer) {
  switch (layer) {
    case 1: return 'symbol';
    case 2: return 'flow';
    case 3: return 'architecture';
    case 4: return 'invariant';
    default: return null;
  }
}

function layerForKind(kind) {
  switch (kind) {
    case 'symbol': return 1;
    case 'flow_node': return 2;
    case 'cluster': return 3;
    case 'invariant': return 4;
    default: return 1;
  }
}

export default useGraphStore;
export { useGraphStore };
