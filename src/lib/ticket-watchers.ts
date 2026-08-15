import "server-only";

import { db } from "@/lib/db/sqlite";

/* ──────────────────────────────────────────────────────────────────────────
   Einem Ticket folgen, ohne es zu besitzen.

   **Der Gewinn ist Ruhe, nicht das Abo.** Ein Agent bekommt heute eine
   Einblendung für *jede* Antwort auf *jedes* Ticket der Instanz — der
   `reply`-Zweig in `lib/notifications.ts` hat für Personal keine Einschränkung.
   Erst mit dieser Tabelle gibt es einen Zwischenzustand zwischen „alles" und
   „nur was mir zugewiesen ist", und `reply_scope` in den
   Benachrichtigungseinstellungen ist die Stelle, an der ein Desk ihn wählt.

   **Automatisch, nicht nur von Hand.** Wer zugewiesen wird, wer schreibt und
   wer erwähnt wird, folgt danach. Ein Beobachter-Feature, das ausschließlich
   über einen Knopf gepflegt wird, pflegt niemand — und ein leeres Abo macht die
   engere Einstellung zu einer Stummschaltung.

   ⚠️ **Diese Datei ist eine Senke und importiert `lib/tickets.ts` nicht.**
   Das ist der Unterschied zu `lib/ticket-pins.ts`, das `getTicketFor` selbst
   ruft: dort geht der Pfeil nur in eine Richtung, hier ruft `assignTicket`
   seinerseits `watchTicket`. Beides zusammen wäre ein Importzyklus. Die
   Zugriffsprüfung liegt deshalb eine Ebene höher, in `app/actions/watchers.ts`
   — dieselbe Tür (`getTicketFor`), nur an einer anderen Stelle.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Folgen. Idempotent, damit die automatischen Aufrufer nichts prüfen müssen.
 *
 * `DO NOTHING` und nicht `DO UPDATE`: der Zeitpunkt, ab dem jemand folgt, ist
 * die eine Angabe auf der Zeile, und ein zweiter Kommentar desselben Agenten
 * soll sie nicht nach vorne schieben.
 */
export function watchTicket(ticketId: string, userId: string): void {
  db.prepare(
    `INSERT INTO mits_ticket_watch (user_id, ticket_id, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, ticket_id) DO NOTHING`,
  ).run(userId, ticketId, new Date().toISOString());
}

export function unwatchTicket(ticketId: string, userId: string): void {
  db.prepare(
    "DELETE FROM mits_ticket_watch WHERE user_id = ? AND ticket_id = ?",
  ).run(userId, ticketId);
}

/** Die Frage der Ticketseite. In der Queue ist es eine Spalte, keine Schleife. */
export function isWatching(ticketId: string, userId: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS hit FROM mits_ticket_watch WHERE user_id = ? AND ticket_id = ?",
    )
    .get(userId, ticketId) as { hit: number } | undefined;

  return row !== undefined;
}

/**
 * Wer diesem Ticket folgt.
 *
 * Mit Namen, damit die Ticketseite sie nennen kann. `LEFT JOIN` wie bei der
 * Präsenz: ein Konto ohne Namen fällt auf seine Adresse zurück statt aus der
 * Liste, und eine Zeile, deren Konto es nicht mehr gibt, verschwindet.
 */
export function listWatchers(
  ticketId: string,
): { id: string; name: string }[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email
         FROM mits_ticket_watch w
         JOIN user u ON u.id = w.user_id
        WHERE w.ticket_id = ?
        ORDER BY w.created_at ASC`,
    )
    .all(ticketId) as { id: string; name: string | null; email: string }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() || row.email,
  }));
}

/* ──────────────────────────────────────────────────────────────────────────
   Erwähnungen.

   Der Beitragstext trägt den Anzeigenamen, die Tabelle die Id. Den Namen später
   aus dem Text zurückzulesen wäre die zweite Wahrheit — und sie wäre bei zwei
   Kolleginnen mit demselben Vornamen falsch.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Erwähnungen festhalten und die Erwähnten dem Ticket folgen lassen.
 *
 * Beides in einer Transaktion, weil das Zweite ohne das Erste eine Zeile ist,
 * die niemand erklären kann: jemand folgt einem Ticket, ohne dass irgendwo
 * steht, warum.
 *
 * `ON CONFLICT DO NOTHING`: zweimal dieselbe Person im selben Beitrag zu nennen
 * ist derselbe Zustand, und der Aufrufer soll die Liste nicht entdoppeln müssen.
 */
export const recordMentions = db.transaction(
  (commentId: string, ticketId: string, userIds: string[]): void => {
    const insertMention = db.prepare(
      `INSERT INTO mits_comment_mention (comment_id, user_id)
       VALUES (?, ?)
       ON CONFLICT(comment_id, user_id) DO NOTHING`,
    );

    for (const userId of userIds) {
      insertMention.run(commentId, userId);
      watchTicket(ticketId, userId);
    }
  },
);
