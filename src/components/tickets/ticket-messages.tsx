"use client";

import { ArrowDownIcon, SparkleIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatBubble, toneFor } from "@/components/tickets/chat-bubble";
import { MessageActions } from "@/components/tickets/message-actions";
import { Button } from "@/components/ui/button";
import { isSyntheticOpening } from "@/lib/ticket-opening";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The conversation, and nothing else.

   Split out of the old `TicketChat` so the composer can be its *sibling* rather
   than its last child. That is the whole layout fix: as one component the reply
   box lived inside the scroll container and was held down with `sticky bottom-0`,
   which works right up until the browser disagrees about the sticky context — and
   the box then scrolls away with the thread. As siblings in a flex column, only
   this list scrolls and the composer cannot move.

   **Position and colour answer different questions.** Reporter left, team right,
   in both views — that is the speaker, and it is the same for everybody. Grey for
   your own messages, blue for the other side — that is the reader, so it flips
   between the two screens. `side` is decided here rather than inside the bubble;
   see chat-bubble.tsx.

   **One reading order for everybody: oldest first, newest at the bottom.** The
   reporter's view briefly had it reversed so a status check would not need
   scrolling. It is back, on request, and the reason is the stronger one: a chat
   that reads downwards in one place and upwards in the other is two products, and
   the reply box is at the bottom in both — a thread whose newest message is
   furthest from the box you answer in reads backwards while you use it.

   What replaces the reversal is the jump button below: scrolled away from the
   bottom, a new message announces itself instead of silently arriving off-screen.
   ────────────────────────────────────────────────────────────────────────── */

/** How far from the bottom still counts as "reading the newest message". */
const NEAR_BOTTOM_PX = 100;

