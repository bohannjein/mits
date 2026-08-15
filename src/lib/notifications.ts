import "server-only";

import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { isFeatureEnabled } from "@/lib/features";
import { getNotificationSettings } from "@/lib/notification-settings";
import { dueReminders } from "@/lib/ticket-reminders";
import { formatTicketNumber } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   What happened since the client last asked.

   Derived from the tables that already exist — comments, tickets, the audit log —
   rather than from a notification table. A stored queue would need a row per user
   per event, a delivery flag, and a cleanup job, and the first writer that forgot
   to fan out would produce a notification nobody ever gets. Three bounded queries
   against indexed timestamp columns cost less than that machinery and cannot fall
   out of step with the thing they describe.

   **Visibility is re-derived here, not inherited.** Each query carries the same
   scope rule the listings use: a reporter sees events on their own tickets and
   never an internal note, an agent sees the queue. A notification that merely
   *names* a ticket somebody may not open is already a disclosure — it says the
   ticket exists.

   `since` comes from the client and is only ever a lower bound on a timestamp, so
   the worst a forged value achieves is asking for events the caller is allowed to
   see anyway, further back. It is clamped so it cannot become a full-table scan.
   ────────────────────────────────────────────────────────────────────────── */

export type NotificationKind =
  | "reply"
  | "ticket"
  | "assigned"
  | "reminder"
  | "mention";

export interface MITSNotification {
  /** Stable across polls, so the client can collapse a repeat. */
  key: string;
  kind: NotificationKind;
  title: string;
  description: string;
  href: string;
  createdAt: string;
}

/** How far back a single request may reach. */
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Enough to notice, not enough to bury the screen. */
const MAX_EVENTS = 8;

/** One line of preview. A toast is a pointer, not a reader. */
const PREVIEW_CHARS = 140;

/**
 * Strip markup and collapse whitespace for the preview line.
 *
 * A comment body may be sanitised HTML. Rendering it into a toast would mean a
 * second `dangerouslySetInnerHTML` in a component that has no reason to hold one,
 * so the tags come out here and the toast only ever receives text.
 */
function preview(body: string, format: string): string {
  const text =
    format === "html" ? body.replace(/<[^>]*>/g, " ") : body;
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_CHARS);
}

function clampSince(since: string): string {
  const parsed = Date.parse(since);
  const floor = Date.now() - MAX_LOOKBACK_MS;
  if (!Number.isFinite(parsed) || parsed < floor) {
    return new Date(floor).toISOString();
  }
  // A `since` in the future would return nothing forever; treat it as "now".
  return new Date(Math.min(parsed, Date.now())).toISOString();
}

