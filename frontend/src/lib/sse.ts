// React hook for the Cartographer SSE stream.
//
// Backend route: GET /api/stream?repo={hash} (backend/routes/stream.py).
// Emits events of types declared in types.ts: index_progress, node_added,
// edge_added, region_highlighted, agent_activity. (``node_updated`` is
// reserved in the type union for forward compatibility but is not currently
// emitted by the backend — see backend/lib/events.py call sites.)
//
// The hook owns one EventSource per (repoHash) it is mounted with and
// re-establishes the connection if the browser drops it. Consumers receive
// every event as a typed callback.

import { useEffect, useRef } from 'react';
import type { SseEvent, SseEventType } from './types';

const EVENT_TYPES: SseEventType[] = [
  'index_progress',
  'node_added',
  'node_updated',
  'edge_added',
  'region_highlighted',
  'agent_activity',
];

export function useRepoStream(
  repoHash: string | null | undefined,
  onEvent: (event: SseEvent) => void,
): void {
  // Stash the callback in a ref so the effect doesn't reconnect on every
  // parent re-render; only repoHash should drive reconnection.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!repoHash) return;
    const url = `/api/stream?repo=${encodeURIComponent(repoHash)}`;
    const source = new EventSource(url, { withCredentials: true });

    const wrappers = EVENT_TYPES.map((type) => {
      const listener = (raw: MessageEvent) => {
        let payload: unknown;
        try {
          payload = JSON.parse(raw.data);
        } catch {
          payload = raw.data;
        }
        handlerRef.current({ type, payload: (payload ?? {}) as Record<string, unknown> });
      };
      source.addEventListener(type, listener as EventListener);
      return { type, listener };
    });

    return () => {
      for (const { type, listener } of wrappers) {
        source.removeEventListener(type, listener as EventListener);
      }
      source.close();
    };
  }, [repoHash]);
}
