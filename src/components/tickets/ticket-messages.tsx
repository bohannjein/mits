"use client";

import { SparkleIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { ChatBubble, toneFor } from "@/components/tickets/chat-bubble";
import { MessageActions } from "@/components/tickets/message-actions";
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

   **Two reading orders.** The agent view is a chat and reads oldest-first with the
   newest at the bottom, next to the reply box. The reporter view is a status
   check: somebody opens their own ticket to find out whether anybody answered, and
   making them scroll a long thread to find out is the wrong answer to the only
   question they came with. There the newest is on top.
   ────────────────────────────────────────────────────────────────────────── */

/** How far from the edge still counts as "reading the newest message". */
const NEAR_EDGE_PX = 100;

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
  /**
   * `"newest-last"` is the chat order, `"newest-first"` the status-check order.
   * A prop rather than two components: everything else about the list is the same,
   * and two copies would be two places to fix the next scroll bug in.
   */
  order = "newest-last",
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
  order?: "newest-last" | "newest-first";
  seenAt?: string | null;
  emptyText: string;
}) {
  const edge = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const newestFirst = order === "newest-first";

  /*
   * Jump to wherever the newest message is: the bottom in chat order, the top in
   * status-check order.
   *
   * `scrollIntoView` on a sentinel rather than setting `scrollTop` on the
   * container, because the scroll container is an ancestor this component does
   * not own — the frame does. The sentinel works whichever ancestor turns out to
   * be scrollable.
   *
   * **Only when the reader is already there**, which matters now that messages
   * arrive on their own. Scrolling unconditionally was harmless while the list
   * only changed on navigation; with a live thread it yanks somebody out of the
   * message they scrolled away to read, every time the other side says anything.
   * The first render is the exception — arriving on a ticket should land on the
   * newest message however long the history is.
   */
  useEffect(() => {
    const sentinel = edge.current;
    if (!sentinel) return;

    if (!mounted.current) {
      mounted.current = true;
      sentinel.scrollIntoView({ block: newestFirst ? "start" : "end" });
      return;
    }

    const container = scrollParent(sentinel);
    if (!container) return;

    // A hundred pixels of slack: "at the edge" has to survive the half-line of
    // scroll a trackpad leaves behind, or the auto-scroll stops working for
    // anybody who nudged the wheel once.
    const distance = newestFirst
      ? container.scrollTop
      : container.scrollHeight - container.scrollTop - container.clientHeight;

    if (distance <= NEAR_EDGE_PX) {
      sentinel.scrollIntoView({
        block: newestFirst ? "start" : "end",
        behavior: "smooth",
      });
    }
  }, [comments.length, newestFirst]);

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
   * just typed. The divider then goes before the *first* of them in reading order,
   * which is a different element depending on the order — hence the index rather
   * than a per-bubble comparison.
   */
  const isNew = (comment: TicketComment) =>
    seenAt !== null &&
    comment.author_id !== viewerId &&
    comment.created_at.toISOString() > seenAt;

  const ordered = newestFirst ? [...comments].reverse() : comments;
  const firstNew = ordered.findIndex(isNew);
  const newCount = ordered.filter(isNew).length;

  const list = ordered.map((comment, index) => (
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
         * Only on your own messages, and never on the opening bubble: that one is
         * derived from the form payload at render time and has no row behind it to
         * edit or remove. Editing it would mean rewriting a stored form answer —
         * the same value the ticket is searched and reported on.
         *
         * The ownership test here decides what is *drawn*. `editComment` and
         * `retractComment` decide again against the stored row, which is the check
         * that counts.
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
  ));

  return (
    <div className="grid gap-3">
      {/* The sentinel sits at whichever end holds the newest message, so one
          effect serves both orders. */}
      {newestFirst && <div ref={edge} />}
      {list}
      {!newestFirst && <div ref={edge} />}
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
