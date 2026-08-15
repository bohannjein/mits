import "server-only";

import { canViewBoard, type MITSRole } from "@/lib/auth/roles";
import { db } from "@/lib/db/sqlite";
import { listPresence } from "@/lib/presence";
import { listAgentCapacities } from "@/lib/team-settings";
import { AWAITING_REPLY_SQL } from "@/lib/tickets";
import {
  OPEN_TICKET_STATUSES,
  type PresenceState,
  type TeamSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Die Zahlen hinter /mits/team.

   Vier Reads, jeder aggregiert in SQL. Das ist die eine Entscheidung, die diese
   Datei trägt: die naheliegende Fassung wäre eine Schleife über die Agenten mit
   `countSearchTickets` je Person, und die kostet auf einem Desk mit zwölf Leuten
   zwölf Abfragen für eine Zahl, die eine `GROUP BY`-Zeile liefert. Bei jedem
   Realtime-Signal.

   **Abgeschaltet heißt nicht berechnet.** Jede Abfrage hängt an ihrem Schalter
   aus `TeamSettings`. Eine ausgeblendete Kennzahl, die trotzdem läuft, ist eine
   Auskunft, die weiter entsteht — und der Unterschied zwischen „wir zeigen das
   nicht" und „wir erheben das nicht" ist genau der, nach dem jemand fragt.

   **Alles UTC**, wie in der Statistik. „Heute abgeschlossen" vergleicht den
   ISO-Präfix; die Anzeige-Zeitzone ist eine Render-Einstellung und greift hier
   absichtlich nicht durch. Die Seite sagt es einmal, statt die Grenze zweimal im
   Jahr still zu verschieben.
   ────────────────────────────────────────────────────────────────────────── */

/** Was liegen bleibt — keine Aussage über eine Person. */
export interface TeamBacklog {
  /** Offen und niemandem zugewiesen. */
  pool: number;
  /** Ältestes davon, als ISO-Zeitstempel. `null` wenn der Pool leer ist. */
  poolOldest: string | null;
  /** Der geteilte Marker aus der Queue-Zeile, über den ganzen Bestand gezählt. */
  awaitingReply: number;
  /** Offen und seit `stale_days` ohne Nachricht. */
  stale: number;
  /** Offen und kritisch, egal bei wem. */
  critical: number;
}

export interface TeamMemberLoad {
  open: number;
  high: number;
  critical: number;
  /** Ältestes offenes Ticket dieser Person, als ISO-Zeitstempel. */
  oldest: string | null;
}

export interface TeamCurrentWork {
  ticketId: string;
  ticketNumber: number | null;
  title: string;
  at: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: MITSRole;
  state: PresenceState;
  seenAt: string | null;
  load: TeamMemberLoad;
  /** Der Maßstab für den Balken. */
  capacity: number;
  /** Ob das der Instanzwert ist oder eine eigene Zahl für dieses Konto. */
  capacityIsDefault: boolean;
  resolvedToday: number;
  current: TeamCurrentWork | null;
}

export interface TeamOverview {
  backlog: TeamBacklog | null;
  members: TeamMember[];
}

const EMPTY_LOAD: TeamMemberLoad = { open: 0, high: 0, critical: 0, oldest: null };

/**
 * So viele Audit-Zeilen schaut „arbeitet gerade an" höchstens an.
 *
 * Das Fenster ist ohnehin klein (Default 30 Minuten), der Deckel fängt nur den
 * Ausnahmefall ab, dass ein Massenvorgang es füllt. Er degradiert in die
 * harmlose Richtung: eine Person bekommt dann keine Zeile statt einer falschen.
 */
const CURRENT_WORK_ROW_CAP = 400;

/** `?,?` für `OPEN_TICKET_STATUSES` — die Länge kommt aus der Konstante, nicht aus einer 2. */
const openStatusPlaceholders = OPEN_TICKET_STATUSES.map(() => "?").join(", ");

function isoDaysAgo(days: number, now: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoMinutesAgo(minutes: number, now: number): string {
  return new Date(now - minutes * 60 * 1000).toISOString();
}

/** UTC-Mitternacht des laufenden Tages. */
function startOfUtcDay(now: number): string {
  return `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function backlogFor(settings: TeamSettings, now: number): TeamBacklog {
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END)   AS pool,
         MIN(CASE WHEN assigned_to IS NULL THEN created_at END) AS pool_oldest,
         SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) AS critical
         FROM mits_ticket
        WHERE deleted_at IS NULL
          AND status IN (${openStatusPlaceholders})`,
    )
    .get(...OPEN_TICKET_STATUSES) as {
    pool: number | null;
    pool_oldest: string | null;
    critical: number | null;
  };

  /*
   * Derselbe Ausdruck, den die Queue-Zeile als Marker rendert — importiert und
   * nicht abgeschrieben. Zwei Definitionen von „wartet ein Kunde auf uns" wären
   * zwei Zahlen, die sich widersprechen, sobald jemand sie nebeneinander legt.
   *
   * Die Tabelle darf hier deshalb keinen Alias bekommen: der Ausdruck nennt
   * `mits_ticket` beim Namen.
   */
  const awaiting = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM mits_ticket
        WHERE mits_ticket.deleted_at IS NULL
          AND mits_ticket.status IN (${openStatusPlaceholders})
          AND ${AWAITING_REPLY_SQL} = 1`,
    )
    .get(...OPEN_TICKET_STATUSES) as { n: number };

  /*
   * „Ohne Bewegung" heißt: seit N Tagen keine Nachricht. Nicht `updated_at` —
   * eine Statusänderung oder ein gesetztes Tag ist keine Bewegung im Vorgang,
   * und ein Ticket, das dadurch aus der Liste fiele, wäre genau das, was diese
   * Zahl finden soll.
   *
   * `stale_days = 0` schaltet die Zahl ab, statt jedes offene Ticket zu zählen.
   */
  const stale =
    settings.stale_days > 0
      ? (
          db
            .prepare(
              `SELECT COUNT(*) AS n
                 FROM mits_ticket
                WHERE mits_ticket.deleted_at IS NULL
                  AND mits_ticket.status IN (${openStatusPlaceholders})
                  AND COALESCE((
                        SELECT MAX(c.created_at)
                          FROM mits_ticket_comment c
                         WHERE c.ticket_id = mits_ticket.id
                           AND c.deleted_at IS NULL
                      ), mits_ticket.created_at) < ?`,
            )
            .get(...OPEN_TICKET_STATUSES, isoDaysAgo(settings.stale_days, now)) as {
            n: number;
          }
        ).n
      : 0;

  return {
    pool: counts.pool ?? 0,
    poolOldest: counts.pool_oldest,
    awaitingReply: awaiting.n,
    stale,
    critical: counts.critical ?? 0,
  };
}

/**
 * Offene Last je Bearbeiter — eine Zeile pro Person, in einer Abfrage.
 *
 * Unzugewiesene Tickets fallen bewusst heraus: sie sind der Rückstand und nicht
 * die Last von jemandem. Ein `GROUP BY` über `NULL` würde sie zu einer
 * anonymen Zeile machen, die dann in der Liste der Personen stünde.
 */
function loadByAgent(): Map<string, TeamMemberLoad> {
  const rows = db
    .prepare(
      `SELECT assigned_to                                        AS user_id,
              COUNT(*)                                           AS open_count,
              SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) AS high_count,
              SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) AS critical_count,
              MIN(created_at)                                    AS oldest
         FROM mits_ticket
        WHERE deleted_at IS NULL
          AND assigned_to IS NOT NULL
          AND status IN (${openStatusPlaceholders})
        GROUP BY assigned_to`,
    )
    .all(...OPEN_TICKET_STATUSES) as {
    user_id: string;
    open_count: number;
    high_count: number | null;
    critical_count: number | null;
    oldest: string | null;
  }[];

  return new Map(
    rows.map((row) => [
      row.user_id,
      {
        open: row.open_count,
        high: row.high_count ?? 0,
        critical: row.critical_count ?? 0,
        oldest: row.oldest,
      },
    ]),
  );
}

/**
 * Heute abgeschlossen, je Akteur.
 *
 * Am **Akteur im Audit-Log** und nicht an `assigned_to`, wie in der Statistik:
 * wer geklickt hat, hat es getan, und ein Ticket wechselt vor dem Abschluss auch
 * mal zweimal den Besitzer.
 *
 * **Kein `LIMIT`**, anders als `resolvedPerAgent` in `lib/analytics/queries.ts`.
 * Dort ist die Liste ein Ranking und acht Zeilen sind die Aussage; hier ist sie
 * eine Zeile pro anwesender Person, und ein Deckel schnitte ab elf Agenten
 * jemanden ab — mit einer Null, die wie ein Arbeitstag ohne Abschluss aussieht.
 *
 * `IN ('closed', 'resolved')`, weil der Audit-Log nicht migriert wird. Für ein
 * Tagesfenster ist das fast immer belanglos und genau deshalb die Stelle, an der
 * man es vergisst.
 */
function resolvedToday(now: number): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT actor_id AS user_id, COUNT(DISTINCT ticket_id) AS n
         FROM mits_audit_log
        WHERE action = 'status_changed'
          AND new_value IN ('closed', 'resolved')
          AND created_at >= ?
        GROUP BY actor_id`,
    )
    .all(startOfUtcDay(now)) as { user_id: string; n: number }[];

  return new Map(rows.map((row) => [row.user_id, row.n]));
}

