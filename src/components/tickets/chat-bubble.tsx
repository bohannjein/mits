"use client";

import { LockIcon, PencilIcon } from "lucide-react";
import type { ReactNode } from "react";

import { RelativeTime } from "@/components/layout/relative-time";
import { CommentBody } from "@/components/tickets/comment-body";
import { cn } from "@/lib/utils";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   One message in a ticket conversation.

   Two independent axes, deliberately not collapsed into one:

   - **tone** is *whose message it is, from where you are standing* — grey for
     your own, blue for the other side, amber for an internal note. It picks the
     surface and the role label.
   - **side** is *where the bubble sits*: reporter left, team right, in both
     views.

   The two axes answer different questions on purpose, and it is worth being
   clear about why they do not agree.

   **Position is absolute, colour is relative.** The same thread has the same
   shape for everybody — a screenshot from the reporter lines up with one from
   the agent, and "die Bubble links" stays a location rather than something that
   depends on who is reading. What flips between the two screens is only the
   colour: on the agent's screen their own replies are grey and the reporter's
   are blue, on the reporter's screen it is the other way round. Position tells
   you *who*, colour tells you *whether it was you*.

   An earlier version keyed the colour to the speaker as well, so a reporter's
   message was grey to everybody. That is defensible and it is what was here
   before; it was changed on request, because the thing a person scanning a
   conversation looks for first is which half of it they wrote.

   Both axes stay props. Deriving either from `author_is_agent` inside this file
   would bake one perspective into the one component that must not hold an
   opinion about perspective.

   Internal notes are additionally inset and dashed. That is a courtesy to the
   agent, not the access control: `listCommentsFor` filters them out of a
   reporter's query in SQL, so this component is never handed one to render.
   ────────────────────────────────────────────────────────────────────────── */

export type BubbleTone = "own" | "other" | "internal";

/**
 * Surface and border per tone. All colours come from tokens in `globals.css` and
 * follow the theme; the text is plain `--foreground` in every case, so no bubble
 * can hover or switch theme into an unreadable pair.
 *
 * No `label` here any more. The chip used to read "Kunde" or "Agent", which was
 * a property of the speaker — and the tone is no longer about the speaker. The
 * role label is passed in instead, so "Team" stays "Team" whether the bubble is
 * grey or blue.
 */
const TONES: Record<BubbleTone, { bubble: string; chip: string; avatar: string }> = {
  own: {
    bubble: "border-bubble-own-border bg-bubble-own",
    chip: "bg-surface-elevated text-muted-foreground",
    avatar: "bg-surface-elevated text-foreground",
  },
  other: {
    bubble: "border-bubble-other-border bg-bubble-other",
    chip: "bg-bubble-other-accent/15 text-bubble-other-accent",
    avatar: "bg-bubble-other-accent/15 text-bubble-other-accent",
  },
  internal: {
    bubble: "border-dashed border-bubble-internal-border bg-bubble-internal",
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
  /** Arrived since this reader last opened the ticket. */
  isNew = false,
  /**
   * Rendered under the body. The bubble does not decide whether they apply —
   * `TicketMessages` does, because ownership and the module switches are its
   * props, and a component that draws one message should not be reading feature
   * flags.
   */
  actions,
}: {
  comment: TicketComment;
  tone: BubbleTone;
  side: "left" | "right";
  isNew?: boolean;
  actions?: ReactNode;
}) {
  const style = TONES[tone];
  const label = roleLabel(comment);

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
        /*
         * A ring rather than a different surface for an unread message.
         *
         * The surface already carries who wrote it, and overloading it with "and
         * it is new" would need three more tokens and would stop working the
         * moment the message is read. A ring sits outside the box, is legible on
         * all three surfaces in both themes, and disappears cleanly on the next
         * visit without anything underneath it having changed.
         */
        isNew && "ring-2 ring-primary/45",
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
          {label}
        </span>
        {/* Relative, with the exact instant in the tooltip — see RelativeTime. */}
        {/*
          The edit marker sits next to the time, not inside the body.
          A message whose text changed after somebody replied to it is a different
          message, and the person reading the reply has to be able to tell — the
          alternative is a thread that silently disagrees with itself.
        */}
        {comment.edited_at && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            title={`Bearbeitet: ${comment.edited_at.toLocaleString("de-DE")}`}
          >
            <PencilIcon className="size-3" strokeWidth={1.5} aria-hidden />
            bearbeitet
          </span>
        )}
        <RelativeTime
          date={comment.created_at}
          className="ml-auto text-[11px] text-muted-foreground"
        />
      </header>
      <CommentBody comment={comment} />
      {actions}
    </article>
  );
}

/**
 * Who wrote it, independent of the surface it is painted on.
 *
 * Split out of `TONES` when the surfaces became viewer-relative: the colour now
 * answers "was this me", and the chip still has to answer "who was it". Merging
 * them again would label an agent's own reply "Kunde" on their own screen,
 * because that is the grey one.
 */
function roleLabel(comment: TicketComment): string {
  if (comment.visibility === "internal") return "Interne Notiz";
  return comment.author_is_agent ? "Team" : "Melder";
}

/**
 * Which surface a stored comment gets, **for this reader**.
 *
 * `visibility` wins over authorship: an internal note is always written by staff,
 * and painting the author's own note grey like any other message of theirs would
 * drop the one visual signal that says "this does not go to the reporter". That
 * is why the amber is the exception to the own/other rule rather than a third
 * speaker colour.
 *
 * `viewerId` is the session id, passed down from the page. Compared against
 * `author_id` rather than against `author_is_agent`, so two agents on one ticket
 * see each other in blue instead of both being "the team" and both grey. The one
 * case where the two diverge on purpose is a mailed-in reply: `author_id` is the
 * account that performed the write, which for a fallback mailbox is not the human
 * whose name is on the bubble — the surface follows the account, and the name
 * beside it still says who actually wrote.
 */
export function toneFor(comment: TicketComment, viewerId: string): BubbleTone {
  if (comment.visibility === "internal") return "internal";
  return comment.author_id === viewerId ? "own" : "other";
}
