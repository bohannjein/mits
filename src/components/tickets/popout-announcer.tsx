"use client";

import { useEffect } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Tells the main window when this pop-out goes away. Renders nothing.

   A window closed from its own title bar fires nothing the opener can listen
   for — `window.closed` has to be polled, and a poll is a second of the main
   window showing a cutout over a conversation that is already back. This closes
   that second: `pagehide` fires on the way out, and the broadcast arrives before
   the window is gone.

   The poll in `DetachedTicketProvider` stays as the fallback for the cases this
   cannot cover: a crashed tab, a killed process, a device that slept. Between
   them, the cutout comes down either immediately or within a second — never not
   at all.

   **Only when there is an opener.** Inside the pinned panel's iframe this page is
   not a window anybody opened, and its unload is a navigation rather than a
   close; announcing then would take down the cutout for a panel that is still
   sitting there.
   ────────────────────────────────────────────────────────────────────────── */

const CHANNEL = "mits-detached-ticket";

export function PopoutAnnouncer({ ticketId }: { ticketId: string }) {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    // `window.opener` is set for `window.open` and null inside an iframe, which
    // is exactly the distinction that matters here.
    if (!window.opener) return;

    const bus = new BroadcastChannel(CHANNEL);

    const announce = () => {
      bus.postMessage({ type: "closed", ticketId });
    };

    /*
     * `pagehide` rather than `beforeunload`: the latter is throttled, sometimes
     * ignored without a user gesture, and on mobile browsers frequently never
     * fires at all. `pagehide` is the one event that is guaranteed on the way out.
     */
    window.addEventListener("pagehide", announce);

    return () => {
      window.removeEventListener("pagehide", announce);
      bus.close();
    };
  }, [ticketId]);

  return null;
}