export function listNotifications(
  user: SessionUser,
  since: string,
): MITSNotification[] {
  const from = clampSince(since);
  const staff = canViewBoard(user.role);
  const base = staff ? "/mits/tickets" : "/customer/tickets";
  const events: MITSNotification[] = [];

  /*
   * Beobachter und Erwähnungen hängen an einem Modul, und beide Zweige unten
   * fragen es einzeln ab. Zusammengefasst wäre die engere Reichweite auch dann
   * aktiv, wenn das Modul aus ist — und dann gäbe es keinen Weg, ein Abo
   * anzulegen, mit dem man sie wieder weitet. Eine Stummschaltung ohne Ausgang.
   */
  const watchers = isFeatureEnabled("feature_ticket_watchers");
  const narrowReplies =
    staff && watchers && getNotificationSettings().reply_scope === "mine";

  /*
   * Replies. Never the caller's own — being told about the message you just sent
   * is noise, and it fires on every single reply an agent writes.
   *
   * A reporter additionally gets public comments only, and only on their own
   * tickets. Both halves are in the SQL rather than filtered afterwards, so a
   * future caller cannot get the rows and forget the filter.
   */
  /*
   * Eine Erwähnung ersetzt die allgemeine Antwort-Meldung, sie kommt nicht
   * dazu. „Bea hat geantwortet" und „Bea hat dich genannt" über derselben
   * Nachricht sind zwei Einblendungen für ein Ereignis, und die zweite ist die
   * genauere.
   */
  const mentionExclusion = watchers
    ? `AND NOT EXISTS (
         SELECT 1 FROM mits_comment_mention m
          WHERE m.comment_id = c.id AND m.user_id = ?
       )`
    : "";

  /*
   * Die engere Reichweite: zugewiesen, beobachtet oder selbst gemeldet.
   *
   * Nur für Personal — ein Melder sieht ohnehin nur seine eigenen Tickets, und
   * eine zweite Verengung darüber wäre eine Einstellung, die ihm Meldungen über
   * sein eigenes Anliegen nimmt.
   */
  const replyScopeClause = narrowReplies
    ? `AND (
         t.assigned_to = ?
         OR t.created_by = ?
         OR EXISTS (
              SELECT 1 FROM mits_ticket_watch w
               WHERE w.ticket_id = t.id AND w.user_id = ?
            )
       )`
    : "";

  const replyParams: unknown[] = [from, user.id];
  if (!staff) replyParams.push(user.id);
  if (watchers) replyParams.push(user.id);
  if (narrowReplies) replyParams.push(user.id, user.id, user.id);
  replyParams.push(MAX_EVENTS);

  const replies = db
    .prepare(
      `SELECT c.id, c.author_name, c.body, c.body_format, c.created_at,
              t.id AS ticket_id, t.ticket_number, t.title
         FROM mits_ticket_comment c
         JOIN mits_ticket t ON t.id = c.ticket_id
        WHERE c.deleted_at IS NULL
          AND t.deleted_at IS NULL
          AND c.created_at > ?
          AND c.author_id <> ?
          ${staff ? "" : "AND c.visibility = 'public' AND t.created_by = ?"}
          ${mentionExclusion}
          ${replyScopeClause}
        ORDER BY c.created_at DESC
        LIMIT ?`,
    )
    .all(...replyParams) as {
    id: string;
    author_name: string;
    body: string;
    body_format: string;
    created_at: string;
    ticket_id: string;
    ticket_number: number | null;
    title: string;
  }[];

  for (const row of replies) {
    events.push({
      key: `reply:${row.id}`,
      kind: "reply",
      title: `${row.author_name} hat geantwortet`,
      description: `${row.title} — ${preview(row.body, row.body_format)}`,
      href: `${base}/${row.ticket_id}`,
      createdAt: row.created_at,
    });
  }

  if (staff) {
    // New in the pool: unassigned and still open. Not "every new ticket" — one
    // that arrived already assigned is somebody's, and the pool is what nobody
    // has picked up.
    const pool = db
      .prepare(
        `SELECT id, ticket_number, title, created_by_email, created_at
           FROM mits_ticket
          WHERE deleted_at IS NULL
            AND assigned_to IS NULL
            AND status = 'open'
            AND created_at > ?
            AND created_by <> ?
          ORDER BY created_at DESC
          LIMIT ?`,
      )
      .all(from, user.id, MAX_EVENTS) as {
      id: string;
      ticket_number: number | null;
      title: string;
      created_by_email: string;
      created_at: string;
    }[];

    for (const row of pool) {
      events.push({
        key: `ticket:${row.id}`,
        kind: "ticket",
        title: "Neues Ticket im Pool",
        description: `${formatTicketNumber(row.ticket_number ?? 0)} · ${row.title}`,
        href: `${base}/${row.id}`,
        createdAt: row.created_at,
      });
    }

    /*
     * Assigned to me, by somebody else.
     *
     * Read from the audit log joined against the ticket's *current* assignee. The
     * log alone is not enough — it records the assignment as a display name, and a
     * later reassignment would leave a stale entry that still claims the ticket is
     * mine. Requiring `assigned_to = me` now means a ticket handed on before the
     * next poll never announces itself, which is the correct outcome.
     */
    const assigned = db
      .prepare(
        `SELECT a.id, a.created_at, t.id AS ticket_id, t.ticket_number, t.title
           FROM mits_audit_log a
           JOIN mits_ticket t ON t.id = a.ticket_id
          WHERE a.action = 'assigned'
            AND a.created_at > ?
            AND a.actor_id <> ?
            AND t.assigned_to = ?
            AND t.deleted_at IS NULL
          ORDER BY a.created_at DESC
          LIMIT ?`,
      )
      .all(from, user.id, user.id, MAX_EVENTS) as {
      id: string;
      created_at: string;
      ticket_id: string;
      ticket_number: number | null;
      title: string;
    }[];

    for (const row of assigned) {
      events.push({
        key: `assigned:${row.id}`,
        kind: "assigned",
        title: "Ticket dir zugewiesen",
        description: `${formatTicketNumber(row.ticket_number ?? 0)} · ${row.title}`,
        href: `${base}/${row.ticket_id}`,
        createdAt: row.created_at,
      });
    }

    /*
     * Erwähnt.
     *
     * Die Tabelle ist der Grund, aus dem das hier ein Join und keine Textsuche
     * ist: der Beitrag trägt den Anzeigenamen, die Zeile die Id. Aus dem Text
     * zurückzulesen wäre bei zwei Kolleginnen mit demselben Vornamen falsch —
     * und zwar in die Richtung, in der jemand eine Meldung über ein Gespräch
     * bekommt, in dem er nicht gemeint war.
     *
     * Kein Sichtbarkeitszusatz: erwähnbar sind nur Agenten, und die sehen jede
     * Notiz auf jedem Ticket. Die Zeile selbst ist die Berechtigung.
     */
    if (watchers) {
      const mentions = db
        .prepare(
          `SELECT c.id, c.author_name, c.body, c.body_format, c.created_at,
                  t.id AS ticket_id, t.ticket_number, t.title
             FROM mits_comment_mention m
             JOIN mits_ticket_comment c ON c.id = m.comment_id
             JOIN mits_ticket t ON t.id = c.ticket_id
            WHERE m.user_id = ?
              AND c.deleted_at IS NULL
              AND t.deleted_at IS NULL
              AND c.created_at > ?
              AND c.author_id <> ?
            ORDER BY c.created_at DESC
            LIMIT ?`,
        )
        .all(user.id, from, user.id, MAX_EVENTS) as {
        id: string;
        author_name: string;
        body: string;
        body_format: string;
        created_at: string;
        ticket_id: string;
        ticket_number: number | null;
        title: string;
      }[];

      for (const row of mentions) {
        events.push({
          key: `mention:${row.id}`,
          kind: "mention",
          title: `${row.author_name} hat dich genannt`,
          description: `${row.title} — ${preview(row.body, row.body_format)}`,
          href: `${base}/${row.ticket_id}`,
          createdAt: row.created_at,
        });
      }
    }
  }

  /*
   * Reminders this reader set on themselves, now due.
   *
   * Every role, not staff only: a reporter who put „Freitag nachfragen" on their
   * own ticket is the most reasonable use of the feature there is.
   *
   * The event's timestamp is `due_at`, not the row's `created_at`, and that is
   * what makes the cursor work: a reminder set last week and due in ten minutes
   * has to be *new* now, and a `created_at` outside the lookback window would
   * mean it was never reported at all. The cursor then moves past it, so it is
   * announced exactly once.
   *
   * No self-exclusion clause, unlike the three queries above. Those skip events
   * the caller caused because being told about your own reply is noise; here the
   * caller causing it is the entire point.
   */
  if (isFeatureEnabled("feature_ticket_reminders")) {
    for (const reminder of dueReminders(user.id, from)) {
      events.push({
        key: `reminder:${reminder.id}`,
        kind: "reminder",
        title: "Erinnerung fällig",
        description: reminder.note
          ? `${formatTicketNumber(reminder.ticket_number)} · ${reminder.note}`
          : `${formatTicketNumber(reminder.ticket_number)} · ${reminder.ticket_title}`,
        href: `${base}/${reminder.ticket_id}`,
        createdAt: reminder.due_at,
      });
    }
  }

  // Oldest first, so the newest ends up at the bottom of the stack where the eye
  // already is — the same order the conversation reads in.
  return events
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-MAX_EVENTS);
}
