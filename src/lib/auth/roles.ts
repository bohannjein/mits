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

/* ──────────────────────────────────────────────────────────────────────────
   Route gating.

   Two worlds: `/customer` is what a reporter uses, `/mits` is the staff hub.
   `deniedPath` says where somebody who is signed in but lacks the role goes —
   a reporter who follows a link into `/mits` belongs in their own portal, not on
   a permission error they can do nothing about. Everything else keeps
   `/forbidden`, which is the honest answer when there is no lesser view to offer.
   ────────────────────────────────────────────────────────────────────────── */

export const CUSTOMER_HOME = "/customer";
export const AGENT_HOME = "/mits";

export const PROTECTED_PREFIXES: {
  prefix: string;
  role: MITSRole;
  deniedPath?: string;
}[] = [
  { prefix: "/admin", role: "admin" },
  { prefix: "/mits", role: "technician", deniedPath: CUSTOMER_HOME },
  { prefix: "/customer", role: "user" },
  // Own profile and password. Any signed-in role, but never anonymous.
  { prefix: "/settings", role: "user" },
];

function matchPrefix(pathname: string) {
  return PROTECTED_PREFIXES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** The strictest rule matching this path, or null when the path is public. */
export function requiredRoleFor(pathname: string): MITSRole | null {
  return matchPrefix(pathname)?.role ?? null;
}

/** Where to send a signed-in user who may not open this path. */
export function deniedPathFor(pathname: string): string {
  return matchPrefix(pathname)?.deniedPath ?? "/forbidden";
}

/** Landing page for a role — used by `/` and after signing in. */
export function homeFor(role: unknown): string {
  return canViewBoard(role) ? AGENT_HOME : CUSTOMER_HOME;
}
