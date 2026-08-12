import "server-only";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { ticketReminderMail } from "@/lib/mail-templates";
import { publish } from "@/lib/services/realtime";
import { invalidateAnalytics } from "@/lib/services/analytics-cache";
import { sendNotification, ticketUrl } from "@/lib/smtp";
import { CommentError, addComment } from "@/lib/ticket-comments";
import { getTicketUnchecked } from "@/lib/tickets";
import { applyStatusChange } from "@/lib/ticket-workflow";
import { templateValuesFor } from "@/lib/template-values";
import { getWorkflowSettings } from "@/lib/workflow-settings";
import { fillCannedResponse, type MITSTicket } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Was mit Tickets passiert, die stillstehen.

   Drei Durchgänge, alle drei einzeln abschaltbar (`0` Tage = aus, und das ist
   der Auslieferungszustand):

   1. `resolved` schließt nach der eingestellten Frist.
   2. `waiting_user` erinnert den Melder einmal.
   3. `waiting_user` schließt, wenn auf die Erinnerung nichts kam.

   ── Warum diese Datei getrennt von `lib/ticket-workflow.ts` liegt ──

   Jene ist die Senke: `lib/tickets.ts` und `lib/ticket-comments.ts` importieren
   sie, sie importiert keines von beiden. Der Sweeper braucht das Gegenteil — den
   vollständigen Ticket-Datensatz für die Mail und `addComment` für die Notiz —,
   also darf er nicht dort stehen. Ihn hier zu haben ist zyklenfrei, weil ihn
   niemand außer dem Cron-Endpunkt aufruft.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Wer im Protokoll steht, wenn die Automatik schreibt.
 *
 * Ein echter Datensatz und kein `null`: `recordAudit` und `addComment` nehmen
 * den Handelnden als Pflichtparameter, damit keine Aufrufstelle das Festhalten
 * überspringen kann. Für einen Cron gibt es keine Person, also bekommt er einen
 * Namen, den ein Mensch in der Historie richtig liest.
 *
 * `role: "agent"`, weil die Schließungsnotiz auf der Teamseite des Verlaufs
 * stehen soll — ein Hinweis der Anlage ist keine Nachricht des Melders. Die
 * leere `id` trifft absichtlich kein Konto: `toneFor` vergleicht `author_id`,
 * und die Notiz soll für **jeden** Leser die Farbe der Gegenseite haben.
 */
const AUTOMATION: SessionUser = {
  id: "",
  name: "MITS-Automatik",
  email: "",
  role: "agent",
  emailVerified: true,
  mustChangePassword: false,
};

export interface SweepResult {
  closedResolved: number;
  remindersSent: number;
  closedWaiting: number;
  /** Tickets, an denen etwas schiefging. Der Lauf geht weiter. */
  failed: number;
}

/** Der Zeitpunkt, vor dem etwas liegen muss, um fällig zu sein. */
function cutoff(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() - days);
  return at.toISOString();
}

interface Candidate {
  id: string;
  status: string;
}

/**
 * Einen Durchgang fahren.
 *
 * **Ein Fehlschlag je Ticket beendet den Lauf nicht.** Ein Sweeper, der beim
 * vierzigsten Ticket abbricht, lässt die restlichen ohne Meldung liegen — und
 * der nächste Lauf bricht an derselben Zeile wieder ab. Der Fehler geht ins
 * Containerlog und wird gezählt.
 */
async function each(
  rows: Candidate[],
  work: (row: Candidate) => Promise<void> | void,
  counters: { done: number; failed: number },
): Promise<void> {
  for (const row of rows) {
    try {
      await work(row);
      counters.done += 1;
    } catch (error) {
      counters.failed += 1;
      console.error(`[MITS] Sweeper: Ticket ${row.id} übersprungen:`, error);
    }
  }
}

/**
 * Schließen, mit Notiz im Verlauf.
 *
 * **Ohne Mail an den Melder.** Die Erinnerung hat bereits angekündigt, dass sich
 * das Ticket von selbst schließt; eine zweite Nachricht dafür wäre eine Mail für
 * das Ausbleiben einer Antwort. Für den Weg über `resolved` gilt dasselbe: dort
 * hat der Melder die Lösungsmeldung schon bekommen.
 *
 * Die Notiz ist öffentlich, damit der Melder im Ticket sieht, warum es zu ist —
 * und sie sagt, dass eine Antwort es wieder öffnet, was durch
 * `nextStatusAfterReply` auch stimmt.
 */
