"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useToast } from "@/components/feedback/toast";

/* ──────────────────────────────────────────────────────────────────────────
   Turns the notification feed into toasts.

   Renders nothing. Placed in the header so every page participates without each
   one having to know about notifications — the same arrangement `PresenceHeartbeat`
   uses, and for the same reason.

   **`since` advances only on a successful response.** Holding it in a ref that the
   effect writes after the data arrives means a failed poll re-asks for the same
   window rather than skipping it; advancing the cursor on the request would drop
   every event that happened during an outage, and nothing would ever say so.
   ────────────────────────────────────────────────────────────────────────── */

interface FeedItem {
  key: string;
  kind: "reply" | "ticket" | "assigned";
  title: string;
  description: string;
  href: string;
  createdAt: string;
}

/**
 * How often to ask.
 *
 * Twenty seconds is a compromise, stated so nobody has to guess: fast enough that
 * "a reply came in" feels live, slow enough that a room of ten agents costs the
 * SQLite file thirty reads a minute rather than six hundred. The tab has to be
 * visible — a background tab polling is pure cost, and its owner is not looking.
 */
const POLL_MS = 20_000;

export function NotificationWatcher() {
  // Mount time, so the first poll never replays the backlog. Somebody opening a
  // page should not be greeted by four toasts about things from before lunch.
  const since = useRef(new Date().toISOString());
  const { toast } = useToast();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<FeedItem[]> => {
      const response = await fetch(
        `/api/notifications?since=${encodeURIComponent(since.current)}`,
        { cache: "no-store" },
      );
      // A 401 after a session expires must not turn into a toast loop; the empty
      // list keeps the cursor where it is and the next page load redirects.
      if (!response.ok) return [];
      const body = (await response.json()) as { notifications?: FeedItem[] };
      return body.notifications ?? [];
    },
    refetchInterval: POLL_MS,
    // Off in a hidden tab. TanStack pauses the interval, and the cursor stays
    // put — so the events that arrived meanwhile show up on the first poll after
    // the tab comes back rather than being lost.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Retries would stack requests against an instance that is already struggling;
    // the next interval is the retry.
    retry: false,
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

    for (const item of data) {
      toast({
        key: item.key,
        kind: item.kind,
        tone: item.kind === "assigned" ? "success" : "info",
        title: item.title,
        description: item.description,
        href: item.href,
      });
    }

    /*
     * Advance past the newest event we just showed, not to "now".
     *
     * `Date.now()` here would skip anything written between the server building
     * this response and the client processing it — a narrow window, but one that
     * silently drops a reply and leaves no trace that it did.
     */
    const newest = data.reduce(
      (latest, item) => (item.createdAt > latest ? item.createdAt : latest),
      since.current,
    );
    since.current = newest;
  }, [data, toast]);

  return null;
}
