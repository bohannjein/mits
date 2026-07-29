import "server-only";

import { toRole, type MITSRole } from "@/lib/auth/roles";
import { db } from "@/lib/db/sqlite";

/* ──────────────────────────────────────────────────────────────────────────
   Read and role-management access to Better Auth's `user` table.

   Only the columns the admin desk needs. Password hashes live in `account` and
   are never touched here.
   ────────────────────────────────────────────────────────────────────────── */

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: MITSRole;
  createdAt: string;
}

export function countUsers(): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM user").get() as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

export function listUsers(): ManagedUser[] {
  const rows = db
    .prepare(
      `SELECT id, name, email, role, createdAt
         FROM user
        ORDER BY createdAt ASC`,
    )
    .all() as {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
    createdAt: string | number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() || row.email,
    email: row.email,
    role: toRole(row.role),
    createdAt: String(row.createdAt),
  }));
}

/** Number of accounts that currently hold the admin role. */
export function countAdmins(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM user WHERE role = 'admin'")
    .get() as { count: number } | undefined;
  return row?.count ?? 0;
}

export class RoleChangeError extends Error {}

/**
 * Change a user's role.
 *
 * Refuses to remove the last admin: an instance without an administrator cannot
 * be recovered through the UI. The caller is responsible for checking that the
 * *actor* is an admin — see `app/admin/actions.ts`.
 */
export function setUserRole(userId: string, role: MITSRole): void {
  const target = db
    .prepare("SELECT id, role FROM user WHERE id = ?")
    .get(userId) as { id: string; role: string | null } | undefined;

  if (!target) throw new RoleChangeError("Benutzer nicht gefunden.");

  const current = toRole(target.role);
  if (current === role) return;

  if (current === "admin" && countAdmins() <= 1) {
    throw new RoleChangeError(
      "Der letzte Administrator kann nicht herabgestuft werden.",
    );
  }

  db.prepare("UPDATE user SET role = ? WHERE id = ?").run(role, userId);
}
