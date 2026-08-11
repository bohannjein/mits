import "server-only";

import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { withProvisionedRole } from "@/lib/auth/bootstrap";
import { ensureAuthSchema, getAuth } from "@/lib/auth/server";
import { db } from "@/lib/db/sqlite";
import { countAdmins } from "@/lib/users";

/* ──────────────────────────────────────────────────────────────────────────
   Default administrator seeding.

   Runs once per server start (see `src/instrumentation.ts`) and does nothing
   unless the instance has no administrator at all. Idempotent by construction:
   the check is "are there zero admins", not "have I run before", so a restored
   database or a wiped volume both recover.

   ── A warning that belongs in the code, not only in the docs ──

   The built-in password below is public: it is in this repository, so every
   installation that never overrode it ships with known administrator
   credentials. `MITS_DEFAULT_ADMIN_PASSWORD` exists to avoid that, and
   `mustChangePassword` limits the damage when nobody sets it — while the flag
   is on, the account cannot do anything except set a new password (enforced in
   `lib/auth/session.ts` for pages and in the route handlers for the API).

   Treat the seeded credentials as a first-run convenience with a hard expiry,
   never as a service account.
   ────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_ADMIN_EMAIL = "admin@mits.local";
export const DEFAULT_ADMIN_NAME = "MITS Administrator";

/**
 * Shipped fallback. Nine characters, so shorter than the ten
 * `emailAndPassword.minPasswordLength` demands — deliberately: the seeder hashes
 * it directly rather than going through /sign-up/email, and the *replacement*
 * the admin chooses is validated normally. A password nobody is meant to keep
 * does not need to satisfy the policy for passwords people choose.
 */
const BUILTIN_PASSWORD = "Admin123!";

export type SeedOutcome =
  | { action: "skipped"; reason: "admin-exists" | "build" }
  | { action: "promoted"; email: string }
  | { action: "created"; email: string; usedBuiltinPassword: boolean };

/**
 * `next build` evaluates route modules — it will attempt to prerender `/` and
 * only bail once the render reads cookies, by which point anything the module
 * called has already run. Seeding there would write a database into an image
 * layer and ship every container with the same pre-created account.
 *
 * The guard lives here rather than only in `instrumentation.ts` so it covers
 * every caller, including that prerender attempt.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

function credentials(): { email: string; password: string; fromEnv: boolean } {
  const email =
    process.env.MITS_DEFAULT_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const fromEnv = (process.env.MITS_DEFAULT_ADMIN_PASSWORD ?? "").length > 0;
  return {
    email,
    password: fromEnv
      ? (process.env.MITS_DEFAULT_ADMIN_PASSWORD as string)
      : BUILTIN_PASSWORD,
    fromEnv,
  };
}

let running: Promise<SeedOutcome> | null = null;

/**
 * Ensure the instance has an administrator. Memoised per process, and a failure
 * is not cached — the next caller retries rather than living with a broken
 * instance.
 */
export function ensureDefaultAdmin(): Promise<SeedOutcome> {
  // Not memoised: the build phase must not poison the cache for the server that
  // later runs from the same module instance.
  if (isBuildPhase()) {
    return Promise.resolve({ action: "skipped", reason: "build" });
  }

  running ??= seed().catch((error: unknown) => {
    running = null;
    throw error;
  });
  return running;
}

async function seed(): Promise<SeedOutcome> {
  // The `user` table has to exist before it can be counted, and the
  // must_change_password column has to exist before it can be written.
  await ensureAuthSchema();

  if (countAdmins() > 0) {
    // Say so. A silent skip means a later "why can I not log in" has no trail:
    // the account may have been seeded by an earlier container start, and
    // `docker logs` on the current one shows nothing at all. Naming the
    // configured address without asserting it was created is the useful line —
    // no password, no account list.
    const { email } = credentials();
    console.info(
      `[MITS] Administrator present, seeding skipped. If ${email} was seeded by an earlier start, its password is whatever was configured then.`,
    );
    return { action: "skipped", reason: "admin-exists" };
  }

  const { email, password, fromEnv } = credentials();

  // Someone may already hold the address without being an admin. Promoting is
  // the right move: creating would collide on the unique email, and overwriting
  // a password its owner chose would be worse than leaving it alone. No
  // mustChangePassword either — that password is not a published default.
  const existing = db
    .prepare("SELECT id FROM user WHERE email = ? COLLATE NOCASE")
    .get(email) as { id: string } | undefined;

  if (existing) {
    db.prepare("UPDATE user SET role = 'admin' WHERE id = ?").run(existing.id);
    console.warn(
      `[MITS] No administrator found. Promoted the existing account ${email} to admin. Its password was left unchanged.`,
    );
    return { action: "promoted", email };
  }

  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(password);

  await withProvisionedRole(email, "admin", async () => {
    const user = await ctx.internalAdapter.createUser({
      email,
      name: DEFAULT_ADMIN_NAME,
      // No mail transport exists, so an unverified flag would be permanent and
      // meaningless. requireEmailVerification is off for the same reason.
      emailVerified: true,
      role: "admin",
      mustChangePassword: true,
    });

    // providerId "credential" is what the email/password sign-in looks up; the
    // account id equals the user id for that provider.
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
  });

  if (fromEnv) {
    console.warn(
      `[MITS] Seeded administrator ${email} from MITS_DEFAULT_ADMIN_PASSWORD. It must be changed at first sign-in.`,
    );
  } else {
    console.warn(
      `[MITS] Seeded administrator ${email} with the PUBLIC built-in password from the repository. ` +
        `Sign in and change it now, or set MITS_DEFAULT_ADMIN_PASSWORD before first start. ` +
        `The account can do nothing else until the password is changed.`,
    );
  }

  return { action: "created", email, usedBuiltinPassword: !fromEnv };
}

/**
 * Clear the gate. Only reachable from the code path that actually changed the
 * password — see `app/settings/actions.ts`. Kept here so the flag is written in
 * exactly one place.
 */
export function clearMustChangePassword(userId: string): void {
  db.prepare("UPDATE user SET must_change_password = 0 WHERE id = ?").run(
    userId,
  );
}
