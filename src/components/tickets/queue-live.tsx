"use client";

import { useCallback, useEffect, useRef } from "react";

import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { useRealtimeSignal, useRealtimeStatus } from "@/hooks/use-realtime";

/* ──────────────────────────────────────────────────────────────────────────
   Keeps the queue current. Renders nothing.

   Two paths, and neither one loads a ticket list to find out whether it needs to
   load a ticket list:

   - **Live:** a `queue` signal arrives when something actually changed, and the
     page re-renders from it. No requests at all in between.
   - **Fallback:** `/api/tickets/check-updates` is asked for the ETag. Unchanged
     is a bodyless `304` — no query results, no RSC payload, nothing but the
     status line. Only a real difference costs a `router.refresh()`.

   The old arrangement was `AutoRefresh` at three minutes: a full re-render of
   fifty rows on a timer, whether or not one of them had moved, and still three
   minutes late when one had.

   **The browser is doing the comparison, not this component.** The fetch is a
   plain conditional request — the browser stores the `ETag` from the last
   response and puts it back in `If-None-Match` by itself. That is why the route
   answers `private, no-cache` rather than `no-store`: `no-store` would forbid
   keeping the response at all, and there would be nothing to revalidate against.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * How long a burst of signals is collapsed into one refresh.
 *
 * A second and a half: fast enough that a new ticket appears while somebody is
 * still reading the sentence that mentioned it, slow enough that a busy desk
 * costs one queue render per window rather than one per message. This is the
 * number that decides whether a hundred people chatting is a load problem.
 */
const COALESCE_MS = 1500;

/**
 * Fallback interval. Only runs while the stream is down.
 *
 * Fifteen seconds against a request that is usually thirty-odd bytes of headers
 * and one indexed aggregate. Short enough that the degraded mode still feels like
 * a queue rather than a report, cheap enough to leave running on a wall display.
 */
const FALLBACK_MS = 15_000;

export function QueueLive() {
  const live = useRealtimeStatus() === "live";
  const refresh = useCoalescedRefresh(COALESCE_MS);

  // Coalesced, not immediate: every comment anybody writes publishes a `queue`
  // signal to every connected agent, and answering each one with a full
  // re-render is a stampede rather than an update.
  const onQueue = useCallback(() => refresh(), [refresh]);

  useRealtimeSignal("queue", onQueue);

  /*
   * The last fingerprint seen, so a 200 that happens to carry the same value —
   * a proxy that stripped the ETag, a browser that declined to revalidate —
   * does not turn into a refresh loop. Belt and braces around a mechanism whose
   * correctness depends on an intermediary behaving.
   */
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (live) return;

    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/tickets/check-updates");
        if (cancelled) return;

        // The whole point of the endpoint: nothing changed, nothing to do, and
        // the server never touched a ticket row to tell us so.
        if (response.status === 304) return;
        if (!response.ok) return;

        const body = (await response.json()) as { fingerprint?: string };
        const next = body.fingerprint ?? null;
        if (next === null) return;

        // The first answer only establishes the baseline. Refreshing on it would
        // mean one pointless re-render every time the connection drops.
        if (seen.current !== null && seen.current !== next) refresh();
        seen.current = next;
      } catch {
        // Offline, or the server restarting. The next tick is the retry.
      }
    };

    const timer = setInterval(tick, FALLBACK_MS);
    void tick();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, refresh]);

  return null;
}
