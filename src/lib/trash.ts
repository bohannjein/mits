import "server-only";

import { recordAudit } from "@/lib/audit";
import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { MITSTicketSchema, type MITSTicket } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Soft delete and restore.

   Nothing in MITS issues a DELETE against a ticket, a comment or an upload. "Löschen"
   sets `deleted_at`, every read filters on it, and the row stays for the trash view and
   for whatever a retention policy later decides.

   Two reasons this is not a boolean. A timestamp answers "when", which the restore view
   sorts by and a retention rule measures against; and a boolean invites `NOT deleted`,
   which is true for a NULL in some dialects and false in others. `deleted_at IS NULL`
   has one reading everywhere.

   Who may delete: staff. A reporter deleting their own ticket sounds reasonable until
   the ticket is the record of an incident somebody else is working — removing it from
   the queue mid-investigation is not theirs to do. They can ask, which is a reply.
   ────────────────────────────────────────────────────────────────────────── */

export class TrashError extends Error {}

const now = () => new Date().toISOString();

function requireStaff(user: SessionUser): void {
  if (!canViewBoard(user.role)) {
    throw new TrashError("Löschen und Wiederherstellen ist der Technik vorbehalten.");
  }
}

/**
 * Move a ticket to the trash, with its comments and attachments.
 *
 * Cascaded on purpose, in one transaction: a ticket whose comments stayed visible would
 * leave the conversation reachable through any future listing that joins on ticket_id,
 * and half a deletion is worse than none. Restoring reverses exactly this set, which is
 * why the timestamp is shared rather than taken per row.
 */
export function softDeleteTicket(ticketId: string, user: SessionUser): void {
  requireStaff(user);

  const stamp = now();
  const affected = db.transaction(() => {
    const ticket = db
      .prepare(
        "UPDATE mits_ticket SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
      )
      .run(stamp, ticketId);

    if (ticket.changes === 0) return 0;

    /*
     * Only rows that are still alive get the stamp. A comment an agent deleted last
     * week keeps its own timestamp, so restoring the ticket brings back the ticket and
     * not that comment — which is what the agent decided at the time.
     */
    db.prepare(
      `UPDATE mits_ticket_comment SET deleted_at = ?
        WHERE ticket_id = ? AND deleted_at IS NULL`,
    ).run(stamp, ticketId);

    db.prepare(
      `UPDATE mits_upload SET deleted_at = ?
        WHERE ticket_id = ? AND deleted_at IS NULL`,
    ).run(stamp, ticketId);

    return ticket.changes;
  })();

  if (affected === 0) {
    throw new TrashError("Ticket nicht gefunden oder bereits gelöscht.");
  }

  // Recorded after the fact but inside the same request: the audit row survives the
  // deletion because it lives in its own table, which is the point of that table.
  recordAudit(ticketId, user, "ticket_deleted", { to: stamp });
}

/** Reverse one soft delete, restoring only what that same action removed. */
export function restoreTicket(ticketId: string, user: SessionUser): void {
  requireStaff(user);

  const row = db
    .prepare("SELECT deleted_at FROM mits_ticket WHERE id = ?")
    .get(ticketId) as { deleted_at: string | null } | undefined;

  if (!row) throw new TrashError("Ticket nicht gefunden.");
  if (!row.deleted_at) throw new TrashError("Das Ticket ist nicht gelöscht.");

  const stamp = row.deleted_at;

  db.transaction(() => {
    db.prepare("UPDATE mits_ticket SET deleted_at = NULL WHERE id = ?").run(ticketId);

    // Matched on the exact timestamp, so a comment deleted separately stays deleted.
    db.prepare(
      `UPDATE mits_ticket_comment SET deleted_at = NULL
        WHERE ticket_id = ? AND deleted_at = ?`,
    ).run(ticketId, stamp);

    db.prepare(
      `UPDATE mits_upload SET deleted_at = NULL
        WHERE ticket_id = ? AND deleted_at = ?`,
    ).run(ticketId, stamp);
  })();

  recordAudit(ticketId, user, "ticket_restored", { from: stamp });
}

/** One comment, without touching the ticket. */
export function softDeleteComment(
  commentId: string,
  user: SessionUser,
): { ticketId: string } {
  requireStaff(user);

  const row = db
    .prepare(
      "SELECT ticket_id FROM mits_ticket_comment WHERE id = ? AND deleted_at IS NULL",
    )
    .get(commentId) as { ticket_id: string } | undefined;

  if (!row) throw new TrashError("Beitrag nicht gefunden oder bereits gelöscht.");

  db.prepare("UPDATE mits_ticket_comment SET deleted_at = ? WHERE id = ?").run(
    now(),
    commentId,
  );

  recordAudit(row.ticket_id, user, "comment_deleted", { field: commentId });
  return { ticketId: row.ticket_id };
}

