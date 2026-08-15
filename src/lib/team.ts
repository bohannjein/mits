import "server-only";

import { canViewBoard, type MITSRole } from "@/lib/auth/roles";
import { db } from "@/lib/db/sqlite";
import { listPresence } from "@/lib/presence";
import { listAgentCapacities } from "@/lib/team-settings";
import { SORT_SQL } from "@/lib/ticket-sort";
import { AWAITING_REPLY_SQL } from "@/lib/tickets";
import {
  OPEN_TICKET_STATUSES,
  type PresenceState,
  type TeamSettings,
  type TicketPriority,
} from "@/types/mits";

// Die Zahlen hinter /mits/team. Alles UTC, wie in der Statistik.
// Begründungen in .claude/rules/team.md.

export interface TeamBacklog {
  pool: number;
  poolOldest: string | null;
  awaitingReply: number;
  stale: number;
  critical: number;
}

export interface TeamMemberLoad {
  open: number;
  high: number;
  critical: number;
  oldest: string | null;
}

export interface TeamCurrentWork {
  ticketId: string;
  ticketNumber: number | null;
  title: string;
  at: string;
}

export interface TeamTicket {
  id: string;
  ticketNumber: number | null;
  title: string;
  priority: TicketPriority;
  createdAt: string;
}

export interface TeamPool {
  tickets: TeamTicket[];
  /** Alle unzugewiesenen, auch die nicht gezeigten. */
  total: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: MITSRole;
  state: PresenceState;
  seenAt: string | null;
  load: TeamMemberLoad;
  capacity: number;
  capacityIsDefault: boolean;
  resolvedToday: number;
  current: TeamCurrentWork | null;
  tickets: TeamTicket[];
}

export interface TeamOverview {
  backlog: TeamBacklog | null;
  members: TeamMember[];
  pool: TeamPool | null;
}

const EMPTY_LOAD: TeamMemberLoad = { open: 0, high: 0, critical: 0, oldest: null };

const CURRENT_WORK_ROW_CAP = 400;

// Was ein Deckel wegschneidet, nennt die Zeile als Zahl („und 9 weitere").
const ASSIGNED_ROW_CAP = 600;
const PER_MEMBER_CAP = 25;
const POOL_CAP = 50;

const PRIORITY_RANK_SQL = SORT_SQL.priority;

const openStatusPlaceholders = OPEN_TICKET_STATUSES.map(() => "?").join(", ");

function isoDaysAgo(days: number, now: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoMinutesAgo(minutes: number, now: number): string {
  return new Date(now - minutes * 60 * 1000).toISOString();
}

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

  // `AWAITING_REPLY_SQL` nennt `mits_ticket` beim Namen — kein Alias hier.
  const awaiting = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM mits_ticket
        WHERE mits_ticket.deleted_at IS NULL
          AND mits_ticket.status IN (${openStatusPlaceholders})
          AND ${AWAITING_REPLY_SQL} = 1`,
    )
    .get(...OPEN_TICKET_STATUSES) as { n: number };

  // „Ohne Bewegung" heißt: seit N Tagen keine Nachricht. Nicht `updated_at` —
  // ein Statuswechsel ist keine Bewegung im Vorgang. `0` schaltet die Zahl ab.
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
 * Am Akteur im Audit-Log, nicht an `assigned_to` — wie in der Statistik.
 *
 * Kein `LIMIT`, anders als `resolvedPerAgent`: hier ist es eine Zeile je Person.
 * `IN ('closed', 'resolved')`, weil der Audit-Log nicht migriert wird.
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

/** Abgeleitet statt an `mits_presence` geschrieben: ein Schreiber weniger. */
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

interface TicketRow {
  id: string;
  ticket_number: number | null;
  title: string;
  priority: string;
  created_at: string;
}

const toTeamTicket = (row: TicketRow): TeamTicket => ({
  id: row.id,
  ticketNumber: row.ticket_number,
  title: row.title,
  // Roh übernommen statt geparst: ein unbekannter Wert soll den Chip nicht
  // verschwinden lassen.
  priority: row.priority as TicketPriority,
  createdAt: row.created_at,
});

/** Eine Abfrage für alle, danach gruppiert — SQLite hat kein „N je Gruppe". */
function ticketsByAgent(): Map<string, TeamTicket[]> {
  const rows = db
    .prepare(
      `SELECT id, ticket_number, title, priority, created_at, assigned_to
         FROM mits_ticket
        WHERE deleted_at IS NULL
          AND assigned_to IS NOT NULL
          AND status IN (${openStatusPlaceholders})
        ORDER BY ${PRIORITY_RANK_SQL} DESC, created_at ASC
        LIMIT ?`,
    )
    .all(...OPEN_TICKET_STATUSES, ASSIGNED_ROW_CAP) as (TicketRow & {
    assigned_to: string;
  })[];

  const out = new Map<string, TeamTicket[]>();
  for (const row of rows) {
    const list = out.get(row.assigned_to);
    if (list) {
      if (list.length < PER_MEMBER_CAP) list.push(toTeamTicket(row));
    } else {
      out.set(row.assigned_to, [toTeamTicket(row)]);
    }
  }
  return out;
}

function poolTickets(): TeamPool {
  const rows = db
    .prepare(
      `SELECT id, ticket_number, title, priority, created_at
         FROM mits_ticket
        WHERE deleted_at IS NULL
          AND assigned_to IS NULL
          AND status IN (${openStatusPlaceholders})
        ORDER BY ${PRIORITY_RANK_SQL} DESC, created_at ASC
        LIMIT ?`,
    )
    .all(...OPEN_TICKET_STATUSES, POOL_CAP) as TicketRow[];

  // Eigene Zählung, nicht `rows.length`: über dem Deckel wäre die Zahl sonst
  // genau der Deckel.
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM mits_ticket
        WHERE deleted_at IS NULL
          AND assigned_to IS NULL
          AND status IN (${openStatusPlaceholders})`,
    )
    .get(...OPEN_TICKET_STATUSES) as { n: number };

  return { tickets: rows.map(toTeamTicket), total: n };
}

/** `now` als Parameter, damit alle vier Abfragen dieselbe Zeitgrenze ziehen. */
export function collectTeamOverview(
  settings: TeamSettings,
  now: number = Date.now(),
): TeamOverview {
  const backlog = settings.show_backlog ? backlogFor(settings, now) : null;

  if (!settings.show_workload) return { backlog, members: [], pool: null };

  // Gefiltert in JavaScript, nicht in SQL: ein Konto, dessen Zeile noch
  // `technician` sagt, ist erst nach `toRole` ein Agent. Siehe `LEGACY_ROLES`.
  const staff = listPresence().filter((row) => canViewBoard(row.role));

  const loads = loadByAgent();
  const capacities = listAgentCapacities();
  const resolved = settings.show_resolved_today ? resolvedToday(now) : null;
  const working = settings.show_current_ticket
    ? currentWork(settings.current_work_minutes, now)
    : null;
  const draggable = settings.allow_reassign ? ticketsByAgent() : null;
  const pool = settings.allow_reassign ? poolTickets() : null;

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
      tickets: draggable?.get(row.id) ?? [],
    };
  });

  // Last absteigend: oben, wer zu viel hat, unten, wer etwas nehmen kann.
  members.sort(
    (a, b) => b.load.open - a.load.open || a.name.localeCompare(b.name, "de"),
  );

  return { backlog, members, pool };
}
