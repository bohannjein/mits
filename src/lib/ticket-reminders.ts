import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { getTicketFor } from "@/lib/tickets";
import {
  MITSTicketReminderSchema,
  type MITSTicketReminder,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Snooze: a ticket and a time, per person.

   **Per user, never shared.** Two agents on one ticket have two different reasons
   to come back to it, and one row for both would mean the first to tick it off
   silences the other. That is also why every read here is keyed on the user
   first: „was ist für mich fällig" is the only question this table answers.

   **Access is re-checked on write, not inherited.** A reminder names a ticket,
   and a row naming a ticket somebody cannot open is already a disclosure — it
   says the id exists. `getTicketFor` answers null for both „missing" and „not
   yours", so nothing here can be used to probe for ids.

   **Nothing here sends anything.** A due reminder becomes visible because
   `listNotifications` derives it from this table on the next poll — the same
   mechanism replies and assignments use, and for the reason documented there: a
   stored notification queue needs a row per user per event, a delivery flag and a
   cleanup job, and the first writer that forgets to fan out produces a
   notification nobody ever gets. The cron endpoint only nudges the streams so the
   poll happens now instead of within the interval.
   ────────────────────────────────────────────────────────────────────────── */

/** Nobody needs a fourth reminder on one ticket; a runaway loop would write thousands. */
const MAX_PER_TICKET = 20;

/** How many the dashboard widget shows. Beyond this it is a list, not a widget. */
export const REMINDER_WIDGET_LIMIT = 6;

export class ReminderError extends Error {}

interface ReminderRow {
  id: string;
  ticket_id: string;
  user_id: string;
  due_at: string;
  note: string;
  is_done: number;
  created_at: string;
}

function rowToReminder(row: ReminderRow): MITSTicketReminder {
  return MITSTicketReminderSchema.parse({
    ...row,
    // SQLite has no boolean.
    is_done: row.is_done === 1,
  });
}

/**
 * A reminder, with enough of its ticket to render a line about it.
 *
 * Joined rather than fetched per row: the widget shows six of these, and six
 * `getTicketFor` calls would be six queries plus six visibility checks for a list
 * whose scope is already „reminders belonging to me". The ticket a reminder names
 * was visible when it was set; a ticket that has since been deleted is filtered
 * out by `deleted_at IS NULL` here.
 */
export interface ReminderWithTicket extends MITSTicketReminder {
  ticket_number: number;
  ticket_title: string;
  ticket_status: string;
}

const WITH_TICKET_SELECT = `
  SELECT r.id, r.ticket_id, r.user_id, r.due_at, r.note, r.is_done, r.created_at,
         t.ticket_number, t.title AS ticket_title, t.status AS ticket_status
    FROM mits_ticket_reminder r
    JOIN mits_ticket t ON t.id = r.ticket_id
   WHERE t.deleted_at IS NULL
`;

function rowToWithTicket(
  row: ReminderRow & {
    ticket_number: number | null;
    ticket_title: string;
    ticket_status: string;
  },
): ReminderWithTicket {
  return {
    ...rowToReminder(row),
    ticket_number: row.ticket_number ?? 0,
    ticket_title: row.ticket_title,
    ticket_status: row.ticket_status,
  };
}

/**
 * Put a ticket on somebody's clock.
 *
 * `dueAt` arrives as an instant, already bounded by `resolveReminderDue` — this
 * function does not re-derive it from a preset, because the arithmetic lives in
 * exactly one place and a second copy is how „morgen 09:00" starts meaning two
 * different times.
 */
export function createReminder(
  ticketId: string,
  user: SessionUser,
  dueAt: Date,
  note: string,
): MITSTicketReminder {
  const ticket = getTicketFor(ticketId, user);
  if (!ticket) throw new ReminderError("Ticket nicht gefunden.");

  const open = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket_reminder
        WHERE ticket_id = ? AND user_id = ? AND is_done = 0`,
    )
    .get(ticketId, user.id) as { count: number };

  if (open.count >= MAX_PER_TICKET) {
    throw new ReminderError(
      "Für dieses Ticket sind schon genug Erinnerungen offen.",
    );
  }

  const reminder = MITSTicketReminderSchema.parse({
    id: randomUUID(),
    ticket_id: ticketId,
    user_id: user.id,
    due_at: dueAt.toISOString(),
    note: note.trim().slice(0, 500),
    is_done: false,
    created_at: new Date().toISOString(),
  });

  db.prepare(
    `INSERT INTO mits_ticket_reminder
       (id, ticket_id, user_id, due_at, note, is_done, created_at)
     VALUES (@id, @ticket_id, @user_id, @due_at, @note, @is_done, @created_at)`,
  ).run({ ...reminder, is_done: 0 });

  return reminder;
}

/**
 * The open reminders this user has on this ticket, soonest first.
 *
 * No visibility check: the rows are keyed on `user_id`, so the worst an unknown
 * ticket id achieves is an empty list. The check belongs on the write path, where
 * a row gets created that names something.
 */
export function listRemindersForTicket(
  ticketId: string,
  userId: string,
): MITSTicketReminder[] {
  const rows = db
    .prepare(
      `SELECT id, ticket_id, user_id, due_at, note, is_done, created_at
         FROM mits_ticket_reminder
        WHERE ticket_id = ? AND user_id = ? AND is_done = 0
        ORDER BY due_at ASC`,
    )
    .all(ticketId, userId) as ReminderRow[];

  return rows.map(rowToReminder);
}

/** The next one due, or null. What the badge on the ticket button reads. */
export function nextReminderFor(
  ticketId: string,
  userId: string,
): MITSTicketReminder | null {
  return listRemindersForTicket(ticketId, userId)[0] ?? null;
}

/**
 * What is on this person's clock: overdue first, then upcoming.
 *
 * One list rather than two, ordered by `due_at`, so „seit gestern fällig" sits
 * above „heute 16:00". Splitting them into two sections would put the thing that
 * has been waiting longest below the thing that has not happened yet.
 */
export function listUpcomingReminders(
  userId: string,
  limit = REMINDER_WIDGET_LIMIT,
): ReminderWithTicket[] {
  const rows = db
    .prepare(
      `${WITH_TICKET_SELECT}
         AND r.user_id = ?
         AND r.is_done = 0
       ORDER BY r.due_at ASC
       LIMIT ?`,
    )
    .all(userId, limit) as (ReminderRow & {
    ticket_number: number | null;
    ticket_title: string;
    ticket_status: string;
  })[];

  return rows.map(rowToWithTicket);
}

/** How many are due right now. The number on the portal widget's heading. */
export function countDueReminders(userId: string, now = new Date()): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM mits_ticket_reminder r
         JOIN mits_ticket t ON t.id = r.ticket_id
        WHERE t.deleted_at IS NULL
          AND r.user_id = ?
          AND r.is_done = 0
          AND r.due_at <= ?`,
    )
    .get(userId, now.toISOString()) as { count: number };

  return row.count;
}

