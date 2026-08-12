import "server-only";

import { recordAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { invalidateAnalytics } from "@/lib/services/analytics-cache";
import { publish } from "@/lib/services/realtime";
import { getWorkflowSettings } from "@/lib/workflow-settings";
import {
  TicketStatus,
  nextStatusAfterReply,
  type TicketStatus as TicketStatusValue,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ballbesitz: Zuweisung und Status folgen dem Schreiben.

   Vorher war beides Handarbeit, und das Ergebnis stimmte deshalb selten mit der
   Wirklichkeit überein: ein Agent antwortete einem Melder, und das Ticket lag
   danach weiter unzugewiesen und „Offen" im Eingang.

   ── Warum diese Datei aus keinem der beiden Ticket-Module importiert ──

   `lib/tickets.ts` und `lib/ticket-comments.ts` sind Geschwister: keines kennt
   das andere, die Action-Schicht holt aus beiden. `assignTicket` und
   `setTicketStatus` von `addComment` aus aufzurufen wäre die erste Kante
   zwischen ihnen — und sie zeigte in die Richtung, in der später der Zyklus
   entsteht. `reopenIfClosed` schrieb aus genau dem Grund schon immer selbst.

   Diese Datei ist deshalb die *Senke*: beide importieren sie, sie importiert
   keines von beiden. Der Sweeper, der einen vollständigen Ticket-Datensatz für
   die Mail braucht, liegt aus demselben Grund in `lib/ticket-sweeper.ts` — er
   darf `lib/tickets.ts` benutzen, weil ihn niemand von dort aus aufruft.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Status schreiben, protokollieren, Uhren stellen.
 *
 * Die eine Stelle, die `status` anfasst — `setTicketStatus`, die Automatik beim
 * Antworten und der Sweeper gehen alle hier durch. Ein Schreiber daneben würde
 * `status_changed_at` stehen lassen, und das Fehlerbild wäre ein Ticket, das nie
 * oder sofort verfällt: ein halbes Jahr alter Zeitstempel an einem Status von
 * heute.
 *
 * **`waiting_reminder_at` wird bei jedem Wechsel geleert.** Der Stempel gehört
 * zu *einer* Wartephase. Bliebe er stehen, hätte ein Ticket, das erneut auf
 * „Wartet auf Anwender" geht, seine Erinnerung schon hinter sich — und die
 * zweite Frist liefe ab einem Datum, das zu einer anderen Frage gehört.
 *
 * Ruft `announce` **nicht** auf: die drei Aufrufstellen signalisieren
 * unterschiedlich viel, und ein Sweeper, der pro Ticket den halben Bus weckt,
 * wäre ein Cron mit Nebenwirkungen.
 */
export function applyStatusChange(
  ticketId: string,
  from: TicketStatusValue,
  to: TicketStatusValue,
  actor: SessionUser,
): void {
  if (from === to) return;

  db.prepare(
    `UPDATE mits_ticket
        SET status = ?, status_changed_at = ?, waiting_reminder_at = NULL
      WHERE id = ?`,
  ).run(to, new Date().toISOString(), ticketId);

  recordAudit(ticketId, actor, "status_changed", {
    field: "status",
    from,
    to,
  });
}

/**
 * Was ein Beitrag am Ticket bewegt hat — für die Meldung an den Aufrufer.
 *
 * Beide Felder sind `null`, wenn nichts passiert ist. Das ist nicht dasselbe wie
 * „auf den alten Wert gesetzt": der Aufrufer schreibt dann gar nicht, es gibt
 * also keine Historienzeile für einen Vorgang ohne Wirkung.
 */
export interface ReplyWorkflowResult {
  assignedTo: string | null;
  status: TicketStatusValue | null;
}

/**
 * Beanspruchen und umschalten, nach einer **öffentlichen** Antwort.
 *
 * Aufgerufen aus `addComment` und nicht aus der Server Action — genau der Grund,
 * aus dem `reopenIfClosed` schon dort stand: der häufigste Weg für eine
 * Melderantwort ist die Antwortmail auf die Schließungsnachricht, und die
 * berührt nie eine Action.
 *
 * Zwei Dinge, in dieser Reihenfolge:
 *
 * 1. **Beanspruchen**, wenn ein Agent öffentlich antwortet und niemand das
 *    Ticket hält. „Niemand" ist die ganze Bedingung — wer es schon hat, behält
 *    es, auch wenn ein Kollege dazwischenschreibt.
 * 2. **Umschalten** nach `nextStatusAfterReply`.
 *
 * Die Reihenfolge entscheidet nichts mehr am Ergebnis, seit „in Bearbeitung"
 * abgeleitet wird und nicht mehr als eigener Statuswert existiert. Sie bleibt,
 * weil sie die Zuweisung an die Regel weiterreicht — der Parameter dort ist
 * ungenutzt und ausdrücklich als solcher markiert.
 *
 * Interne Notizen kommen hier nie an; das prüft der Aufrufer, weil die
 * Sichtbarkeit schon darüber entscheidet, ob überhaupt jemand am Zug ist.
 *
 * **Keine Rollenprüfung am Zuweisungsziel.** `assignTicket` hat eine, und sie
 * gehört dort hin: die Maske kann jeden Wert schicken. Hier ist das Ziel der
 * Schreiber selbst, und `byAgent` bedeutet bereits `canViewBoard(role)` —
 * dieselbe Frage ein zweites Mal zu stellen hieße, zwei Antworten darauf zu
 * haben.
 */
export function applyReplyWorkflow(
  ticketId: string,
  actor: SessionUser,
  byAgent: boolean,
): ReplyWorkflowResult {
  const settings = getWorkflowSettings();
  const result: ReplyWorkflowResult = { assignedTo: null, status: null };

  const row = db
    .prepare(
      `SELECT status, assigned_to FROM mits_ticket
        WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(ticketId) as { status: string; assigned_to: string | null } | undefined;

  if (!row) return result;

  // Ein Statuswert, den dieser Build nicht kennt, fällt aus der Automatik heraus
  // statt sie zu werfen — eine aus einem Backup zurückgespielte Zeile darf keine
  // Antwort scheitern lassen, die längst gespeichert ist.
  const current = TicketStatus.safeParse(row.status);
  if (!current.success) return result;

  let assignee = row.assigned_to;

  if (settings.claimOnReply && byAgent && !assignee) {
    db.prepare("UPDATE mits_ticket SET assigned_to = ? WHERE id = ?").run(
      actor.id,
      ticketId,
    );
    recordAudit(ticketId, actor, "assigned", {
      field: "assigned_to",
      from: "",
      to: actor.name,
    });
    assignee = actor.id;
    result.assignedTo = actor.id;
  }

  if (settings.statusFollowsReply) {
    const next = nextStatusAfterReply(current.data, byAgent, Boolean(assignee));
    if (next) {
      applyStatusChange(ticketId, current.data, next, actor);
      result.status = next;
    }
  }

  /*
   * Ein Signal nur, wenn wirklich etwas passiert ist. Die Antwort selbst
   * signalisiert `addComment` ohnehin; hier geht es um die Queue, in der das
   * Ticket gerade den Tab gewechselt hat.
   *
   * `invalidateAnalytics` aus demselben Grund wie in `announce`: der Zeitpunkt,
   * an dem jemand auf die Kennzahlen sieht, ist direkt nach dem Schließen oder
   * Übernehmen eines Tickets, und die halbe Minute Cache ist genau die
   * Veralterung, die wie ein Fehler aussieht.
   */
  if (result.assignedTo || result.status) {
    publish({ type: "queue", audience: "staff", actorId: actor.id });
    invalidateAnalytics();
  }

  // Zugewiesen zu werden ist die eine Zustandsänderung, über die jemand eine
  // Meldung bekommt — hier allerdings hat sich der Empfänger selbst zugewiesen,
  // also gibt es niemanden zu wecken. Bewusst kein `notify`.

  return result;
}
