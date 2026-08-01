"use client";

import { useEffect, useRef } from "react";

import { ChatBubble, toneFor } from "@/components/tickets/chat-bubble";
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
  /** Shown when there is nothing yet. The two views word it differently. */
  emptyText,
}: {
  comments: TicketComment[];
  viewerId: string;
  emptyText: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  /*
   * A conversation reads bottom-up: the newest message is the one being answered.
   *
   * `scrollIntoView` on a sentinel rather than setting `scrollTop` on the
   * container, because the scroll container is an ancestor this component does
   * not own — the frame does. The sentinel works whichever ancestor turns out to
   * be scrollable.
   *
   * **Only when the reader is already at the bottom**, which matters now that
   * messages arrive on their own. Scrolling unconditionally was harmless while
   * the list only changed on navigation; with a live thread it yanks somebody out
   * of the message they scrolled up to read, every time the other side says
   * anything. The one exception is the first render — arriving on a ticket should
   * land on the newest message however long the history is.
   */
  useEffect(() => {
    const sentinel = bottom.current;
    if (!sentinel) return;

    if (!mounted.current) {
      mounted.current = true;
      sentinel.scrollIntoView({ block: "end" });
      return;
    }

    const container = scrollParent(sentinel);
    if (!container) return;

    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // A hundred pixels of slack: "at the bottom" has to survive the half-line of
    // scroll a trackpad leaves behind, or the auto-scroll stops working for
    // anybody who nudged the wheel once.
    if (distance <= NEAR_BOTTOM_PX) {
      sentinel.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [comments.length]);

  if (comments.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {comments.map((comment) => (
        <ChatBubble
          key={comment.id}
          comment={comment}
          tone={toneFor(comment, viewerId)}
          // The speaker, not the reader — see the note above. Derived from
          // `author_is_agent` rather than from the tone, which no longer says
          // anything about who wrote the message.
          side={comment.author_is_agent ? "right" : "left"}
        />
      ))}
      <div ref={bottom} />
    </div>
  );
}