function closeWithNote(row: Candidate, note: string): void {
  applyStatusChange(
    row.id,
    row.status as MITSTicket["status"],
    "closed",
    AUTOMATION,
  );

  const text = note.trim();
  if (text) {
    try {
      // `skipReplyWorkflow`, sonst holte die Ballbesitz-Regel das Ticket
      // unmittelbar nach dem Schließen wieder heraus — der Schreiber ist als
      // Agent geführt, aber die Notiz ist kein Zug im Spiel.
      addComment(row.id, AUTOMATION, text, "public", "text", undefined, true);
    } catch (error) {
      // Die Notiz ist Beiwerk; das Schließen steht schon. Ein Fehlschlag hier
      // darf den Durchgang nicht als gescheitert zählen lassen.
      if (!(error instanceof CommentError)) throw error;
      console.error(`[MITS] Sweeper: Notiz an ${row.id} abgelehnt:`, error);
    }
  }

  publish({ type: "ticket", ticketId: row.id, audience: "all" });
}

async function sendReminder(
  ticket: MITSTicket,
  subject: string,
  body: string,
): Promise<void> {
  const values = templateValuesFor(ticket, AUTOMATION.name);

  await sendNotification({
    to: ticket.created_by_email,
    cc: ticket.cc_emails,
    ...ticketReminderMail(
      ticket,
      fillCannedResponse(subject, values),
      fillCannedResponse(body, values),
      ticketUrl(ticket.id),
    ),
  });

  db.prepare(
    "UPDATE mits_ticket SET waiting_reminder_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), ticket.id);
}

export async function sweepWorkflow(): Promise<SweepResult> {
  const settings = getWorkflowSettings();
  const result: SweepResult = {
    closedResolved: 0,
    remindersSent: 0,
    closedWaiting: 0,
    failed: 0,
  };

  /*
   * `status_changed_at IS NOT NULL` in jedem Prädikat.
   *
   * Die Spalte wird beim ersten Start nach dem Update für alle gefüllt, aber ein
   * Ticket, das dazwischen entsteht, könnte sie theoretisch offen haben — und
   * NULL vergleicht in SQLite gegen jeden Zeitpunkt zu NULL, also nicht zu wahr.
   * Ausgeschrieben, weil ein Leser sonst prüft, ob es fehlt.
   */

  /* ── 1. Gelöst schließt ── */
  if (settings.resolvedCloseDays > 0) {
    const rows = db
      .prepare(
        `SELECT id, status FROM mits_ticket
          WHERE deleted_at IS NULL
            AND status = 'resolved'
            AND auto_close_off = 0
            AND status_changed_at IS NOT NULL
            AND status_changed_at < ?`,
      )
      .all(cutoff(settings.resolvedCloseDays)) as Candidate[];

    const counters = { done: 0, failed: 0 };
    await each(rows, (row) => closeWithNote(row, settings.autoCloseNote), counters);
    result.closedResolved = counters.done;
    result.failed += counters.failed;
  }

  /* ── 2. Erinnerung an den Melder ── */
  if (settings.waitingReminderDays > 0) {
    const rows = db
      .prepare(
        `SELECT id, status FROM mits_ticket
          WHERE deleted_at IS NULL
            AND status = 'waiting_user'
            AND auto_close_off = 0
            AND waiting_reminder_at IS NULL
            AND status_changed_at IS NOT NULL
            AND status_changed_at < ?`,
      )
      .all(cutoff(settings.waitingReminderDays)) as Candidate[];

    const counters = { done: 0, failed: 0 };
    await each(
      rows,
      async (row) => {
        const ticket = getTicketUnchecked(row.id);
        // Zwischen Abfrage und Zustellung kann das Ticket gelöscht worden sein.
        if (!ticket) return;
        await sendReminder(
          ticket,
          settings.waitingReminderSubject,
          settings.waitingReminderBody,
        );
      },
      counters,
    );
    result.remindersSent = counters.done;
    result.failed += counters.failed;
  }

  /* ── 3. Wartend schließt, gerechnet ab der Erinnerung ── */
  if (settings.waitingCloseDays > 0 && settings.waitingReminderDays > 0) {
    const rows = db
      .prepare(
        `SELECT id, status FROM mits_ticket
          WHERE deleted_at IS NULL
            AND status = 'waiting_user'
            AND auto_close_off = 0
            AND waiting_reminder_at IS NOT NULL
            AND waiting_reminder_at < ?`,
      )
      .all(cutoff(settings.waitingCloseDays)) as Candidate[];

    const counters = { done: 0, failed: 0 };
    await each(rows, (row) => closeWithNote(row, settings.autoCloseNote), counters);
    result.closedWaiting = counters.done;
    result.failed += counters.failed;
  }

  /*
   * Ein Signal für den ganzen Lauf, nicht eines pro Ticket.
   *
   * `closeWithNote` weckt schon die Seite des betroffenen Tickets; die Queue
   * interessiert nur, *dass* sich etwas bewegt hat. Ein Cron, der bei
   * vierzig geschlossenen Tickets vierzig Queue-Signale absetzt, ließe jeden
   * offenen Desk vierzigmal neu rendern.
   */
  const moved =
    result.closedResolved + result.remindersSent + result.closedWaiting;
  if (moved > 0) {
    publish({ type: "queue", audience: "staff" });
    invalidateAnalytics();
  }

  return result;
}