/**
 * Reminders that came due inside a window.
 *
 * The notification feed's query, and the window is what makes it work without a
 * delivery flag: `due_at > since` means a reminder is reported on the first poll
 * after it came due and never again, because the client's cursor moves past it.
 * A reminder that came due while nobody was polling is still caught — the feed
 * clamps `since` to 24 hours back, which is the same lookback every other channel
 * gets.
 *
 * `is_done = 0` on top, so ticking one off before the poll arrives cancels the
 * announcement. That is the whole point of the tick.
 */
export function dueReminders(
  userId: string,
  since: string,
  now = new Date(),
): ReminderWithTicket[] {
  const rows = db
    .prepare(
      `${WITH_TICKET_SELECT}
         AND r.user_id = ?
         AND r.is_done = 0
         AND r.due_at > ?
         AND r.due_at <= ?
       ORDER BY r.due_at ASC
       LIMIT 8`,
    )
    .all(userId, since, now.toISOString()) as (ReminderRow & {
    ticket_number: number | null;
    ticket_title: string;
    ticket_status: string;
  })[];

  return rows.map(rowToWithTicket);
}

/**
 * Everybody with something due, for the cron nudge.
 *
 * Ids only. The endpoint publishes one signal per id and carries no content —
 * the same rule the whole realtime bus follows, so what each of those people is
 * then told about is still decided once, by `listNotifications`.
 */
export function usersWithDueReminders(now = new Date()): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT r.user_id AS id
         FROM mits_ticket_reminder r
         JOIN mits_ticket t ON t.id = r.ticket_id
        WHERE t.deleted_at IS NULL
          AND r.is_done = 0
          AND r.due_at <= ?`,
    )
    .all(now.toISOString()) as { id: string }[];

  return rows.map((row) => row.id);
}

/**
 * Tick one off, or put it back.
 *
 * `user_id` is in the WHERE rather than checked beforehand, so a foreign id
 * updates nothing instead of being refused — one statement, and no branch where
 * a caller forgets the check. The count tells us whether it was ours.
 */
export function setReminderDone(
  id: string,
  userId: string,
  done: boolean,
): void {
  const result = db
    .prepare(
      "UPDATE mits_ticket_reminder SET is_done = ? WHERE id = ? AND user_id = ?",
    )
    .run(done ? 1 : 0, id, userId);

  if (result.changes === 0) throw new ReminderError("Erinnerung nicht gefunden.");
}

/**
 * Remove one entirely.
 *
 * A real delete, unlike a ticket or a comment: a reminder is a private note to
 * self with no history worth keeping, and „ich wollte das doch nicht" should not
 * leave a row behind. Same `user_id` clause as above.
 */
export function deleteReminder(id: string, userId: string): void {
  const result = db
    .prepare("DELETE FROM mits_ticket_reminder WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0) throw new ReminderError("Erinnerung nicht gefunden.");
}
