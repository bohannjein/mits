"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Makes the ticket page live. Renders nothing.

   The conversation used to be as static as any other server-rendered list: a
   reply from the other side appeared when `AutoRefresh` came round, which is
   every three minutes by default and never faster than one. That is a correct
   page and a broken chat — the whole point of two people typing at each other is
   that the second one sees the first one's message.

   **It polls a fingerprint, not the messages.** `/api/tickets/[id]/activity`
   answers with one short string; when it differs from the one held here the
   component calls `router.refresh()` and the new bubbles arrive through the
   page's ordinary server render. Two consequences worth having:

   - The ninety-nine ticks where nothing happened cost one indexed count each,
     not a copy of the conversation.
   - There is still exactly **one** place that decides what a reader may see.
     Fetching comments here would have put the internal-note rule in a second
     file, and a rule that lives in two files is a rule that will disagree with
     itself.

   `router.refresh()` rather than a reload: it swaps the RSC payload and leaves
   client state alone, so a half-typed reply survives the message that arrives
   while it is being written. That matters more here than anywhere else in MITS.

   The interval is short enough to feel like a chat and the request is small
   enough to afford it. A hidden tab does not poll — TanStack pauses the timer —
   and the cursor is held in a ref rather than in state, so a tick that finds
   nothing new does not re-render anything at all.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * How often to ask.
 *
 * Eight seconds, and the number is a judgement rather than a measurement: below
 * about five a conversation stops feeling turn-based and starts feeling
 * instantaneous, but every open ticket page in the building is a request at this
 * rate against one SQLite file. Eight is the slowest value that still reads as
 * live when somebody is waiting for an answer.
 *
 * This is not the same knob as `AutoRefresh`. That one is a whole-page interval
 * measured in minutes and set per account; this is the ticket conversation, and
 * making it configurable would invite somebody to set it to five minutes and
 * then report that the chat is broken.
 */
const POLL_MS = 8000;

export function TicketLive({
  ticketId,
  /** The fingerprint as of this render, so the first poll has something to differ from. */
  fingerprint,
}: {
  ticketId: string;
  fingerprint: string;
}) {
  const router = useRouter();

  /*
   * Seeded from the server render and advanced only after a refresh has been
   * asked for. In a ref rather than in state: writing it must not itself cause a
   * render, or every tick would re-render a component whose entire job is to
   * render nothing.
   */
  const seen = useRef(fingerprint);

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
    refetchInterval: POLL_MS,
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
    router.refresh();
  }, [data, router]);

  /*
   * A refresh re-renders the server component and hands down a new prop. Adopting
   * it keeps the two in step after a change this client made itself — otherwise
   * the value written above and the value the server now reports could differ by
   * one write, and the next poll would fire a second, pointless refresh.
   */
  useEffect(() => {
    seen.current = fingerprint;
  }, [fingerprint]);

  return null;
}