/**
 * Woran jemand zuletzt gearbeitet hat.
 *
 * **Abgeleitet, nicht geschrieben.** Die naheliegende Fassung wäre eine Spalte
 * an `mits_presence`, und sie wäre ein zweiter Schreiber, den der nächste
 * Mutationspfad vergisst — das Fehlerbild ist ein Agent, der laut Übersicht seit
 * Stunden am selben Ticket sitzt, das er längst geschlossen hat.
 *
 * Der Audit-Log trägt es bereits: `comment_added` steht dort, eine Antwort zählt
 * also mit. Gelesen wird das jüngste Ereignis je Akteur innerhalb des Fensters.
 */
function currentWork(minutes: number, now: number): Map<string, TeamCurrentWork> {
  const rows = db
    .prepare(
      `SELECT a.actor_id AS user_id, a.ticket_id, a.created_at,
              t.ticket_number, t.title
         FROM mits_audit_log a
         JOIN mits_ticket t ON t.id = a.ticket_id
        WHERE a.created_at >= ?
          AND t.deleted_at IS NULL
        ORDER BY a.created_at DESC
        LIMIT ?`,
    )
    .all(isoMinutesAgo(minutes, now), CURRENT_WORK_ROW_CAP) as {
    user_id: string;
    ticket_id: string;
    created_at: string;
    ticket_number: number | null;
    title: string;
  }[];

  // Absteigend sortiert, also ist der erste Treffer je Person der jüngste.
  const out = new Map<string, TeamCurrentWork>();
  for (const row of rows) {
    if (out.has(row.user_id)) continue;
    out.set(row.user_id, {
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      title: row.title,
      at: row.created_at,
    });
  }
  return out;
}

