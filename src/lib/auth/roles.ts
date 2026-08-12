/* ──────────────────────────────────────────────────────────────────────────
   Role model — shared by the proxy, the server and the client.

   Kept free of any Node-only import on purpose: `src/proxy.ts` imports this, and
   pulling a database driver into the proxy bundle would break it.
   ────────────────────────────────────────────────────────────────────────── */

export const MITS_ROLES = ["user", "agent", "admin"] as const;
export type MITSRole = (typeof MITS_ROLES)[number];

export const DEFAULT_ROLE: MITSRole = "user";

/** Ascending privilege. Every check goes through `hasAtLeast`, never through `===`. */
const RANK: Record<MITSRole, number> = {
  user: 0,
  agent: 1,
  admin: 2,
};

/**
 * Role values this build no longer writes but still has to read.
 *
 * The pre-rename name for `agent` was the German-flavoured `technician`. The column
 * is migrated in `lib/db/sqlite.ts`, but the mapping stays here for the two cases
 * the migration cannot cover: a database restored from a backup taken before it ran,
 * and a session cookie minted by the previous build — Better Auth caches the role
 * for 60 seconds. Without this, `toRole` would fall through to `user` and every
 * agent on that instance would silently lose the queue, which looks exactly like a
 * permissions bug and is nowhere near the code that caused it.
 */
export const LEGACY_ROLES: Record<string, MITSRole> = {
  technician: "agent",
};

export function isRole(value: unknown): value is MITSRole {
  return typeof value === "string" && (MITS_ROLES as readonly string[]).includes(value);
}

/** Unknown or missing roles fall back to the lowest privilege, never the highest. */
export function toRole(value: unknown): MITSRole {
  if (isRole(value)) return value;
  if (typeof value === "string" && value in LEGACY_ROLES) {
    return LEGACY_ROLES[value];
  }
  return DEFAULT_ROLE;
}

export function hasAtLeast(role: unknown, required: MITSRole): boolean {
  return RANK[toRole(role)] >= RANK[required];
}

/** May open the agent queue (own and foreign tickets). */
export const canViewBoard = (role: unknown) => hasAtLeast(role, "agent");

/** May open the admin desk (settings, user management). */
export const canAdminister = (role: unknown) => hasAtLeast(role, "admin");

export const ROLE_LABELS: Record<MITSRole, string> = {
  user: "Benutzer",
  agent: "Agent",
  admin: "Administration",
};

/** Plural, for headings and counts. */
export const ROLE_LABELS_PLURAL: Record<MITSRole, string> = {
  user: "Benutzer",
  agent: "Agenten",
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

/** Die Anmeldemaske des Personals. Liegt bei dem Bereich, den sie öffnet. */
export const STAFF_LOGIN = "/mits/login";

export const PROTECTED_PREFIXES: {
  prefix: string;
  role: MITSRole;
  deniedPath?: string;
}[] = [
  { prefix: "/admin", role: "admin" },
  { prefix: "/mits", role: "agent", deniedPath: CUSTOMER_HOME },
  { prefix: "/customer", role: "user" },
  // Own profile and password. Any signed-in role, but never anonymous.
  { prefix: "/settings", role: "user" },
];

/**
 * Öffentliche Pfade, die innerhalb eines geschützten Präfixes liegen.
 *
 * Genau einer, und ohne ihn wäre die Personalmaske unerreichbar: `/mits/login`
 * fällt unter die `/mits`-Regel, ein abgemeldeter Aufruf würde also auf
 * `/login?next=/mits/login` umgeleitet — die Maske schickt zur Maske. Der
 * Ausschluss steht **hier** und nicht im `config.matcher` des Proxys, weil
 * `requiredRoleFor` beide Seiten bedient: den Proxy und die Seiten-Guards. Zwei
 * Listen wären zwei Orte, an denen dieselbe Ausnahme gelten muss.
 *
 * Exakte Pfade, kein Präfix: `/mits/login/…` gibt es nicht, und ein Präfix wäre
 * eine offene Tür für jede Seite, die dort später jemand anlegt.
 */
const PUBLIC_PATHS: string[] = [STAFF_LOGIN];

function matchPrefix(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return undefined;

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
