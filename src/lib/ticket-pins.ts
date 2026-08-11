import "server-only";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { getTicketFor } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   Anheften: ein Ticket oben halten, für eine Person.

   **Pro Person, nie geteilt.** Ein geteilter Pin wäre ein Agent, der die Queue
   aller anderen umsortiert — und das Werkzeug dafür gibt es schon, es heißt
   Priorität und steht am Ticket. Ein Pin ist ein Lesezeichen: er sagt „ich
   komme darauf zurück", nicht „das ist dringend".

   **Der Pin hat keine Eigenschaften.** Kein Grund, keine Notiz, keine Reihung
   von Hand. Er ist da oder nicht; das Paar (Person, Ticket) ist deshalb der
   Primärschlüssel, und zweimal anheften ist derselbe Zustand wie einmal.

   **Zugriff wird beim Schreiben geprüft, nicht geerbt.** Eine Zeile, die ein
   Ticket benennt, ist schon eine Auskunft darüber, dass die Id existiert —
   dieselbe Regel wie bei den Erinnerungen, und dieselbe Tür: `getTicketFor`
   antwortet für „gibt es nicht" und „gehört dir nicht" gleich.

   Gelesen wird das Ganze **nicht** hier, sondern in `searchTickets`: ob eine
   Zeile angeheftet ist, ist eine Spalte der Queue-Abfrage und keine Schleife
   über fünfzig Einzelabfragen. Was hier steht, ist der Schreibpfad plus die eine
   Einzelfrage, die die Ticketseite stellt.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Wie viele eine Person gleichzeitig oben halten kann.
 *
 * Ein Pin heißt „im Blick behalten"; zweihundert Pins sind eine zweite Queue mit
 * denselben Zeilen und ohne deren Filter. Der Deckel ist außerdem das, was den
 * Block über der Queue klein hält — er wird auf jeder Seite gerendert.
 */
export const MAX_PINS = 20;

export class PinError extends Error {}

/** Hat diese Person dieses Ticket angeheftet? Die Frage der Ticketseite. */
export function isPinned(ticketId: string, userId: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS hit FROM mits_ticket_pin WHERE user_id = ? AND ticket_id = ?",
    )
    .get(userId, ticketId) as { hit: number } | undefined;

  return row !== undefined;
}

/** Wie viele diese Person angeheftet hat. Für die Grenze und die Überschrift. */
export function countPins(userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM mits_ticket_pin p
         JOIN mits_ticket t ON t.id = p.ticket_id
        WHERE t.deleted_at IS NULL AND p.user_id = ?`,
    )
    .get(userId) as { count: number };

  return row.count;
}

/**
 * Anheften oder lösen, je nachdem, was gerade gilt. Gibt den neuen Zustand.
 *
 * Eine Aktion für beide Richtungen und nicht zwei: der Knopf ist einer, und ein
 * getrenntes „Lösen" wäre ein zweiter Codepfad für die Rücknahme des ersten —
 * die Rücknahme ist genau das, was einen Klick ohne Rückfrage vertretbar macht.
 *
 * Der Rückgabewert erspart dem Aufrufer eine zweite Abfrage für die Beschriftung
 * des Knopfes, den er gerade gedrückt hat.
 */
export function togglePin(ticketId: string, user: SessionUser): boolean {
  /*
   * Erst lösen, dann prüfen.
   *
   * Die Reihenfolge ist Absicht: wer über der Grenze steht, muss lösen können.
   * Läge die Deckelprüfung davor, wäre der einzige Weg zurück, eine Zeile in der
   * Datenbank zu entfernen — ein Deckel, der den Ausgang mit verschließt.
   */
  const removed = db
    .prepare("DELETE FROM mits_ticket_pin WHERE user_id = ? AND ticket_id = ?")
    .run(user.id, ticketId);

  if (removed.changes > 0) return false;

  // Dieselbe Tür wie überall: `null` heißt „gibt es nicht" **und** „darfst du
  // nicht sehen", damit sich über den Unterschied keine Ids aufzählen lassen.
  const ticket = getTicketFor(ticketId, user);
  if (!ticket) throw new PinError("Ticket nicht gefunden.");

  if (countPins(user.id) >= MAX_PINS) {
    throw new PinError(
      `Mehr als ${MAX_PINS} angeheftete Tickets gehen nicht. Erst eines lösen.`,
    );
  }

  db.prepare(
    `INSERT INTO mits_ticket_pin (user_id, ticket_id, created_at)
     VALUES (?, ?, ?)`,
  ).run(user.id, ticketId, new Date().toISOString());

  return true;
}
