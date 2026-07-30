import "server-only";

import { randomUUID } from "node:crypto";

import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import {
  TicketCommentSchema,
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
  created_at: string;
}

function rowToComment(row: CommentRow): TicketComment {
  return TicketCommentSchema.parse({
    ...row,
    author_is_agent: row.author_is_agent === 1,
  });
}

export class CommentError extends Error {}

const SELECT = `
  SELECT id, ticket_id, author_id, author_email, author_name,
         author_is_agent, visibility, body, created_at
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
        .prepare(`${SELECT} WHERE ticket_id = ? ORDER BY created_at ASC`)
        .all(ticketId) as CommentRow[])
    : (db
        .prepare(
          `${SELECT} WHERE ticket_id = ? AND visibility = 'public'
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
): TicketComment {
  const text = body.trim();
  if (!text) throw new CommentError("Der Beitrag ist leer.");
  if (text.length > 20000) throw new CommentError("Der Beitrag ist zu lang.");

  const isAgent = canViewBoard(user.role);
  if (visibility === "internal" && !isAgent) {
    throw new CommentError("Interne Notizen sind der Technik vorbehalten.");
  }

  const row: CommentRow = {
    id: randomUUID(),
    ticket_id: ticketId,
    author_id: user.id,
    author_email: user.email,
    author_name: user.name,
    author_is_agent: isAgent ? 1 : 0,
    visibility,
    body: text,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO mits_ticket_comment
       (id, ticket_id, author_id, author_email, author_name,
        author_is_agent, visibility, body, created_at)
     VALUES
       (@id, @ticket_id, @author_id, @author_email, @author_name,
        @author_is_agent, @visibility, @body, @created_at)`,
  ).run(row);

  return rowToComment(row);
}

/** Public replies only, for the notification mail. */
export function countPublicComments(ticketId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket_comment
        WHERE ticket_id = ? AND visibility = 'public'`,
    )
    .get(ticketId) as { count: number };
  return row.count;
}
