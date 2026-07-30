import "server-only";

import { canViewBoard, toRole, type MITSRole } from "@/lib/auth/roles";
import { db } from "@/lib/db/sqlite";
import { presenceStateFor, type PresenceState } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Technician presence.

   An indicator, not an audit trail: one row per user, overwritten in place. There
   is no history here and none is wanted — "who was at their desk at 14:03" is
   surveillance, "who can pick this up now" is dispatch.

   The state is derived on read rather than stored. A stored state would need a
   background job to move someone from active to idle; deriving it from a single
   timestamp means silence does the work.
   ────────────────────────────────────────────────────────────────────────── */

export interface AgentPresence {
  id: string;
  name: string;
  email: string;
  role: MITSRole;
  state: PresenceState;
  /** Null for someone who has never been seen since the table existed. */
  seenAt: Date | null;
  /** Open tickets currently assigned to them — the useful half of "is she busy". */
  openTickets: number;
}

/**
 * Record a sign of life.
 *
 * Staff only. A plain reporter's whereabouts are nobody's business, and keeping
 * them out of the table means the presence list cannot leak them by accident
 * later.
 */
export function touchPresence(userId: string, role: MITSRole): void {
  if (!canViewBoard(role)) return;

  db.prepare(
    `INSERT INTO mits_presence (user_id, seen_at) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET seen_at = excluded.seen_at`,
  ).run(userId, new Date().toISOString());
}

/**
 * Everyone who could take a ticket, most-recently-seen first.
 *
 * A LEFT JOIN so staff who have never loaded a page since this table existed
 * still appear — as offline, which is the truth, rather than missing, which looks
 * like they do not work here.
 */
export function listAgentPresence(): AgentPresence[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, p.seen_at
         FROM user u
         LEFT JOIN mits_presence p ON p.user_id = u.id
        ORDER BY p.seen_at DESC NULLS LAST, u.name ASC`,
    )
    .all() as {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
    seen_at: string | null;
  }[];

  const now = Date.now();

  // Open-ticket counts in one query rather than one per agent.
  const counts = db
    .prepare(
      `SELECT assigned_to AS id, COUNT(*) AS count
         FROM mits_ticket
        WHERE assigned_to IS NOT NULL
          AND status NOT IN ('closed', 'resolved')
        GROUP BY assigned_to`,
    )
    .all() as { id: string; count: number }[];

  const openByAgent = new Map(counts.map((row) => [row.id, row.count]));

  return rows
    .map((row) => {
      const role = toRole(row.role);
      const seenAt = row.seen_at ? new Date(row.seen_at) : null;
      return {
        id: row.id,
        name: row.name?.trim() || row.email,
        email: row.email,
        role,
        state: presenceStateFor(seenAt, now),
        seenAt,
        openTickets: openByAgent.get(row.id) ?? 0,
      };
    })
    .filter((agent) => canViewBoard(agent.role));
}
