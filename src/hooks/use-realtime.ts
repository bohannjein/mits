"use client";

import { useEffect } from "react";

import {
  useRealtime,
  type RealtimeSignal,
  type RealtimeStatus,
} from "@/components/providers/realtime-provider";

/* ──────────────────────────────────────────────────────────────────────────
   The three things a component wants from the stream.

   Thin on purpose. The connection, the backoff and the subscription bookkeeping
   live in the provider; this file exists so a page does not have to know that,
   and so `useRealtimeTicket("abc")` reads as a declaration rather than as an
   effect somebody has to get the dependency array right for.
   ────────────────────────────────────────────────────────────────────────── */

/** `live` when the stream is open, `polling` when the fallback should run. */
export function useRealtimeStatus(): RealtimeStatus {
  return useRealtime().status;
}

/**
 * Declare which ticket this page is looking at.
 *
 * The provider reconnects with the id, and the server authorises it once. Pass
 * `null` to declare nothing — the hook still has to be called unconditionally,
 * which is why it takes a nullable rather than being called conditionally.
 */
export function useRealtimeTicket(ticketId: string | null): void {
  const { watchTicket } = useRealtime();

  useEffect(() => {
    if (!ticketId) return;
    return watchTicket(ticketId);
  }, [ticketId, watchTicket]);
}

/**
 * Run something when a signal arrives.
 *
 * `handler` is read through a ref inside the provider's map, so an inline arrow
 * is fine — but it *is* in the dependency array, so a handler that closes over
 * changing state should be wrapped in `useCallback` by the caller. Doing it here
 * with a ref would silently pin the first closure, and a listener that acts on
 * last week's state is harder to find than a re-subscription.
 */
export function useRealtimeSignal(
  signal: RealtimeSignal,
  handler: (ticketId: string | null) => void,
): void {
  const { on } = useRealtime();

  useEffect(() => on(signal, handler), [on, signal, handler]);
}
