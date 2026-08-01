"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
 * Two rates, and which one applies depends on whether anything is happening.
 *
 * A fixed eight seconds was the first version and it was wrong at both ends: too
 * slow to read as a chat while two people are typing at each other, and a
 * pointless request every eight seconds on the forty tickets somebody left open
 * in tabs last Tuesday.
 *
 * So: two and a half seconds while the conversation is warm, twelve once it has
 * gone quiet. The fast rate is the one that matters — during an exchange a reply
 * lands in about the time it takes to look up from the keyboard — and it only
 * ever applies to a ticket that changed in the last couple of minutes, which is
 * a small number of tickets at any moment.
 *
 * Not configurable, and not the same knob as `AutoRefresh`. That one is a
 * whole-page interval in minutes, set per account. Exposing this one would invite
 * somebody to set it to five minutes and then report that the chat is broken.
 */
const ACTIVE_MS = 2500;
const IDLE_MS = 12_000;

/** How long after the last change the conversation still counts as warm. */
const WARM_MS = 120_000;

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

  /*
   * When the fingerprint last moved, for the two-rate interval below.
   *
   * State rather than a ref, because the interval has to *re-arm* when it
   * changes — a ref would keep whichever rate was in force when the query was
   * created, and the poll would still be crawling at twelve seconds through the
   * exchange it was supposed to speed up for.
   *
   * `null` until something happens, so opening an old ticket starts at the idle
   * rate instead of polling hard at a conversation that ended in March.
   */
  const [lastChange, setLastChange] = useState<number | null>(null);
  const warm = lastChange !== null && Date.now() - lastChange < WARM_MS;

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
    refetchInterval: warm ? ACTIVE_MS : IDLE_MS,
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
    router.refresh();
  }, [data, router]);

  /*
   * A refresh re-renders the server component and hands down a new prop. Adopting
   * it keeps the two in step after a change this client made itself — otherwise
   * the value written above and the value the server now reports could differ by
   * one write, and the next poll would fire a second, pointless refresh.
   *
   * It also warms the interval on the way out: sending a reply revalidates the
   * page, so the fingerprint prop changes here without the poll ever having seen
   * it. Somebody who just wrote something is the person most likely to get an
   * answer in the next few seconds, and that is exactly when the fast rate should
   * already be running rather than waiting for the reply to arrive slowly first.
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
