/* ──────────────────────────────────────────────────────────────────────────
   Role model — shared by the proxy, the server and the client.

   Kept free of any Node-only import on purpose: `src/proxy.ts` imports this, and
   pulling a database driver into the proxy bundle would break it.
   ────────────────────────────────────────────────────────────────────────── */

export const MITS_ROLES = ["user", "technician", "admin"] as const;
export type MITSRole = (typeof MITS_ROLES)[number];

export const DEFAULT_ROLE: MITSRole = "user";

/** Ascending privilege. Every check goes through `hasAtLeast`, never through `===`. */
const RANK: Record<MITSRole, number> = {
  user: 0,
  technician: 1,
  admin: 2,
};

export function isRole(value: unknown): value is MITSRole {
  return typeof value === "string" && (MITS_ROLES as readonly string[]).includes(value);
}

/** Unknown or missing roles fall back to the lowest privilege, never the highest. */
export function toRole(value: unknown): MITSRole {
  return isRole(value) ? value : DEFAULT_ROLE;
}

export function hasAtLeast(role: unknown, required: MITSRole): boolean {
  return RANK[toRole(role)] >= RANK[required];
}

/** May open the technician board (own and foreign tickets). */
export const canViewBoard = (role: unknown) => hasAtLeast(role, "technician");

/** May open the admin desk (settings, user management). */
export const canAdminister = (role: unknown) => hasAtLeast(role, "admin");

export const ROLE_LABELS: Record<MITSRole, string> = {
  user: "Benutzer",
  technician: "Technik",
  admin: "Administration",
};

/** Route prefixes and the role they require. Consumed by the proxy and the guards. */
export const PROTECTED_PREFIXES: { prefix: string; role: MITSRole }[] = [
  { prefix: "/admin", role: "admin" },
  { prefix: "/board", role: "technician" },
  { prefix: "/tickets", role: "user" },
];

/** The strictest rule matching this path, or null when the path is public. */
export function requiredRoleFor(pathname: string): MITSRole | null {
  const match = PROTECTED_PREFIXES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? match.role : null;
}