/**
 * Die ganze Seite in einem Aufruf.
 *
 * `now` als Parameter, damit die Zeitgrenzen aller vier Abfragen dieselben sind
 * — mit vier `Date.now()` läge zwischen „heute" und „ohne Bewegung" ein paar
 * Millisekunden Unterschied, und das ist eine Fehlerklasse, die nur unter Last
 * auftritt.
 */
export function collectTeamOverview(
  settings: TeamSettings,
  now: number = Date.now(),
): TeamOverview {
  const backlog = settings.show_backlog ? backlogFor(settings, now) : null;

  if (!settings.show_workload) return { backlog, members: [] };

  /*
   * Gefiltert wird in JavaScript und nicht in SQL, und das ist kein Versehen.
   *
   * `listPresence` liest die Rolle roh und schickt sie durch `toRole`; ein
   * Konto, dessen Zeile noch `technician` sagt — aus einem Backup von vor der
   * Umbenennung —, ist danach ein Agent. Ein `WHERE role IN ('agent','admin')`
   * würde es übergehen, und das Fehlerbild wäre eine Person, die in der Queue
   * arbeitet und in der Team-Übersicht nicht vorkommt. Dieselbe Falle, für die
   * `LEGACY_ROLES` existiert.
   */
  const staff = listPresence().filter((row) => canViewBoard(row.role));

  const loads = loadByAgent();
  const capacities = listAgentCapacities();
  const resolved = settings.show_resolved_today ? resolvedToday(now) : null;
  const working = settings.show_current_ticket
    ? currentWork(settings.current_work_minutes, now)
    : null;

  const members: TeamMember[] = staff.map((row) => {
    const own = capacities.get(row.id);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      state: row.state,
      seenAt: row.seenAt ? row.seenAt.toISOString() : null,
      load: loads.get(row.id) ?? EMPTY_LOAD,
      capacity: own ?? settings.default_capacity,
      capacityIsDefault: own === undefined,
      resolvedToday: resolved?.get(row.id) ?? 0,
      current: working?.get(row.id) ?? null,
    };
  });

  /*
   * Die Last absteigend, bei Gleichstand der Name.
   *
   * Beide Enden der Liste sind die interessanten: oben, wer zu viel hat, unten,
   * wer etwas nehmen kann. Nach Präsenz zu sortieren wäre die Reihenfolge der
   * Sidebar-Liste und beantwortet eine andere Frage — und wer offline ist,
   * verschwindet damit unter den Leuten, deren Tickets trotzdem liegen.
   */
  members.sort(
    (a, b) => b.load.open - a.load.open || a.name.localeCompare(b.name, "de"),
  );

  return { backlog, members };
}
