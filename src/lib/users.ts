import "server-only";

import { toRole, type MITSRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
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

/**
 * A stored account in the shape the write paths take, for code that acts on
 * somebody's behalf without a browser session: the mail ingest and the inbound
 * ticket webhook.
 *
 * Not a way around authentication. The role comes from the stored row, so an
 * account that is a plain `user` stays one — an ingest running under it cannot
 * write an internal note, and the write paths enforce that themselves rather
 * than trusting this object.
 */
export function asSessionUser(account: ManagedUser): SessionUser {
  return {
    id: account.id,
    name: account.name?.trim() || account.email,
    email: account.email,
    role: account.role,
    emailVerified: true,
    // Irrelevant here — no background path consults the password gate — but
    // false is the honest value for an account being used by a service.
    mustChangePassword: false,
  };
}

/** One account, or null. Called before an admin action writes to it. */
export function findUser(userId: string): ManagedUser | null {
  return listUsers().find((candidate) => candidate.id === userId) ?? null;
}

/**
 * Look an account up by its address, case-insensitively.
 *
 * For the mail ingest: a message from an address MITS already knows becomes that
 * person's ticket, so it shows up in their portal. This is a *lookup*, never a
 * creation — an unauthenticated message must not be able to bring an account into
 * existence, and the ingest files an unknown sender under the configured fallback
 * account instead.
 *
 * Addresses are compared lowercased. The local part is technically
 * case-sensitive per RFC 5321, and treating it that way here would mean
 * `Anna.Meier@firma.de` and `anna.meier@firma.de` are different reporters — which
 * no mail server on earth actually implements and every user would consider a bug.
 */
export function findUserByEmail(email: string): ManagedUser | null {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  return (
    listUsers().find((candidate) => candidate.email.toLowerCase() === needle) ??
    null
  );
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

/**
 * Whether this account has a verified second factor.
 *
 * Aus derselben Quelle und aus demselben Grund wie `mustChangePassword`: der
 * Wert reist auch im Sitzungs-Cookie mit, und das lebt 60 Sekunden. Ein Konto,
 * das seinen Faktor gerade eingerichtet hat, säße sonst bis zu einer Minute
 * weiter auf der Einrichtungsseite — und ein gerade zurückgesetzter Faktor
 * bliebe genauso lange wirksam.
 *
 * Die Spalte legt der `two-factor`-Plugin an; `ensureAuthSchema` läuft in
 * `getSessionUser`, bevor irgendein Aufrufer hier landet. `twoFactorEnabled` ist
 * camelCase, weil Better Auth Feldnamen unverändert als Spaltennamen nimmt —
 * `must_change_password` daneben hat nur deshalb Unterstriche, weil dort ein
 * `fieldName` gesetzt ist.
 */
export function hasTwoFactor(userId: string): boolean {
  const row = db
    .prepare("SELECT twoFactorEnabled AS flag FROM user WHERE id = ?")
    .get(userId) as { flag: unknown } | undefined;

  // SQLite has no boolean type: the column comes back as 0 or 1.
  return row ? Boolean(row.flag) : false;
}

/**
 * Take the second factor off an account.
 *
 * Der Weg zurück, wenn das Telefon weg ist und die Ersatzcodes mit ihm. Ohne ihn
 * wäre jedes verlorene Gerät ein Eingriff in die Datenbank — und seit die Pflicht
 * auch für Melder gilt, ist das kein Randfall mehr, sondern der Regelfall im
 * Support.
 *
 * Löscht die Zeile mit Geheimnis und Ersatzcodes und nicht nur das Flag: ein
 * stehengelassenes Geheimnis würde beim nächsten Einrichten weiterbenutzt, und
 * dann trüge ein zurückgesetzter Faktor denselben Schlüssel wie der alte.
 *
 * Der Aufrufer ist dafür verantwortlich, dass der *Handelnde* Admin ist — wie bei
 * `setUserRole`, siehe `app/admin/actions.ts`.
 */
export function resetTwoFactor(userId: string): void {
  const clear = db.transaction((id: string) => {
    db.prepare("DELETE FROM twoFactor WHERE userId = ?").run(id);
    db.prepare("UPDATE user SET twoFactorEnabled = 0 WHERE id = ?").run(id);
  });
  clear(userId);
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
