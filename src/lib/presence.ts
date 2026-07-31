import "server-only";

import { toRole, type MITSRole } from "@/lib/auth/roles";
import { db } from "@/lib/db/sqlite";
import { presenceStateFor, type PresenceState } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Presence.

   An indicator, not an audit trail: one row per user, overwritten in place. There
   is no history here and none is wanted — "who was at their desk at 14:03" is
   surveillance, "who is reachable now" is dispatch.

   Everyone is recorded, reporters included — a reporter shown permanently offline
   would be worse than not listing them at all. The boundary is the reading side:
   `listPresence` is server-only and the panel that renders it lives in `/mits`, so
   the list never reaches a reporter's own screen.

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
}

/**
 * Record a sign of life.
 *
 * Every role. The acting user comes from the session in the route handler, so there
 * is nothing a caller can claim about somebody else.
 */
export function touchPresence(userId: string): void {
  db.prepare(
    `INSERT INTO mits_presence (user_id, seen_at) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET seen_at = excluded.seen_at`,
  ).run(userId, new Date().toISOString());
}

/**
 * Everyone with an account, most-recently-seen first.
 *
 * A LEFT JOIN so somebody who has never loaded a page since this table existed
 * still appears — as offline, which is the truth, rather than missing, which looks
 * like they have no account.
 */
export function listPresence(): AgentPresence[] {
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
      };
    });
}