export function restoreComment(
  commentId: string,
  user: SessionUser,
): { ticketId: string } {
  requireStaff(user);

  const row = db
    .prepare(
      `SELECT c.ticket_id AS ticket_id, t.deleted_at AS ticket_deleted
         FROM mits_ticket_comment c
         LEFT JOIN mits_ticket t ON t.id = c.ticket_id
        WHERE c.id = ? AND c.deleted_at IS NOT NULL`,
    )
    .get(commentId) as
    | { ticket_id: string; ticket_deleted: string | null }
    | undefined;

  if (!row) throw new TrashError("Beitrag nicht gefunden oder nicht gelöscht.");

  /*
   * Refused while the ticket itself is deleted. The comment would come back invisible —
   * every read filters on the ticket too — and an action that reports success while
   * changing nothing a user can see is the worst kind.
   */
  if (row.ticket_deleted) {
    throw new TrashError(
      "Zuerst das Ticket wiederherstellen — sonst bliebe der Beitrag unsichtbar.",
    );
  }

  db.prepare("UPDATE mits_ticket_comment SET deleted_at = NULL WHERE id = ?").run(
    commentId,
  );

  recordAudit(row.ticket_id, user, "comment_restored", { field: commentId });
  return { ticketId: row.ticket_id };
}

/* ── The trash view ─────────────────────────────────────────────────────── */

const SELECT_DELETED = `
  SELECT id, ticket_number, location_id, created_by, created_by_email, source,
         form_schema_id, title, payload, status, priority, assigned_to, created_at,
         deleted_at
    FROM mits_ticket
   WHERE deleted_at IS NOT NULL
`;

export interface DeletedTicket {
  ticket: MITSTicket;
  deletedAt: Date;
  /** Comments that went with it, so the view can say what a restore brings back. */
  comments: number;
}

/** Most recently deleted first — that is the one somebody is looking for. */
export function listDeletedTickets(limit = 100): DeletedTicket[] {
  const rows = db
    .prepare(`${SELECT_DELETED} ORDER BY deleted_at DESC LIMIT ?`)
    .all(limit) as (Record<string, unknown> & { deleted_at: string })[];

  const countComments = db.prepare(
    `SELECT COUNT(*) AS count FROM mits_ticket_comment
      WHERE ticket_id = ? AND deleted_at IS NOT NULL`,
  );

  return rows.map((row) => ({
    ticket: MITSTicketSchema.parse({
      ...row,
      ticket_number: row.ticket_number ?? 0,
      form_schema_id: row.form_schema_id ?? undefined,
      payload: JSON.parse(String(row.payload)),
    }),
    deletedAt: new Date(row.deleted_at),
    comments: (countComments.get(row.id) as { count: number }).count,
  }));
}

/**
 * Comments deleted on their own — not the ones that went with a ticket.
 *
 * Distinguished by the ticket still being alive. Listing the cascaded ones here would
 * fill the view with rows whose restore button has to be refused, and a list of
 * unusable actions is worse than a shorter list.
 */
export function listDeletedComments(limit = 100): {
  id: string;
  ticketId: string;
  ticketNumber: number;
  authorName: string;
  preview: string;
  deletedAt: Date;
}[] {
  const rows = db
    .prepare(
      `SELECT c.id AS id, c.ticket_id AS ticket_id, c.author_name AS author_name,
              c.body AS body, c.body_format AS body_format, c.deleted_at AS deleted_at,
              t.ticket_number AS ticket_number
         FROM mits_ticket_comment c
         JOIN mits_ticket t ON t.id = c.ticket_id
        WHERE c.deleted_at IS NOT NULL AND t.deleted_at IS NULL
        ORDER BY c.deleted_at DESC
        LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    ticket_id: string;
    author_name: string;
    body: string;
    body_format: string;
    deleted_at: string;
    ticket_number: number | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number ?? 0,
    authorName: row.author_name,
    // Tags stripped rather than rendered: this is a one-line preview in a table, and
    // an HTML body would otherwise bring its own formatting into the row.
    preview: row.body
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120),
    deletedAt: new Date(row.deleted_at),
  }));
}

/** Counts for the admin dashboard, without loading the rows. */
export function trashCounts(): { tickets: number; comments: number } {
  const tickets = db
    .prepare("SELECT COUNT(*) AS count FROM mits_ticket WHERE deleted_at IS NOT NULL")
    .get() as { count: number };

  const comments = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket_comment c
         JOIN mits_ticket t ON t.id = c.ticket_id
        WHERE c.deleted_at IS NOT NULL AND t.deleted_at IS NULL`,
    )
    .get() as { count: number };

  return { tickets: tickets.count, comments: comments.count };
}
