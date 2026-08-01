"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { useRealtimeSignal, useRealtimeStatus, useRealtimeTicket } from "@/hooks/use-realtime";

/* ──────────────────────────────────────────────────────────────────────────
   Makes the ticket page live. Renders nothing.

   **Event-driven first, polled only as a fallback.** While the SSE stream is up
   this component issues no requests at all: the server pushes a `ticket` signal
   the moment somebody writes a reply or changes a status, and the page refreshes
   from that. Idle costs one open connection and zero queries.

   When the stream is down — a proxy that buffers, a network that dropped, a
   browser with the connection budget spent — the old adaptive poll takes over at
   the same two rates it always used. The page behaves identically; it is just
   seconds later. That is the whole point of keeping both: realtime that fails
   closed to *nothing* is worse than polling, because the failure is invisible.

   `router.refresh()` rather than a reload, and rather than fetching the messages
   here: it swaps the RSC payload and leaves client state alone, so a half-typed
   reply survives the message that arrives while it is being written. It also
   keeps one place deciding what a reader may see — `listCommentsFor`, on the
   server, exactly as on a first load.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Fallback rates, used only while the stream is down.
 *
 * Two, because a fixed interval is wrong at both ends: too slow to read as a chat
 * while two people are typing at each other, and a pointless request for every
 * ticket somebody left open in a tab last Tuesday.
 */
const ACTIVE_MS = 2500;
const IDLE_MS = 12_000;

/** How long after the last change the conversation still counts as warm. */
const WARM_MS = 120_000;

/**
 * Burst window for the conversation.
 *
 * Shorter than the queue's: this is a chat, and half a second is below the
 * threshold at which a reply feels delayed. It still collapses the case that
 * matters — somebody sending three lines in a row is one render, not three.
 */
const COALESCE_MS = 500;

export function TicketLive({
  ticketId,
  /** The fingerprint as of this render, so the first poll has something to differ from. */
  fingerprint,
}: {
  ticketId: string;
  fingerprint: string;
}) {
  // Tells the provider to reconnect the stream scoped to this ticket. The server
  // authorises the id once, at connect; see the stream route.
  useRealtimeTicket(ticketId);
  const status = useRealtimeStatus();
  const live = status === "live";

  /*
   * Seeded from the server render and advanced only after a refresh has been
   * asked for. In a ref rather than in state: writing it must not itself cause a
   * render, or every tick would re-render a component whose entire job is to
   * render nothing.
   */
  const seen = useRef(fingerprint);

  /*
   * When the fingerprint last moved, for the two-rate fallback.
   *
   * State rather than a ref, because the interval has to *re-arm* when it
   * changes — a ref would keep whichever rate was in force when the query was
   * created, and the poll would still be crawling at twelve seconds through the
   * exchange it was supposed to speed up for.
   */
  const [lastChange, setLastChange] = useState<number | null>(null);
  const warm = lastChange !== null && Date.now() - lastChange < WARM_MS;

  /*
   * The signal carries no content — only "this ticket moved". Refreshing on it is
   * the same code path the poll uses, which is why there is no second way for a
   * message to reach the screen and no second place for it to go wrong.
   */
  const refresh = useCoalescedRefresh(COALESCE_MS);

  const onTicket = useCallback(() => {
    setLastChange(Date.now());
    refresh();
  }, [refresh]);

  useRealtimeSignal("ticket", onTicket);

  const { data } = useQuery({
    queryKey: ["ticket-activity", ticketId],
    queryFn: async (): Promise<string | null> => {
      const response = await fetch(`/api/tickets/${ticketId}/activity`, {
        cache: "no-store",
      });
      // A 401 after the session expired, or a 404 after the ticket was deleted
      // under us. Neither is worth a refresh loop; the next navigation resolves it.
      if (!response.ok) return null;
      const body = (await response.json()) as { fingerprint?: string };
      return body.fingerprint ?? null;
    },
    /*
     * `false` while the stream is up: no interval, no request, nothing on the
     * wire until something actually happens. The query stays mounted so that
     * losing the connection resumes polling on the next render rather than
     * needing a remount.
     */
    refetchInterval: live ? false : warm ? ACTIVE_MS : IDLE_MS,
    refetchIntervalInBackground: false,
    // Coming back to the tab should show the current state at once rather than
    // after another full interval. `staleTime: 0` because the default of 30 s
    // would swallow exactly that refetch.
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (data === null || data === undefined) return;
    if (data === seen.current) return;
    seen.current = data;
    setLastChange(Date.now());
    refresh();
  }, [data, refresh]);

  /*
   * A refresh re-renders the server component and hands down a new prop. Adopting
   * it keeps the two in step after a change this client made itself — otherwise
   * the value written above and the value the server now reports could differ by
   * one write, and the next poll would fire a second, pointless refresh.
   *
   * It also warms the interval on the way out: sending a reply revalidates the
   * page, so the fingerprint prop changes here without the poll ever having seen
   * it. Somebody who just wrote something is the person most likely to get an
   * answer in the next few seconds.
   */
  const first = useRef(true);
  useEffect(() => {
    seen.current = fingerprint;
    if (first.current) {
      first.current = false;
      return;
    }
    setLastChange(Date.now());
  }, [fingerprint]);

  /*
   * Drop back to the idle rate once the conversation has been quiet long enough.
   *
   * Without this the component sits at `warm === true` until something *else*
   * re-renders it — and since its whole job is to render nothing, that may be
   * never. The one timer costs nothing and is what actually makes the slow rate
   * take effect.
   */
  useEffect(() => {
    if (lastChange === null) return;
    const remaining = WARM_MS - (Date.now() - lastChange);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setLastChange(null), remaining);
    return () => window.clearTimeout(timer);
  }, [lastChange]);

  return null;
}
