import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/sqlite";

/* ──────────────────────────────────────────────────────────────────────────
   Zugriffsprotokoll.

   Wer sich angemeldet hat, und wer an einem Konto etwas verändert hat, das über
   seine Kontaktdaten hinausgeht: Rolle, Anlage, zweiter Faktor. Das ist die
   Liste, nach der eine Prüfung fragt, und sie stand bisher nirgends — das
   Containerlog vergisst sie beim nächsten Neustart des Containers.

   Getrennt von `mits_audit_log`: dort ist jede Zeile die Historie **eines
   Tickets** und wird auch nur so gelesen. Siehe den Kommentar am `CREATE TABLE`.

   ── Was hier nicht steht, und warum ──

   **Gescheiterte Anmeldungen.** Better Auth wirft bei falschem Passwort einen
   `APIError`; der einzige Haken, der dabei feuert, ist `onAPIError.onError`, und
   der bekommt den `AuthContext` und nicht den Request — es ist also nicht
   feststellbar, *welche* Anmeldung gescheitert ist. Der Weg über
   `hooks.before` auf `/sign-in/email` wäre möglich, protokolliert aber den
   Versuch und nicht sein Ergebnis, und er sitzt im Anmeldepfad selbst. Bevor da
   etwas hineinkommt, gehört es einmal gegen eine laufende Instanz geprüft.
   ────────────────────────────────────────────────────────────────────────── */

export const AUTH_EVENT_ACTIONS = [
  "sign_in",
  "account_created",
  "role_changed",
  "two_factor_reset",
] as const;

export type AuthEventAction = (typeof AUTH_EVENT_ACTIONS)[number];

export const AUTH_EVENT_LABELS: Record<AuthEventAction, string> = {
  sign_in: "Anmeldung",
  account_created: "Konto angelegt",
  role_changed: "Rolle geändert",
  two_factor_reset: "Zweiter Faktor entfernt",
};

export interface AuthEvent {
  id: string;
  actorId: string;
  actorEmail: string;
  /**
   * Der gespeicherte Wert, nicht auf `AuthEventAction` verengt.
   *
   * Ein Protokoll aus einem älteren Build kann eine Kennung enthalten, die dieser
   * hier nicht führt. Sie auf einen bekannten Wert zu ziehen hieße, ein Ereignis
   * als ein anderes auszugeben — in einer Tabelle, deren einziger Zweck ist zu
   * sagen, was passiert ist. Die Beschriftung fällt stattdessen auf die rohe
   * Kennung zurück, siehe `authEventLabel`.
   */
  action: string;
  detail: string;
  createdAt: string;
}

/** Beschriftung für die Anzeige, mit der Rohkennung als Rückfallebene. */
export function authEventLabel(action: string): string {
  return (AUTH_EVENT_LABELS as Record<string, string>)[action] ?? action;
}

/** Lang genug für „user -> agent", kurz genug, dass die Liste lesbar bleibt. */
const DETAIL_LIMIT = 200;

const clip = (value: string): string =>
  value.length > DETAIL_LIMIT ? `${value.slice(0, DETAIL_LIMIT - 1)}…` : value;

/**
 * Ein Ereignis festhalten.
 *
 * **Wirft nie.** Dieselbe Regel wie bei `recordAudit`, hier aber mit mehr
 * Gewicht: der `sign_in`-Aufruf hängt im Anmeldepfad, und ein Protokoll, das
 * eine Anmeldung scheitern lassen kann, ist schlimmer als kein Protokoll. Der
 * Fehler geht ins Containerlog, die Anmeldung geht durch.
 */
export function recordAuthEvent(
  action: AuthEventAction,
  actor: { id?: string | null; email?: string | null },
  detail = "",
): void {
  try {
    db.prepare(
      `INSERT INTO mits_auth_event
         (id, actor_id, actor_email, action, detail, created_at)
       VALUES
         (@id, @actor_id, @actor_email, @action, @detail, @created_at)`,
    ).run({
      id: randomUUID(),
      actor_id: actor.id ?? "",
      actor_email: actor.email ?? "",
      action,
      detail: clip(detail),
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[mits] auth event not recorded", action, error);
  }
}

/**
 * Die jüngsten Ereignisse, neueste zuerst.
 *
 * Mit Obergrenze und ohne Blättern: die Frage an ein Zugriffsprotokoll ist fast
 * immer „was ist in letzter Zeit passiert", und eine Seite, die zehntausend
 * Zeilen rendert, beantwortet sie schlechter als eine mit zweihundert.
 */
export function listAuthEvents(limit = 200): AuthEvent[] {
  const rows = db
    .prepare(
      `SELECT id, actor_id, actor_email, action, detail, created_at
         FROM mits_auth_event
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(Math.max(1, Math.min(1000, limit))) as {
    id: string;
    actor_id: string;
    actor_email: string;
    action: string;
    detail: string;
    created_at: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

/** Wie viele Zeilen insgesamt, für die Kopfzeile der Seite. */
export function countAuthEvents(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM mits_auth_event")
    .get() as { count: number } | undefined;
  return row?.count ?? 0;
}
