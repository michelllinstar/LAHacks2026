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

// ---------------------------------------------------------------------------
// Delta coalescing
// ---------------------------------------------------------------------------
// Per repo hash we accumulate incoming SSE events and flush them as a single
// `set(...)` once per animation frame. This collapses N events per frame into
// one selector re-evaluation, which matters when a fresh index emits 10k+
// node_added events back to back.
//
// Trade-off: if the user navigates away mid-flush, a pending queue is left
// on module scope. For the hackathon this is acceptable since the queue is
// drained on the next applyDelta call (and React garbage-collects the store
// only on full reload). A production version would attach a teardown hook.
const _pendingDeltas = {}; // { [hash]: Array<{type, payload}> }
const _scheduled = {};     // { [hash]: boolean }

function scheduleFlush(hash, store) {
  if (_scheduled[hash]) return;
  _scheduled[hash] = true;
  const run = () => {
    _scheduled[hash] = false;
    flushDeltas(hash, store);
  };
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

function flushDeltas(hash, store) {
  const queue = _pendingDeltas[hash];
  if (!queue || !queue.length) return;
  _pendingDeltas[hash] = [];

  const state = store.getState();
  const baseSlice = state.byRepo[hash] || emptyRepoSlice();

  // Mutable working copy of the slice. We rebuild layer maps lazily so that
  // unchanged layers preserve reference equality (so selectors that subscribe
  // to e.g. layers.invariant don't re-render when only layers.symbol changes).
  let nextSlice = baseSlice;
  let layersChanged = false;
  let nextLayers = baseSlice.layers;
  let highlights = baseSlice.highlights;
  let highlightsChanged = false;
  let indexStatus = baseSlice.indexStatus;
  let indexStatusChanged = false;
  const activityToPush = []; // applied via pushActivity after the set

  function ensureLayer(key) {
    if (!layersChanged) {
      nextLayers = { ...baseSlice.layers };
      layersChanged = true;
    }
    if (nextLayers[key] === baseSlice.layers[key]) {
      const cur = baseSlice.layers[key] || { nodes: [], edges: [] };
      nextLayers[key] = { nodes: cur.nodes.slice(), edges: cur.edges.slice() };
    }
    return nextLayers[key];
  }

  let maxTtl = 0;

  for (const event of queue) {
    const { type, payload } = event;

    if (type === 'index_progress') {
      indexStatus = payload;
      indexStatusChanged = true;
      continue;
    }

    if (type === 'node_added') {
      const layer = payload.layer || layerForKind(payload.node && payload.node.kind);
      const layerKey = layerNumberToKey(layer) || 'symbol';
      const target = ensureLayer(layerKey);
      if (!target.nodes.some((n) => n.id === payload.node.id)) {
        target.nodes.push(payload.node);
      }
      continue;
    }

    if (type === 'edge_added') {
      const layerKey = layerNumberToKey(payload.layer) || 'symbol';
      const target = ensureLayer(layerKey);
      target.edges.push(payload.edge);
      continue;
    }

    if (type === 'region_highlighted') {
      const ids = payload.node_ids || [];
      const color = payload.color || '#fbbf24';
      const ttl = payload.ttl_ms || 2500;
      if (!highlightsChanged) {
        highlights = { ...baseSlice.highlights };
        highlightsChanged = true;
      }
      ids.forEach((id) => { highlights[id] = color; });
      if (ttl > maxTtl) maxTtl = ttl;
      continue;
    }

    if (type === 'agent_activity') {
      activityToPush.push({
        query_id: payload.query_id,
        query_type: payload.query_type,
        cluster_id: payload.cluster_id,
        symbol_ids: payload.symbol_ids || [],
      });
      continue;
    }
  }

  if (layersChanged || highlightsChanged || indexStatusChanged) {
    nextSlice = {
      ...baseSlice,
      layers: layersChanged ? nextLayers : baseSlice.layers,
      highlights: highlightsChanged ? highlights : baseSlice.highlights,
      indexStatus: indexStatusChanged ? indexStatus : baseSlice.indexStatus,
    };
    store.setState({
      byRepo: { ...state.byRepo, [hash]: nextSlice },
    });
  }

  // Activity entries flow through the existing pushActivity reducer (it caps
  // at 100 entries and stamps timestamps). Doing this after the main set
  // keeps the activity sidebar updates independent of layer churn.
  if (activityToPush.length) {
    const api = store.getState();
    activityToPush.forEach((entry) => api.pushActivity(hash, entry));
  }

  if (highlightsChanged && maxTtl > 0) {
    store.getState().clearHighlightsAfter(hash, maxTtl);
  }
}

const useGraphStore = create((set, get) => {
  // Build a tiny shim so flushDeltas can call setState/getState without
  // pulling them out of zustand's closure scope at module load time.
  const storeShim = { getState: () => get(), setState: (v) => set(v) };

  return {
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

    // Public entry point. Enqueues the event and schedules a flush at most
    // once per animation frame. Semantics for each event type are preserved
    // — the only observable change is that effects are batched.
    applyDelta: (hash, event) => {
      if (!_pendingDeltas[hash]) _pendingDeltas[hash] = [];
      _pendingDeltas[hash].push(event);
      scheduleFlush(hash, storeShim);
    },
  };
});

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
