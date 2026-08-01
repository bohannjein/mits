import "server-only";

import { randomUUID } from "node:crypto";

import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import {
  WORKLOG_MAX_MINUTES,
  WorklogEntrySchema,
  type WorklogEntry,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Booked time.

   Agents only, at every level: the queue is where the hours are worked, and a
   reporter booking time against their own ticket would be writing somebody else's
   timesheet. The check is in this module and not only in the action, because a
   library function is reachable from a call site that has not been written yet.

   Nothing sums a stored total. `logged_minutes` on a ticket is a `SUM()` in
   `searchTickets`, and the detail view sums the rows it is already showing — the
   same rule the CMDB uses for licence seats, and for the same reason: a stored
   counter beside the rows it counts is a second truth, and the first delete makes
   them disagree.
   ────────────────────────────────────────────────────────────────────────── */

export class WorklogError extends Error {}

interface WorklogRow {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  minutes: number;
  note: string;
  performed_at: string;
  created_at: string;
}

const rowToEntry = (row: WorklogRow): WorklogEntry =>
  WorklogEntrySchema.parse(row);

/**
 * Entries on a ticket, newest work first.
 *
 * Not access-checked here: every caller has already resolved the ticket through
 * `getTicketFor`, which is the one place that decides who may see what. Adding a
 * second, differently-worded rule would give the codebase two answers to the same
 * question.
 */
export function listWorklogs(ticketId: string): WorklogEntry[] {
  const rows = db
    .prepare(
      `SELECT id, ticket_id, user_id, user_name, minutes, note, performed_at, created_at
         FROM mits_ticket_worklog
        WHERE ticket_id = ?
        ORDER BY performed_at DESC, created_at DESC`,
    )
    .all(ticketId) as WorklogRow[];
  return rows.map(rowToEntry);
}

/** Total booked against one ticket. */
export function worklogTotal(ticketId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(minutes), 0) AS total FROM mits_ticket_worklog WHERE ticket_id = ?",
    )
    .get(ticketId) as { total: number };
  return row.total;
}

/** `YYYY-MM-DD` in UTC, matching how `performed_at` is stored and compared. */
const today = (): string => new Date().toISOString().slice(0, 10);

export function addWorklog(
  ticketId: string,
  user: SessionUser,
  minutes: number,
  note: string,
  performedAt: string,
): WorklogEntry {
  if (!canViewBoard(user.role)) {
    throw new WorklogError("Zeiten erfassen ist Agenten vorbehalten.");
  }
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new WorklogError("Bitte eine Dauer angeben, z. B. 45 Min oder 1:30.");
  }
  if (minutes > WORKLOG_MAX_MINUTES) {
    throw new WorklogError(
      `Ein Eintrag darf höchstens ${WORKLOG_MAX_MINUTES / 60} Stunden umfassen.`,
    );
  }

  /*
   * An unreadable or future date falls back to today rather than being refused.
   *
   * Future first: a booking dated next week is either a typo or a clock problem,
   * and either way it would sit at the top of the list forever and inflate a
   * report about a period that has not happened.
   */
  const day = /^\d{4}-\d{2}-\d{2}$/.test(performedAt) ? performedAt : today();
  const performed = day > today() ? today() : day;

  const row: WorklogRow = {
    id: randomUUID(),
    ticket_id: ticketId,
    user_id: user.id,
    // Copied, not joined: a deleted account must not turn a year of timesheets
    // into rows of opaque ids.
    user_name: user.name,
    minutes,
    note: note.trim().slice(0, 500),
    performed_at: performed,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO mits_ticket_worklog
       (id, ticket_id, user_id, user_name, minutes, note, performed_at, created_at)
     VALUES
       (@id, @ticket_id, @user_id, @user_name, @minutes, @note, @performed_at,
        @created_at)`,
  ).run(row);

  return rowToEntry(row);
}

/**
 * Remove one entry.
 *
 * An agent may delete their own; an admin may delete anybody's. Not "any agent may
 * delete any entry": a timesheet somebody else can quietly edit is not a record,
 * and the person who booked the time is the one who can say it was wrong.
 *
 * A hard delete, unlike a ticket. The row is a claim about hours, and a
 * soft-deleted claim that still has to be excluded from every `SUM()` is one
 * forgotten `WHERE` away from a wrong invoice.
 */
export function deleteWorklog(
  worklogId: string,
  ticketId: string,
  user: SessionUser,
): void {
  const row = db
    .prepare("SELECT user_id, ticket_id FROM mits_ticket_worklog WHERE id = ?")
    .get(worklogId) as { user_id: string; ticket_id: string } | undefined;

  // Same answer for "gone" and "not yours", so the id space cannot be probed.
  if (!row || row.ticket_id !== ticketId) {
    throw new WorklogError("Eintrag nicht gefunden.");
  }
  if (row.user_id !== user.id && user.role !== "admin") {
    throw new WorklogError("Nur der eigene Eintrag kann entfernt werden.");
  }

  db.prepare("DELETE FROM mits_ticket_worklog WHERE id = ?").run(worklogId);
}
