import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { AuditEntrySchema, type AuditAction, type AuditEntry } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Immutable change history per ticket.

   Append only, and that is enforced by there being no other statement in this file:
   no UPDATE, no DELETE, no upsert. A history somebody can edit is not a history, and
   the point of a separate table is that correcting a ticket cannot rewrite the record
   of what it used to say.

   The actor comes from the session, never from a parameter a caller could shape —
   the same rule as `created_by` on a ticket. Recording who did something is worthless
   if the doer can choose the name.

   Values are stored as short strings rather than JSON. Every field this tracks is a
   status, a priority, an assignee name or a fragment of text; a JSON blob would need
   a renderer per action and the sidebar would still print it as a line of text.
   ────────────────────────────────────────────────────────────────────────── */

interface AuditRow {
  id: string;
  ticket_id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  field: string;
  old_value: string;
  new_value: string;
  created_at: string;
}

/** Long enough for a status or a name, short enough that the log stays readable. */
const VALUE_LIMIT = 400;

const clip = (value: string): string =>
  value.length > VALUE_LIMIT ? `${value.slice(0, VALUE_LIMIT - 1)}…` : value;

/**
 * Record one change.
 *
 * Never throws on a full log or an oversized value — it clips instead. An audit
 * write must not be able to fail the operation it is describing: refusing a status
 * change because its history entry was too long would be the tail wagging the dog.
 * The caller therefore does not need a try/catch, and none of them have one.
 */
export function recordAudit(
  ticketId: string,
  actor: SessionUser,
  action: AuditAction,
  detail: { field?: string; from?: string; to?: string } = {},
): void {
  const row: AuditRow = {
    id: randomUUID(),
    ticket_id: ticketId,
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    field: clip(detail.field ?? ""),
    old_value: clip(detail.from ?? ""),
    new_value: clip(detail.to ?? ""),
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO mits_audit_log
       (id, ticket_id, actor_id, actor_email, action, field, old_value,
        new_value, created_at)
     VALUES
       (@id, @ticket_id, @actor_id, @actor_email, @action, @field, @old_value,
        @new_value, @created_at)`,
  ).run(row);
}

/**
 * The history of one ticket, oldest first.
 *
 * No access check here: the only caller is the agent ticket page, which has already
 * resolved the ticket through `getTicketFor` and gates the panel on the admin role.
 * Putting a second check here would need the ticket loaded again for no gain — but it
 * does mean a future caller has to do the same, which the parameter name cannot say,
 * so it is said here.
 */
export function listAuditFor(ticketId: string): AuditEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM mits_audit_log
        WHERE ticket_id = ?
        ORDER BY created_at ASC, id ASC`,
    )
    .all(ticketId) as AuditRow[];

  return rows.map((row) => AuditEntrySchema.parse(row));
}

/** How many entries exist, for the sidebar's badge without loading them all. */
export function countAuditFor(ticketId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM mits_audit_log WHERE ticket_id = ?")
    .get(ticketId) as { count: number };
  return row.count;
}
