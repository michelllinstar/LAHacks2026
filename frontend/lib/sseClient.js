// Opens an SSE connection to the backend and dispatches named events into the store.
export function connectStream(hash, store) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const url = `/api/stream?repo=${encodeURIComponent(hash)}`;
  let es;
  try {
    es = new EventSource(url);
  } catch (e) {
    return () => {};
  }

  const eventNames = [
    'index_progress',
    'node_added',
    'edge_added',
    'region_highlighted',
    'agent_activity',
  ];

  const handlers = {};
  eventNames.forEach((name) => {
    const h = (evt) => {
      let payload;
      try {
        payload = JSON.parse(evt.data);
      } catch (_) {
        payload = evt.data;
      }
      try {
        store.applyDelta(hash, { type: name, payload });
      } catch (err) {
        // swallow store errors so SSE keeps running
        // eslint-disable-next-line no-console
        console.error('store.applyDelta failed', err);
      }
    };
    handlers[name] = h;
    es.addEventListener(name, h);
  });

  es.onerror = () => {
    // EventSource auto-reconnects; nothing to do here for the hackathon
  };

  return () => {
    eventNames.forEach((name) => {
      try { es.removeEventListener(name, handlers[name]); } catch (_) {}
    });
    try { es.close(); } catch (_) {}
  };
}

export default { connectStream };
