"use client";

import { LockIcon, PencilIcon } from "lucide-react";
import type { ReactNode } from "react";

import { RelativeTime } from "@/components/layout/relative-time";
import { CommentBody } from "@/components/tickets/comment-body";
import { cn } from "@/lib/utils";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   One message in a ticket conversation.

   **Both axes are relative to the reader, and they agree.**

   - **side** — your own messages sit right, everybody else's left.
   - **tone** — your own are colourless (grey), the other side is blue, an
     internal note is amber.

   One question, answered twice: *was that me*. Position carries it across the
   whole column at a glance, colour carries it inside each card, and because
   both are keyed to the same fact they can never contradict each other.

   The consequence is that the same thread looks different to different people,
   and that is the point. On the agent's screen their replies are grey and on
   the right; on the reporter's screen those same replies are blue and on the
   left, and the reporter's own are grey on the right. Anybody reading their own
   conversation sees their half where their eye already goes.

   Two earlier versions are worth knowing about, because both are defensible and
   both were tried here. Keying **position** to the speaker (reporter left, team
   right, the same for everybody) makes a screenshot from one side line up with
   one from the other; it was dropped because "the bubble on the right" then
   means the team even when the team is you. Putting **everything** in one
   left-aligned column reads well for long mailed-in threads and lost the
   at-a-glance separation that makes a conversation scannable at all.

   Both axes stay props. Deriving either from `author_is_agent` inside this file
   would bake one perspective into the one component that must not hold an
   opinion about perspective — and `author_is_agent` is the wrong fact anyway:
   two agents on one ticket are not each other.

   Internal notes keep their own colour but follow the same side rule. An amber
   card on the right is a note *you* wrote; on the left, one a colleague did.

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
   * The three-dot menu, in the header's right-hand corner.
   *
   * A slot rather than something this component builds: whether editing and
   * retracting apply depends on ownership and on two feature flags, and a
   * component that draws one message should not be reading either.
   */
  menu,
  /**
   * The correction form, rendered **instead of** the body.
   *
   * Not below it: leaving the stored text above a field holding the same words
   * showed the message twice, and neither copy said which one was about to be
   * saved.
   */
  editor,
  /**
   * Rendered under the body, inside the bubble.
   *
   * Used for the form answers on the opening message: a submission is one thing
   * somebody said, and splitting it between a bubble and a list at the edge of the
   * page makes the conversational half read as though most of it was left out.
   * Hidden while the editor is open — that form is about the text, not about the
   * payload behind it.
   */
  details,
}: {
  comment: TicketComment;
  tone: BubbleTone;
  /** Where it sits — `right` for the reader's own messages. See `sideFor`. */
  side: "left" | "right";
  isNew?: boolean;
  menu?: ReactNode;
  editor?: ReactNode;
  details?: ReactNode;
}) {
  const style = TONES[tone];
  const label = roleLabel(comment);

  return (
    <article
      className={cn(
        /*
          `min-w-0` as well as the cap: without it a grid item refuses to shrink
          below its content, so one long token would widen the card past its
          maximum and push the column sideways.

          The gap on the far side is what makes the alternation readable: a card
          that ran the full width would sit against both edges and the eye would
          have nothing to tell the two apart by.
        */
        "max-w-[85%] min-w-0 rounded-2xl border px-4 py-3 shadow-elev-1",
        // The corner nearest the speaker is squared off, the way a tail would
        // point — the one piece of messenger vocabulary worth keeping, because
        // it survives being read at a glance.
        side === "right"
          ? "justify-self-end rounded-br-md"
          : "justify-self-start rounded-bl-md",
        // Inset rather than a different width: an internal note sits inside the
        // same conversation and should read as an aside to it, not as a third
        // participant with its own column. Inset from its *own* edge, so the
        // side rule still reads.
        tone === "internal" &&
          (side === "right" ? "max-w-[80%] sm:mr-10" : "max-w-[80%] sm:ml-10"),
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
        {/*
          The menu is the last thing in the header, so it lands in the bubble's
          top-right corner. `ml-auto` on the time keeps it there even when the
          header wraps — on a narrow screen the two travel to the next line
          together rather than the menu ending up under the author's name.
        */}
        {menu}
      </header>
      {editor ?? (
        <>
          <CommentBody comment={comment} />
          {details}
        </>
      )}
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

/**
 * Which edge a stored comment sits on, **for this reader**.
 *
 * The plain form of the same question the tone asks, and deliberately without
 * the internal-note exception: `toneFor` lets `visibility` win because amber is
 * carrying a second piece of information, but there is no third side to put a
 * note on. Your own note is yours and belongs on your edge; a colleague's is
 * theirs.
 *
 * Not derived from the tone for exactly that reason — `internal` maps to no
 * side, and a `tone === "own" ? right : left` would quietly file every one of
 * your own notes on the wrong edge.
 */
export function sideFor(
  comment: TicketComment,
  viewerId: string,
): "left" | "right" {
  return comment.author_id === viewerId ? "right" : "left";
}
