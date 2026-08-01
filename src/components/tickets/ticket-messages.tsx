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

   Reporter left, team right, in both views. `side` is decided here rather than
   inside the bubble; see chat-bubble.tsx.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketMessages({
  comments,
  /** Shown when there is nothing yet. The two views word it differently. */
  emptyText,
}: {
  comments: TicketComment[];
  emptyText: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  /*
   * A conversation reads bottom-up: the newest message is the one being answered.
   *
   * `scrollIntoView` on a sentinel rather than setting `scrollTop` on the
   * container, because the scroll container is now an ancestor this component
   * does not own — the frame does. The sentinel works whichever ancestor turns
   * out to be scrollable.
   */
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
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
      {comments.map((comment) => {
        const tone = toneFor(comment);
        return (
          <ChatBubble
            key={comment.id}
            comment={comment}
            tone={tone}
            side={tone === "customer" ? "left" : "right"}
          />
        );
      })}
      <div ref={bottom} />
    </div>
  );
}
