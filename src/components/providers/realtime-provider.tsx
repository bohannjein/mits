"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { reconnectDelay } from "@/lib/realtime-backoff";

/* ──────────────────────────────────────────────────────────────────────────
   One EventSource for the whole tab.

   Not one per component. Browsers cap concurrent connections per origin at six
   over HTTP/1.1, and a stream is a connection that never returns — three
   components each opening their own would leave three for everything else the
   page needs, which is the kind of limit that only shows up under load.

   **The subscription is the state, the connection follows it.** A page announces
   what it is looking at through `useRealtimeTicket`; the provider reconnects when
   that changes, because the ticket id is authorised server-side at connect time
   and cannot be renegotiated on an open stream.

   **`status` is what the indicator reads and what every fallback keys off.**
   `live` means the stream is open and nothing needs to poll. `polling` means it
   is not, and the components that have a fallback should use it. There is no
   third state that means "probably fine" — an indicator that guesses is worse
   than one that admits it is on the slow path.
   ────────────────────────────────────────────────────────────────────────── */

export type RealtimeStatus = "connecting" | "live" | "polling";

export type RealtimeSignal = "ticket" | "notify" | "queue";

type Handler = (ticketId: string | null) => void;

interface RealtimeApi {
  status: RealtimeStatus;
  /** Register interest in one ticket. Returns the release. */
  watchTicket: (ticketId: string) => () => void;
  /** Listen for a signal type. Returns the unsubscribe. */
  on: (signal: RealtimeSignal, handler: Handler) => () => void;
}

const RealtimeContext = createContext<RealtimeApi | null>(null);

/**
 * A no-op outside the provider.
 *
 * The auth screens render without it, and a component that would like to be live
 * must not be the reason a page fails. `polling` is the honest answer there: not
 * connected, and whatever fallback exists should run.
 */
const INERT: RealtimeApi = {
  status: "polling",
  watchTicket: () => () => {},
  on: () => () => {},
};

export function useRealtime(): RealtimeApi {
  return useContext(RealtimeContext) ?? INERT;
}

export function RealtimeProvider({
  children,
  /** Off for a signed-out visitor: there is nothing to stream and no session. */
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<RealtimeStatus>(
    enabled ? "connecting" : "polling",
  );
  const [ticketId, setTicketId] = useState<string | null>(null);

  /*
   * Handlers in a ref rather than in state.
   *
   * They are read when an event arrives, never rendered. Keeping them in state
   * would re-render every consumer of this context each time a component mounted
   * and registered one — including the ticket page, on every navigation.
   */
  const handlers = useRef(new Map<RealtimeSignal, Set<Handler>>());

  /*
   * A count per ticket id, not a single value.
   *
   * Two components on the ticket page want the same id — the live refresher and,
   * later, anything else that cares. With a bare setter the first one to unmount
   * would clear the subscription out from under the second, and the page would
   * quietly fall back to polling while still looking connected.
   */
  const watchers = useRef(new Map<string, number>());

  const watchTicket = useCallback((id: string) => {
    watchers.current.set(id, (watchers.current.get(id) ?? 0) + 1);
    setTicketId(id);

    return () => {
      const left = (watchers.current.get(id) ?? 1) - 1;
      if (left > 0) {
        watchers.current.set(id, left);
        return;
      }
      watchers.current.delete(id);
      setTicketId((current) => (current === id ? null : current));
    };
  }, []);

  const on = useCallback((signal: RealtimeSignal, handler: Handler) => {
    const set = handlers.current.get(signal) ?? new Set<Handler>();
    set.add(handler);
    handlers.current.set(signal, set);
    return () => {
      set.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("polling");
      return;
    }

    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let cancelled = false;

    const emit = (signal: RealtimeSignal) => (event: MessageEvent) => {
      let id: string | null = null;
      try {
        id = (JSON.parse(event.data) as { ticketId: string | null }).ticketId;
      } catch {
        // A malformed frame is not worth dropping the connection over; the
        // handlers that do not need an id still want to know it happened.
      }
      for (const handler of handlers.current.get(signal) ?? []) handler(id);
    };

    const connect = () => {
      if (cancelled) return;

      const url = ticketId
        ? `/api/realtime/stream?ticket=${encodeURIComponent(ticketId)}`
        : "/api/realtime/stream";
      source = new EventSource(url);

      // `ready` rather than `onopen`: the browser fires `onopen` on the response
      // headers, which a proxy can produce for a stream it then fails to forward.
      // The first byte from the route is the only proof the path works end to end.
      source.addEventListener("ready", () => {
        attempt = 0;
        setStatus("live");
      });

      source.addEventListener("ticket", emit("ticket"));
      source.addEventListener("notify", emit("notify"));
      source.addEventListener("queue", emit("queue"));

      source.onerror = () => {
        // `EventSource` reconnects on its own, but on a fixed short interval and
        // with no ceiling — which is the reconnection storm this replaces. Closing
        // and rescheduling puts the timing back under our control.
        source?.close();
        source = null;
        if (cancelled) return;

        setStatus("polling");
        retry = setTimeout(connect, reconnectDelay(attempt));
        attempt += 1;
      };
    };

    // Nothing at all while the tab is in the background, including the first
    // connection: a page restored into a hidden tab should not claim a slot.
    if (!document.hidden) connect();

    /*
     * A hidden tab gives its connection back.
     *
     * This is the one that decides whether MITS survives being left open. Over
     * HTTP/1.1 a browser allows six connections per origin, and an event stream is
     * a connection that never returns — four tabs on the queue and there is
     * nothing left for the page loads themselves. The symptom is not an error
     * message, it is navigation that hangs, which is indistinguishable from a slow
     * server and impossible to attribute.
     *
     * A hidden tab has nothing to show anybody, so it holds nothing. Coming back
     * reconnects at once and the next render is current. This also removes the
     * per-connection cost on the server for every tab nobody is looking at, which
     * is most of them on a desk that has been running since Monday.
     *
     * (Behind HTTP/2 the limit does not apply. Deployments differ and this is
     * cheap either way.)
     */
    const disconnect = () => {
      clearTimeout(retry);
      source?.close();
      source = null;
      setStatus("polling");
    };

    const onVisible = () => {
      if (document.hidden) {
        disconnect();
        return;
      }
      if (source) return;
      clearTimeout(retry);
      attempt = 0;
      connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(retry);
      source?.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [enabled, ticketId]);

  const api = useMemo<RealtimeApi>(
    () => ({ status, watchTicket, on }),
    [status, watchTicket, on],
  );

  return (
    <RealtimeContext.Provider value={api}>{children}</RealtimeContext.Provider>
  );
}
