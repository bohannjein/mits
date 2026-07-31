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

/** One account, or null. Called before an admin action writes to it. */
export function findUser(userId: string): ManagedUser | null {
  return listUsers().find((candidate) => candidate.id === userId) ?? null;
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

/**
 * Whether this account still has to replace a seeded default password.
 *
 * Read straight from the table on purpose. The value also travels in Better
 * Auth's session-cache cookie, but that cookie lives for 60 seconds — trusting
 * it would keep an account locked out for up to a minute after it successfully
 * changed its password, and would delay a freshly set flag by just as long.
 * The gate is a security control, so it follows the same rule as the role
 * checks: the authoritative answer comes from the database.
 *
 * A missing row means there is no account left to protect, so it is not gated.
 */
export function mustChangePassword(userId: string): boolean {
  const row = db
    .prepare("SELECT must_change_password AS flag FROM user WHERE id = ?")
    .get(userId) as { flag: unknown } | undefined;

  // SQLite has no boolean type: the column comes back as 0 or 1.
  return row ? Boolean(row.flag) : false;
}

/** Number of accounts that currently hold the admin role. */
export function countAdmins(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM user WHERE role = 'admin'")
    .get() as { count: number } | undefined;
  return row?.count ?? 0;
}

/**
 * Change one's own display name.
 *
 * Written straight to the `user` table rather than through Better Auth's update
 * endpoint: the name is not a credential and not an identity, so there is nothing
 * for the auth layer to re-verify. The address deliberately stays out of reach —
 * it is the login identity, and this instance has no mail verification configured,
 * so letting someone rewrite it would let them lock themselves out of an account
 * they can no longer prove is theirs.
 *
 * The caller is responsible for having established *whose* name this is; the id
 * always comes from a session, never from a form field.
 */
export function setUserName(userId: string, name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (trimmed === "") {
    throw new ProfileError("Der Name darf nicht leer sein.");
  }

  db.prepare("UPDATE user SET name = ? WHERE id = ?").run(trimmed, userId);
  return trimmed;
}

export class ProfileError extends Error {}

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
