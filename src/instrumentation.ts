/* ──────────────────────────────────────────────────────────────────────────
   Server start hook.

   `register` is called once per server instance and completes before the first
   request is served, which is what makes it the right place for the default
   administrator: no request can arrive at an instance that has no admin yet.

   The runtime guard is load-bearing. `instrumentation.ts` also runs in the Edge
   runtime (the proxy), where `better-sqlite3` cannot load — the dynamic import
   keeps the driver out of that bundle entirely.

   Skipping the build phase is `ensureDefaultAdmin`'s own job, so that every
   caller is covered and not just this one.
   ────────────────────────────────────────────────────────────────────────── */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureDefaultAdmin } = await import("@/lib/auth/seed-admin");

  try {
    await ensureDefaultAdmin();
  } catch (error) {
    // A failed seed must not stop the server: an instance that boots without an
    // admin is recoverable (the first registration becomes one), an instance
    // that refuses to boot is not.
    console.error("[MITS] Default administrator seeding failed.", error);
  }
}
