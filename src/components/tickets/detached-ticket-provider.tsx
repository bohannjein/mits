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

/* ──────────────────────────────────────────────────────────────────────────
   Which ticket is currently detached, and where to.

   Two ways out of the main window and one piece of state describing both:

   - `popout` — a real browser window from `window.open`.
   - `floating` — a panel pinned inside this tab.

   **One at a time, deliberately.** Two detached copies of the same conversation
   means two reply boxes, and the second one is always the stale one somebody
   types into. Detaching again replaces rather than adds.

   **The pop-out is tracked across tabs, not only in this one.** A `BroadcastChannel`
   carries the open and the close, so a second tab showing the same ticket draws
   the cutout too. Without it, opening a pop-out from one tab would leave the other
   showing a live conversation that nobody is reading — and a reply typed there
   would land in a window the person is not looking at.

   The channel is not a data path: it carries a ticket id and a mode, nothing else.
   Anything a reader may see still comes from the server on the other side.
   ────────────────────────────────────────────────────────────────────────── */

export type DetachMode = "popout" | "floating";

export interface DetachedTicket {
  ticketId: string;
  /** Shown on the cutout card, so it names the ticket rather than an id. */
  label: string;
  mode: DetachMode;
}

interface DetachApi {
  detached: DetachedTicket | null;
  detach: (ticket: { ticketId: string; label: string }, mode: DetachMode) => void;
  /** Bring it back: closes the window or the panel and restores the main view. */
  reattach: () => void;
  /** Raise the pop-out. Does nothing for a floating panel, which is already here. */
  focusDetached: () => void;
}

const DetachContext = createContext<DetachApi | null>(null);

/** A no-op outside the provider — the reporter's view mounts without one. */
const INERT: DetachApi = {
  detached: null,
  detach: () => {},
  reattach: () => {},
  focusDetached: () => {},
};

export function useDetachedTicket(): DetachApi {
  return useContext(DetachContext) ?? INERT;
}

/** Named so a second instance in another tab talks to this one. */
const CHANNEL = "mits-detached-ticket";

/**
 * How often the opener checks whether its pop-out is still there.
 *
 * `window.closed` is the only reliable signal: a window closed with the title bar
 * fires nothing the opener can subscribe to. The pop-out does announce its own
 * unload over the channel, and this is the fallback for the case where it cannot
 * — a crashed tab, a browser that killed it, a device that slept.
 */
const CLOSED_POLL_MS = 1000;

/** The pop-out's own size. Chat-shaped, not page-shaped. */
const POPOUT_FEATURES = "width=520,height=760,menubar=no,toolbar=no,location=no";

export function DetachedTicketProvider({ children }: { children: ReactNode }) {
  const [detached, setDetached] = useState<DetachedTicket | null>(null);
  const popout = useRef<Window | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const bus = new BroadcastChannel(CHANNEL);
    channel.current = bus;

    bus.onmessage = (event: MessageEvent) => {
      const message = event.data as
        | { type: "opened"; ticket: DetachedTicket }
        | { type: "closed"; ticketId: string }
        | null;
      if (!message) return;

      if (message.type === "opened") {
        // Another tab detached it. This one has no window handle to hold, only
        // the knowledge that the conversation lives elsewhere now.
        setDetached(message.ticket);
        return;
      }
      setDetached((current) =>
        current?.ticketId === message.ticketId ? null : current,
      );
    };

    return () => {
      bus.close();
      channel.current = null;
    };
  }, []);

  /*
   * A window closed from its own title bar tells the opener nothing. The pop-out
   * posts a `closed` message on unload, and this poll is what covers the times it
   * cannot — otherwise the main window would draw the cutout forever over a
   * conversation nobody can reach.
   */
  useEffect(() => {
    if (detached?.mode !== "popout") return;

    const timer = window.setInterval(() => {
      if (popout.current && popout.current.closed) {
        popout.current = null;
        setDetached(null);
      }
    }, CLOSED_POLL_MS);

    return () => window.clearInterval(timer);
  }, [detached?.mode]);

  const detach = useCallback(
    (ticket: { ticketId: string; label: string }, mode: DetachMode) => {
      const next: DetachedTicket = { ...ticket, mode };

      if (mode === "popout") {
        const handle = window.open(
          `/mits/tickets/${ticket.ticketId}/popout`,
          // Named per ticket: pressing the button twice raises the window that is
          // already open instead of opening a second one onto the same thread.
          `mits-ticket-${ticket.ticketId}`,
          POPOUT_FEATURES,
        );
        // Blocked by the browser. Say nothing and change nothing — drawing the
        // cutout over a window that never opened would hide the conversation
        // behind a card pointing at nothing.
        if (!handle) return;
        popout.current = handle;
        handle.focus();
      } else {
        popout.current = null;
      }

      setDetached(next);
      channel.current?.postMessage({ type: "opened", ticket: next });
    },
    [],
  );

  const reattach = useCallback(() => {
    const current = detached;
    popout.current?.close();
    popout.current = null;
    setDetached(null);
    if (current) {
      channel.current?.postMessage({ type: "closed", ticketId: current.ticketId });
    }
  }, [detached]);

  const focusDetached = useCallback(() => {
    popout.current?.focus();
  }, []);

  const api = useMemo<DetachApi>(
    () => ({ detached, detach, reattach, focusDetached }),
    [detached, detach, reattach, focusDetached],
  );

  return (
    <DetachContext.Provider value={api}>{children}</DetachContext.Provider>
  );
}
