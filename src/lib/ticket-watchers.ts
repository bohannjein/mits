import "server-only";

import { db } from "@/lib/db/sqlite";

// ⚠️ Senke: importiert `lib/tickets.ts` **nicht** — `assignTicket` ruft
// `watchTicket`, beides zusammen wäre ein Zyklus. Die Zugriffsprüfung liegt
// deshalb in `app/actions/watchers.ts`. Begründungen in
// .claude/rules/watchers.md.

/** Idempotent. `DO NOTHING`, damit ein zweiter Beitrag den Zeitpunkt behält. */
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

/** Die Frage der Ticketseite. In der Queue ist es eine Spalte. */
export function isWatching(ticketId: string, userId: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS hit FROM mits_ticket_watch WHERE user_id = ? AND ticket_id = ?",
    )
    .get(userId, ticketId) as { hit: number } | undefined;

  return row !== undefined;
}

/** Ein Konto ohne Namen fällt auf seine Adresse zurück. */
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

/**
 * Erwähnung festhalten und den Erwähnten folgen lassen — in einer Transaktion.
 *
 * Der Text trägt den Anzeigenamen, die Zeile die Id: zurückzulesen wäre bei zwei
 * Kolleginnen mit demselben Vornamen falsch.
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
