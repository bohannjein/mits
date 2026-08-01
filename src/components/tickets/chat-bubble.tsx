"use client";

import { LockIcon } from "lucide-react";

import { RelativeTime } from "@/components/layout/relative-time";
import { CommentBody } from "@/components/tickets/comment-body";
import { cn } from "@/lib/utils";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   One message in a ticket conversation.

   Two independent axes, deliberately not collapsed into one:

   - **tone** is *who spoke* — reporter, agent, or an internal note. It picks the
     surface and the role label.
   - **side** is *where the reader sits*. In the agent view the reporter is on the
     left and the team on the right; in the reporter's own view their messages are
     on the right, because that is what every messenger does and a thread where
     your own words arrive on the left reads like somebody else's inbox.

   Collapsing the two into `author_is_agent` would have hard-coded the agent's
   perspective into the shared component, and the reporter's page would either get
   its own copy of the bubble or the wrong layout.

   Internal notes are additionally inset and dashed. That is a courtesy to the
   agent, not the access control: `listCommentsFor` filters them out of a
   reporter's query in SQL, so this component is never handed one to render.
   ────────────────────────────────────────────────────────────────────────── */

export type BubbleTone = "customer" | "agent" | "internal";

/**
 * Surface, border and label per speaker. All four colours come from tokens in
 * `globals.css` and follow the theme; the text is plain `--foreground` in every
 * case, so no bubble can hover or switch theme into an unreadable pair.
 */
const TONES: Record<
  BubbleTone,
  { bubble: string; label: string; chip: string; avatar: string }
> = {
  customer: {
    bubble: "border-bubble-customer-border bg-bubble-customer",
    label: "Kunde",
    chip: "bg-surface-elevated text-muted-foreground",
    avatar: "bg-surface-elevated text-foreground",
  },
  agent: {
    bubble: "border-bubble-agent-border bg-bubble-agent",
    label: "Agent",
    chip: "bg-bubble-agent-accent/15 text-bubble-agent-accent",
    avatar: "bg-bubble-agent-accent/15 text-bubble-agent-accent",
  },
  internal: {
    bubble: "border-dashed border-bubble-internal-border bg-bubble-internal",
    label: "Interne Notiz",
    chip: "bg-bubble-internal-accent/15 text-bubble-internal-accent",
    avatar: "bg-bubble-internal-accent/15 text-bubble-internal-accent",
  },
};

/**
 * Up to two letters from a display name.
 *
 * Falls back to the first character of whatever the string starts with, so a name
 * that is only an address still produces something rather than an empty circle.
 * Not a shadcn primitive on purpose — this is a styled `span`, the same
 * `rounded-full bg-surface-elevated` composition the design system already
 * prescribes for icons in cards, not a control with behaviour.
 */
function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s.@_-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ChatBubble({
  comment,
  tone,
  side,
}: {
  comment: TicketComment;
  tone: BubbleTone;
  side: "left" | "right";
}) {
  const style = TONES[tone];

  return (
    <article
      className={cn(
        "max-w-[85%] rounded-2xl border px-4 py-3 shadow-elev-1",
        side === "right"
          ? "justify-self-end rounded-br-md"
          : "justify-self-start rounded-bl-md",
        // Inset rather than a different width: an internal note sits inside the
        // same conversation and should read as an aside to it, not as a third
        // participant with its own column.
        tone === "internal" && "max-w-[80%] sm:ml-10",
        style.bubble,
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-medium",
            style.avatar,
          )}
        >
          {initials(comment.author_name)}
        </span>
        <span className="text-sm font-medium">{comment.author_name}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-normal",
            style.chip,
          )}
        >
          {tone === "internal" && (
            <LockIcon className="size-3" strokeWidth={1.5} aria-hidden />
          )}
          {style.label}
        </span>
        {/* Relative, with the exact instant in the tooltip — see RelativeTime. */}
        <RelativeTime
          date={comment.created_at}
          className="ml-auto text-[11px] text-muted-foreground"
        />
      </header>
      <CommentBody comment={comment} />
    </article>
  );
}

/**
 * Which surface a stored comment gets.
 *
 * Read off the row rather than passed in, so the two views cannot disagree about
 * what an internal note looks like. `visibility` wins over `author_is_agent`: an
 * internal note is always written by staff, and showing it in the agent surface
 * would drop the one visual signal that says "this does not go to the reporter".
 */
export function toneFor(comment: TicketComment): BubbleTone {
  if (comment.visibility === "internal") return "internal";
  return comment.author_is_agent ? "agent" : "customer";
}