/**
 * The nearest ancestor that actually scrolls.
 *
 * Walked at the moment it is needed rather than held in a ref, because which
 * element scrolls depends on the viewport: `TicketFrame` only bounds its middle
 * region from `lg` up, and below that the scroll container is the document. A
 * ref captured on mount would be the wrong element after a resize across that
 * breakpoint.
 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

export function TicketMessages({
  comments,
  /**
   * The session id of whoever is looking. Decides grey versus blue, and nothing
   * else — never what is *in* the list. `listCommentsFor` already filtered that
   * on the server, and a client-side id is not a visibility check.
   */
  viewerId,
  /** The ticket these belong to, for the edit and retract actions. */
  ticketId,
  /** `feature_message_editing`, resolved on the server. */
  canEdit = false,
  /** `feature_message_retract`, resolved on the server. */
  canRetract = false,
  /**
   * When this reader last opened the ticket. Anything written after it is marked
   * as new, and a divider is drawn before the first one.
   *
   * `null` means never opened — then nothing is marked, because "everything is
   * new" is the same information as no marking at all and looks like an error.
   */
  seenAt = null,
  /** Shown when there is nothing yet. The two views word it differently. */
  emptyText,
}: {
  comments: TicketComment[];
  viewerId: string;
  ticketId: string;
  canEdit?: boolean;
  canRetract?: boolean;
  seenAt?: string | null;
  emptyText: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  /*
   * Whether the reader is at the bottom, and how many messages have arrived since
   * they were not.
   *
   * The count is what makes the button worth pressing rather than a decoration:
   * "3 neue Nachrichten" is a reason to jump, a bare arrow is a control somebody
   * has to try to find out what it does.
   */
  const [away, setAway] = useState(false);
  const [missed, setMissed] = useState(0);
  const lastCount = useRef(comments.length);

  const jump = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottom.current?.scrollIntoView({ block: "end", behavior });
    setAway(false);
    setMissed(0);
  }, []);

  /*
   * Follow the scroll position of whichever ancestor scrolls.
   *
   * Re-attached when the message count changes, because the container can appear
   * or disappear: a two-message thread does not overflow, so `scrollParent`
   * returns the document until it does. Listening once on mount would bind to the
   * wrong element for the whole session on exactly the threads that grow.
   */
  useEffect(() => {
    const sentinel = bottom.current;
    if (!sentinel) return;
    const container = scrollParent(sentinel);
    if (!container) return;

    const onScroll = () => {
      const distance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const atBottom = distance <= NEAR_BOTTOM_PX;
      setAway(!atBottom);
      // Reaching the bottom is what clears the count — pressing the button is one
      // way to get there, scrolling by hand is the other, and both should count.
      if (atBottom) setMissed(0);
    };

    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [comments.length]);

  /*
   * A new message: follow it if the reader is at the bottom, otherwise count it.
   *
   * The first render is the exception — arriving on a ticket lands on the newest
   * message however long the history is, without animation, because a page that
   * scrolls itself on load looks like it is still loading.
   */
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      lastCount.current = comments.length;
      jump("auto");
      return;
    }

    const added = comments.length - lastCount.current;
    lastCount.current = comments.length;
    if (added <= 0) return;

    if (away) setMissed((count) => count + added);
    else jump();
  }, [comments.length, away, jump]);

  if (comments.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  /*
   * What counts as new, decided once for the whole list.
   *
   * Never the reader's own messages: they were written after the last visit by
   * definition, and marking them would put a "new" badge on the thing the reader
   * just typed.
   */
  const isNew = (comment: TicketComment) =>
    seenAt !== null &&
    comment.author_id !== viewerId &&
    comment.created_at.toISOString() > seenAt;

  const firstNew = comments.findIndex(isNew);
  const newCount = comments.filter(isNew).length;

  return (
    <div className="grid gap-3">
      {comments.map((comment, index) => (
        <div key={comment.id} className="grid gap-3">
          {index === firstNew && <NewDivider count={newCount} />}
          <ChatBubble
            comment={comment}
            tone={toneFor(comment, viewerId)}
            // The speaker, not the reader — see the note above. Derived from
            // `author_is_agent` rather than from the tone, which no longer says
            // anything about who wrote the message.
            side={comment.author_is_agent ? "right" : "left"}
            isNew={isNew(comment)}
            /*
             * Only on your own messages, and never on the opening bubble: that one
             * is derived from the form payload at render time and has no row behind
             * it to edit or remove. Editing it would mean rewriting a stored form
             * answer — the same value the ticket is searched and reported on.
             *
             * The ownership test here decides what is *drawn*. `editComment` and
             * `retractComment` decide again against the stored row, which is the
             * check that counts.
             */
            actions={
              comment.author_id === viewerId && !isSyntheticOpening(comment.id) ? (
                <MessageActions
                  comment={comment}
                  ticketId={ticketId}
                  canEdit={canEdit}
                  canRetract={canRetract}
                />
              ) : undefined
            }
          />
        </div>
      ))}

      <div ref={bottom} />

      {/*
        `sticky bottom-0` inside the scroll container, so it rides along at the
        lower edge of the visible area rather than sitting at the end of a list
        the reader has scrolled away from. Zero-height wrapper: a sticky element
        with its own height would push the last bubble up by that much on every
        thread, whether or not the button is showing.
      */}
      {away && (
        <div className="pointer-events-none sticky bottom-0 h-0 text-center">
          <Button
            type="button"
            size="sm"
            onClick={() => jump()}
            className="pointer-events-auto -translate-y-2 rounded-full bg-inverse-surface px-3 text-xs text-inverse-surface-foreground shadow-elev-3 hover:bg-inverse-surface-hover"
          >
            <ArrowDownIcon className="size-3.5" strokeWidth={1.5} />
            {missed > 0
              ? `${missed} neue ${missed === 1 ? "Nachricht" : "Nachrichten"}`
              : "Zum Ende"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * "Ab hier neu" — one line across the thread.
 *
 * The per-bubble ring says *which* messages are new; this says **where to start
 * reading**, which is the question somebody returning to a ticket with eleven
 * replies actually has. Both, because either alone is worse: rings without a
 * divider make somebody hunt for the first one, a divider without rings loses the
 * marking as soon as it scrolls off.
 */
function NewDivider({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-primary/40" />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <SparkleIcon className="size-3" strokeWidth={1.5} aria-hidden />
        {count === 1 ? "1 neue Nachricht" : `${count} neue Nachrichten`}
      </span>
      <span className="h-px flex-1 bg-primary/40" />
    </div>
  );
}
