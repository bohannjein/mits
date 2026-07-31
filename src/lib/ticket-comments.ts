import "server-only";

import { randomUUID } from "node:crypto";

import { recordAudit } from "@/lib/audit";
import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import {
  hasVisibleContent,
  sanitizeRichText,
  uploadIdsInHtml,
} from "@/lib/sanitize";
import { UploadError, linkUploadsToTicket } from "@/lib/storage";
import {
  TicketCommentSchema,
  type CommentBodyFormat,
  type CommentVisibility,
  type TicketComment,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket replies and internal notes.

   The whole point of this module is one rule: an internal note never leaves the
   technician side. That is enforced in the SQL, not in the component — a page
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
         author_is_agent, visibility, body, body_format, created_at
    FROM mits_ticket_comment
`;

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
 * Append a comment.
 *
 * The author comes from the session, never from the request — the same rule as
 * `created_by` on a ticket. Only staff may write an internal note; a `user` role
 * asking for one is refused rather than silently downgraded to public, because
 * silently publishing something meant to be private is the worse failure.
 */
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
): TicketComment {
  const isAgent = canViewBoard(user.role);
  if (visibility === "internal" && !isAgent) {
    throw new CommentError("Interne Notizen sind der Technik vorbehalten.");
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
    author_id: user.id,
    author_email: user.email,
    author_name: user.name,
    author_is_agent: isAgent ? 1 : 0,
    visibility,
    body: text,
    body_format: format,
    created_at: new Date().toISOString(),
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

  return rowToComment(row);
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
