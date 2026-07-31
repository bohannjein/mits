"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Periodic refresh. Renders nothing.

   The interval arrives as a prop, resolved on the server: the instance-wide value
   for reporters, the agent's own override for staff. Nothing is read from or written
   to the browser here — the setting belongs to the account, so it lives in the
   database and is edited in the settings, not in a header dropdown.

   `router.refresh()` rather than a reload: it re-runs the server components and swaps
   in the new RSC payload, so client state survives — an open dialog stays open, a
   half-typed reply stays typed, the scroll position holds.

   Three things do more for the cost than the interval does:

   - **A hidden tab does not poll.** A queue left on a second monitor would otherwise
     refresh all day for nobody. The timer stops on `visibilitychange` and, if a tick
     was missed while away, refreshes once on return — so coming back shows current
     data immediately rather than after another full interval.
   - **Offline does not poll.** A failed refresh is not a cheaper refresh.
   - **A tick arriving while a refresh is in flight is dropped, not queued.** On a slow
     connection a short interval would otherwise stack requests faster than they
     complete.
   ────────────────────────────────────────────────────────────────────────── */

/** How long a refresh is assumed to take, for the in-flight guard. */
const ASSUMED_REFRESH_MS = 600;

export function AutoRefresh({ minutes }: { minutes: number }) {
  const router = useRouter();

  useEffect(() => {
    if (minutes <= 0) return;

    const period = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let lastRun = Date.now();

    const run = () => {
      lastRun = Date.now();
      inFlight = true;
      router.refresh();
      setTimeout(() => {
        inFlight = false;
      }, ASSUMED_REFRESH_MS);
    };

    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, Math.max(1000, delay));
    };

    const tick = () => {
      if (document.hidden || !navigator.onLine || inFlight) {
        // Not skipped forever — re-armed for one more period, and the visibility
        // handler below catches up the moment the tab comes back.
        schedule(period);
        return;
      }
      run();
      schedule(period);
    };

    const onVisible = () => {
      if (document.hidden) {
        clearTimeout(timer);
        return;
      }
      // A tab that was away longer than the interval is stale, so it refreshes at
      // once rather than showing old data for another full period.
      const elapsed = Date.now() - lastRun;
      if (elapsed >= period) {
        run();
        schedule(period);
      } else {
        schedule(period - elapsed);
      }
    };

    schedule(period);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [minutes, router]);

  return null;
}
