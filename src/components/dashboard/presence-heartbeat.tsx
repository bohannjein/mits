"use client";

import { useEffect } from "react";

import { PRESENCE_IDLE_AFTER_SECONDS } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Presence heartbeat.

   Renders nothing. Sits in the header for staff, so every page they open counts
   as a sign of life without the page having to know about presence.

   The roadmap said to avoid a poll timer, and there is a real interval here — but
   it only runs while the tab is visible, and without it an agent writing a long
   reply on one page would drop to idle after five minutes while actually working.
   A hidden tab stops beating, which is the point: idle should mean idle.

   The rate is half the idle threshold, so one dropped request cannot flip the
   state on its own. Roughly thirty requests an hour per open staff tab, each one
   a 204 with no body.
   ────────────────────────────────────────────────────────────────────────── */

const INTERVAL_MS = (PRESENCE_IDLE_AFTER_SECONDS / 2) * 1000;

export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    const beat = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      // Fire and forget: a failed heartbeat means the state ages out on its own,
      // which is the correct outcome and not worth surfacing.
      void fetch("/api/presence", { method: "POST", keepalive: true }).catch(
        () => {},
      );
    };

    beat();
    const timer = window.setInterval(beat, INTERVAL_MS);
    // Coming back to the tab should update immediately rather than waiting out
    // the interval.
    document.addEventListener("visibilitychange", beat);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}
