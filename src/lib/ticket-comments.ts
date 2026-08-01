import "server-only";

import { randomUUID } from "node:crypto";

import { recordAudit } from "@/lib/audit";
import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { publish } from "@/lib/services/realtime";
import {
  hasVisibleContent,
  sanitizeRichText,
  uploadIdsInHtml,
} from "@/lib/sanitize";
import { withinRetractWindow } from "@/lib/retract-window";
import { UploadError, linkUploadsToTicket } from "@/lib/storage";
import {
  TicketCommentSchema,
  type CommentBodyFormat,
  type CommentVisibility,
  type MITSTicket,
  type TicketComment,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket replies and internal notes.

   The whole point of this module is one rule: an internal note never leaves the
   agent side. That is enforced in the SQL, not in the component — a page
   that forgets a filter is a leak, a query that cannot return the rows is not.
   ────────────────────────────────────────────────────────────────────────── */

interface CommentRow {
  id: string;
  ticket_id: string;
  author_id: string;
  author_email: string;
  author_name: string;
  author_is_agent: number;
  visibility: string;
  body: string;
  body_format: string;
  created_at: string;
  edited_at: string | null;
}

function rowToComment(row: CommentRow): TicketComment {
  return TicketCommentSchema.parse({
    ...row,
    author_is_agent: row.author_is_agent === 1,
  });
}

export class CommentError extends Error {}

/** Same rule as tickets: a soft-deleted comment is invisible to every read. */
const ALIVE = "deleted_at IS NULL";

const SELECT = `
  SELECT id, ticket_id, author_id, author_email, author_name,
         author_is_agent, visibility, body, body_format, created_at, edited_at
    FROM mits_ticket_comment
`;

/*
 * The undo window lives in `lib/retract-window.ts`, not here.
 *
 * The countdown on the button and the check that refuses a late retraction have
 * to be the same number: a button offering three more seconds than the server
 * allows produces a refusal that reads as a bug in the button. That module has no
 * `server-only`, so the client can import the same constant.
 *
 * **It cannot recall a notification mail.** `addCommentAction` sends immediately,
 * so a retraction removes the message from the ticket and not from an inbox.
 * Delaying every notification by fifteen seconds to close that gap would make the
 * whole system feel slower for a case that is rare — the retraction is honest
 * about what it does instead.
 */

/**
 * The comments this user may see on this ticket.
 *
 * A plain `user` gets public entries only. The visibility filter is part of the
 * statement rather than a `.filter()` on the result, so an internal note is never
 * loaded into a response that could be over-serialised by mistake.
 */
export function listCommentsFor(
  ticketId: string,
  user: SessionUser,
): TicketComment[] {
  const rows = canViewBoard(user.role)
    ? (db
        .prepare(`${SELECT} WHERE ${ALIVE} AND ticket_id = ? ORDER BY created_at ASC`)
        .all(ticketId) as CommentRow[])
    : (db
        .prepare(
          `${SELECT} WHERE ${ALIVE} AND ticket_id = ? AND visibility = 'public'
             ORDER BY created_at ASC`,
        )
        .all(ticketId) as CommentRow[]);

  return rows.map(rowToComment);
}

/**
 * A short string that changes whenever this reader's view of the thread does.
 *
 * What the live poll on the ticket page compares. Two counts and a timestamp
 * rather than the comments themselves: the point of the poll is to answer "is
 * there anything new" every few seconds, and shipping every body to answer it
 * would send the whole conversation down the wire once a tick.
 *
 * **Built from the same visibility rule as the listing**, by counting through
 * `visibility` the same way. A fingerprint that moved when an internal note was
 * written would refresh a reporter's page for something they will never be shown
 * — and repeated, that is a side channel telling them roughly when staff are
 * talking about their ticket.
 *
 * The count is in it as well as the newest timestamp because a deletion changes
 * neither the maximum nor anything else a reader would notice otherwise.
 */
function commentFingerprint(ticketId: string, user: SessionUser): string {
  const scope = canViewBoard(user.role) ? "" : "AND visibility = 'public'";

  const row = db
    .prepare(
      `SELECT COUNT(*) AS count, MAX(created_at) AS latest
         FROM mits_ticket_comment
        WHERE ${ALIVE} AND ticket_id = ? ${scope}`,
    )
    .get(ticketId) as { count: number; latest: string | null };

  return `${row.count}:${row.latest ?? ""}`;
}

/**
 * Everything on the ticket page that a poll should notice, as one string.
 *
 * Called from **both** sides of the live loop — the page renders it into
 * `TicketLive` as the starting value, and `/api/tickets/[id]/activity` returns it
 * on every tick. One function rather than one expression in each place: the two
 * are compared for equality, so a difference in how they are built is not a
 * cosmetic inconsistency but a page that either never refreshes or refreshes
 * forever, and neither failure names its cause.
 *
 * The ticket half is the fields that are actually on screen rather than an
 * `updated_at` column, so a write that changes nothing visible does not drag
 * every open tab through a re-render.
 */
export function ticketActivityFingerprint(
  ticket: Pick<
    MITSTicket,
    "id" | "status" | "priority" | "assigned_to" | "major_incident" | "tags"
  >,
  user: SessionUser,
): string {
  const state = [
    ticket.status,
    ticket.priority,
    ticket.assigned_to ?? "",
    ticket.major_incident ? "1" : "0",
    ticket.tags.join(","),
  ].join("|");

  return `${commentFingerprint(ticket.id, user)}|${state}`;
}

/**
 * Append a comment.
 *
 * The author comes from the session, never from the request — the same rule as
 * `created_by` on a ticket. Only staff may write an internal note; a `user` role
 * asking for one is refused rather than silently downgraded to public, because
 * silently publishing something meant to be private is the worse failure.
 */
/**
 * Server-side mail ingest only. **Never** populated from a request.
 *
 * A reply that arrives by mail from somebody with no MITS account still has an
 * author with a name. The comment is written under the configured fallback
 * account — `author_id` stays honest about which account performed the write —
 * while the displayed name and address are the human's.
 *
 * Named and separate from `user` for the same reason `MailIngestOrigin` is: a
 * client that could name its own author could post as a colleague, and burying
 * that in an options object is how it eventually gets wired to a request body.
 */
export interface MailAuthorOrigin {
  name: string;
  email: string;
}

export function addComment(
  ticketId: string,
  user: SessionUser,
  body: string,
  visibility: CommentVisibility,
  /**
   * `html` runs the body through `sanitizeRichText` before it is stored, so the
   * column only ever holds markup this application produced. Plain text is the
   * default — a caller that does not say otherwise cannot accidentally store
   * unsanitised HTML.
   */
  format: CommentBodyFormat = "text",
  origin?: MailAuthorOrigin,
): TicketComment {
  /*
   * A mailed-in reply is never staff, whatever account it is filed under.
   *
   * Without this, a mail landing on the fallback account — which an admin might
   * reasonably have given the agent role — would be stored with
   * `author_is_agent: 1`. It would then render in the agent bubble, on the right,
   * as if the team had written it, and `addCommentAction`'s notification rule
   * would mail the customer their own words back.
   */
  const isAgent = origin ? false : canViewBoard(user.role);
  if (visibility === "internal" && !isAgent) {
    throw new CommentError("Interne Notizen sind Agenten vorbehalten.");
  }

  let text: string;
  /** Upload ids the body embeds — bound to the ticket alongside the insert. */
  let embedded: string[] = [];
  if (format === "html") {
    /*
     * Sanitised here rather than at the call site, so there is exactly one door
     * into this column and it cannot be walked past. The emptiness check happens
     * *after* cleaning: a body consisting only of a remote tracking pixel reduces
     * to nothing, and storing that would show an empty bubble.
     */
    const { html } = sanitizeRichText(body);
    if (!hasVisibleContent(html)) {
      throw new CommentError("Der Beitrag ist leer.");
    }
    text = html;
    embedded = uploadIdsInHtml(html);
  } else {
    text = body.trim();
    if (!text) throw new CommentError("Der Beitrag ist leer.");
  }

  if (text.length > 20000) throw new CommentError("Der Beitrag ist zu lang.");

  const row: CommentRow = {
    id: randomUUID(),
    ticket_id: ticketId,
    // The account that performed the write stays the account, always. Only the
    // displayed identity can differ, and only for the mail ingest.
    author_id: user.id,
    author_email: origin?.email.trim() || user.email,
    author_name: origin?.name.trim() || user.name,
    author_is_agent: isAgent ? 1 : 0,
    visibility,
    body: text,
    body_format: format,
    created_at: new Date().toISOString(),
    // Never on insert. A row stamped as edited at the moment it was written would
    // put the marker on every message in the system.
    edited_at: null,
  };

  /*
   * Insert and bind in one transaction.
   *
   * A pasted screenshot is uploaded with no ticket, so without the binding
   * `openUploadFor` would fall back to owner-or-staff and the reporter could not see
   * the image in their own ticket. `linkUploadsToTicket` also re-checks that the
   * caller owns every id, which is what stops a hand-built body from embedding
   * somebody else's file and pulling it in through this ticket.
   *
   * One unit of work, because a comment whose images failed to bind renders as broken
   * boxes and there is nothing the reader can do about it.
   */
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO mits_ticket_comment
           (id, ticket_id, author_id, author_email, author_name,
            author_is_agent, visibility, body, body_format, created_at)
         VALUES
           (@id, @ticket_id, @author_id, @author_email, @author_name,
            @author_is_agent, @visibility, @body, @body_format, @created_at)`,
      ).run(row);

      linkUploadsToTicket(embedded, ticketId, user);

      /*
       * Inside the transaction, so a comment cannot exist without its history entry.
       * The body is not copied into the log — it is already stored, and duplicating it
       * would double the space for every reply and make the log the second place a
       * correction has to reach.
       */
      recordAudit(ticketId, user, "comment_added", {
        field: visibility === "internal" ? "interne Notiz" : "Antwort",
      });
    })();
  } catch (error) {
    if (error instanceof UploadError) throw new CommentError(error.message);
    throw error;
  }

  /*
   * After the transaction, never inside it.
   *
   * A signal published from within the write would reach a browser that then
   * refetches — and on a rollback that browser has been told about a message
   * which does not exist. `publish` swallows its own failures, so the ordering
   * costs nothing and removes the only case where the two can disagree.
   *
   * `notify` goes to everyone: who actually has something to see is decided by
   * `listNotifications` on the fetch that follows, which is the one place that
   * rule belongs. An internal note is a `ticket` signal only — the reporter's
   * page would refetch and correctly find nothing new, and waking it to learn
   * that is a round trip that also reveals the note's timing.
   */
  publish({
    type: "ticket",
    ticketId,
    audience: "all",
    actorId: user.id,
  });
  if (visibility !== "internal") {
    publish({ type: "notify", audience: "all", actorId: user.id });
  }
  publish({ type: "queue", audience: "staff", actorId: user.id });

  return rowToComment(row);
}

/**
 * Load one comment with the same visibility rule the listing uses.
 *
 * Answers `null` for "gone" and for "not yours to see" alike — the same choice
 * `getTicketFor` makes, and for the same reason: a distinguishable "forbidden"
 * turns an id into something worth guessing.
 */
function getCommentFor(
  commentId: string,
  user: SessionUser,
): TicketComment | null {
  const scope = canViewBoard(user.role) ? "" : "AND visibility = 'public'";
  const row = db
    .prepare(`${SELECT} WHERE ${ALIVE} AND id = ? ${scope}`)
    .get(commentId) as CommentRow | undefined;

  return row ? rowToComment(row) : null;
}

/**
 * Correct the text of a message you wrote.
 *
 * **Only the author, and only ever the text.** Not an agent editing a reporter's
 * words, not an admin editing an agent's — a conversation whose record can be
 * rewritten by somebody other than the person who spoke is not a record. There is
 * no "moderate" path here on purpose; the tool for a message that must go is
 * deletion, which leaves a hole rather than a forgery.
 *
 * Visibility is not editable either. Turning a public reply into an internal note
 * would not unsend it, and turning a note public would publish something written
 * under the assumption that it was not.
 */
export function editComment(
  commentId: string,
  user: SessionUser,
  body: string,
): TicketComment {
  const existing = getCommentFor(commentId, user);
  if (!existing) throw new CommentError("Beitrag nicht gefunden.");
  if (existing.author_id !== user.id) {
    throw new CommentError("Nur der Verfasser kann einen Beitrag ändern.");
  }

  // Same treatment the original got, decided by the stored format rather than by
  // the caller: a client that could pick would be choosing whether its own input
  // goes through the sanitiser.
  let text: string;
  if (existing.body_format === "html") {
    const { html } = sanitizeRichText(body);
    if (!hasVisibleContent(html)) throw new CommentError("Der Beitrag ist leer.");
    /*
     * Images embedded by an edit are **not** re-bound to the ticket.
     *
     * `addComment` calls `linkUploadsToTicket` for exactly that, and it also
     * re-checks that every id belongs to the caller. Repeating it here would be
     * fine; leaving it out is not, because an edit that pastes a new screenshot
     * would render as a broken box. So editing is text-only in practice — the
     * editor keeps the images that were already bound and a newly pasted one is
     * dropped by the sanitiser's own allow-list rather than half-stored.
     */
    text = html;
  } else {
    text = body.trim();
    if (!text) throw new CommentError("Der Beitrag ist leer.");
  }

  if (text.length > 20000) throw new CommentError("Der Beitrag ist zu lang.");

  /*
   * Unchanged text is not an edit.
   *
   * Somebody who opens the editor, reads it again and saves has not corrected
   * anything, and stamping `edited_at` would put a marker on the message that
   * tells every later reader to distrust a text nobody touched.
   */
  if (text === existing.body) return existing;

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE mits_ticket_comment SET body = ?, edited_at = ? WHERE id = ?",
  ).run(text, now, commentId);

  recordAudit(existing.ticket_id, user, "comment_edited", {
    field: existing.visibility === "internal" ? "interne Notiz" : "Antwort",
  });

  publish({
    type: "ticket",
    ticketId: existing.ticket_id,
    audience: "all",
    actorId: user.id,
  });

  const updated = getCommentFor(commentId, user);
  if (!updated) throw new CommentError("Beitrag nicht gefunden.");
  return updated;
}

/**
 * Take a message back, within the window.
 *
 * Soft-deleted like everything else here, so the row survives for anybody
 * restoring a backup or reading the audit trail — what disappears is the message,
 * not the fact that there was one.
 *
 * The window is checked **server-side against the stored timestamp**, never
 * against anything the client says. The countdown in the browser is a courtesy;
 * this is the rule.
 */
export function retractComment(commentId: string, user: SessionUser): string {
  const existing = getCommentFor(commentId, user);
  if (!existing) throw new CommentError("Beitrag nicht gefunden.");
  if (existing.author_id !== user.id) {
    throw new CommentError("Nur der Verfasser kann einen Beitrag zurückziehen.");
  }
  if (!withinRetractWindow(existing.created_at)) {
    throw new CommentError(
      "Die Zeit zum Zurückziehen ist abgelaufen. Der Beitrag bleibt im Verlauf.",
    );
  }

  db.prepare(
    "UPDATE mits_ticket_comment SET deleted_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), commentId);

  recordAudit(existing.ticket_id, user, "comment_retracted", {
    field: existing.visibility === "internal" ? "interne Notiz" : "Antwort",
  });

  publish({
    type: "ticket",
    ticketId: existing.ticket_id,
    audience: "all",
    actorId: user.id,
  });

  return existing.ticket_id;
}

/** Public replies only, for the notification mail. */
export function countPublicComments(ticketId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket_comment
        WHERE ${ALIVE} AND ticket_id = ? AND visibility = 'public'`,
    )
    .get(ticketId) as { count: number };
  return row.count;
}
