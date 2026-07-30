/* ──────────────────────────────────────────────────────────────────────────
   The bootstrap window for the seeded administrator.

   Its own module, and deliberately import-free: `auth/server.ts` reads it from
   inside the user-create hook while `auth/seed-admin.ts` sets it, so importing
   one from the other would be a cycle.

   The state is an address, not a boolean. A plain "bypass the registration
   policy" switch would open a window in which any concurrent sign-up became an
   admin; narrowing it to one address means the hook can only ever be relaxed
   for the account the seeder is creating right now.
   ────────────────────────────────────────────────────────────────────────── */

let seedingEmail: string | null = null;

/**
 * True only while the seeder is creating exactly this account. Compared
 * case-insensitively because Better Auth stores the address as entered.
 */
export function isSeedingAdmin(email: string): boolean {
  return (
    seedingEmail !== null && seedingEmail === email.trim().toLowerCase()
  );
}

/** Run `create` inside the bootstrap window for one address. */
export async function withAdminBootstrap<T>(
  email: string,
  create: () => Promise<T>,
): Promise<T> {
  seedingEmail = email.trim().toLowerCase();
  try {
    return await create();
  } finally {
    seedingEmail = null;
  }
}
