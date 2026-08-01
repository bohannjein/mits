"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   One refresh per burst, never more than one in flight.

   `router.refresh()` is not cheap. It re-runs the server component tree for the
   whole page: on the queue that is a count, a page of tickets and five tab
   counters — seven queries against a synchronous SQLite driver, which blocks the
   event loop for everybody while it runs.

   Calling it straight from a realtime signal was fine with three agents and is a
   stampede with a hundred. Every comment anybody writes publishes a `queue`
   signal to every connected member of staff, and each of them answered it with a
   full re-render. Ten messages a second across a busy desk becomes ten full
   renders a second **per open tab** — the server spends its time redrawing lists
   nobody has finished reading.

   Messengers solve this the same way: a burst of arrivals is one update, and the
   client never has more than one request outstanding. Two rules do it:

   - **A trailing window.** Signals inside `waitMs` collapse into one refresh at
     the end of it, so a conversation in flow costs one render per window rather
     than one per message.
   - **No overlap.** A signal arriving while a refresh is still running is
     remembered, not issued; the pending one fires when the first completes. Under
     sustained load the client degrades to "as fast as the server can answer"
     instead of queueing work the server has not got to yet.
   ────────────────────────────────────────────────────────────────────────── */

export function useCoalescedRefresh(waitMs: number): () => void {
  const router = useRouter();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef(false);

  const run = useCallback(() => {
    inFlight.current = true;
    router.refresh();

    /*
     * `router.refresh()` returns void and gives no completion signal, so the
     * "still running" window is assumed rather than observed. It only has to be
     * long enough that two refreshes do not overlap on a healthy request; if the
     * guess is short the worst case is the behaviour this replaces, and if it is
     * long the worst case is one extra window of staleness.
     */
    window.setTimeout(() => {
      inFlight.current = false;
      if (!pending.current) return;
      pending.current = false;
      run();
    }, waitMs);
  }, [router, waitMs]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(() => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, waitMs);
  }, [run, waitMs]);
}
