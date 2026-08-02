import "server-only";

import { auth } from "@/lib/auth/server";

/* ──────────────────────────────────────────────────────────────────────────
   "Prove it is you", without signing in again.

   For the one action that has no undo: wiping the database. A session cookie is
   enough for everything else in the admin area, and it is deliberately not enough
   here — the cookie may be a forgotten laptop in a meeting room, and the password
   is the thing only the person is supposed to have.

   **Verified against the stored hash, not by signing in.** `auth.api.signInEmail`
   would answer the same question and mint a second session as a side effect, which
   on a destructive path is exactly the kind of extra state nobody wants to explain
   afterwards. `ctx.password.verify` is what the sign-in route itself calls once it
   has the account row.

   Returns a boolean and never says which half failed. An account with no credential
   row — one that only ever signed in through some other provider — answers false,
   which is the honest answer to "does this password match".
   ────────────────────────────────────────────────────────────────────────── */

export async function verifyUserPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  // A blank field is not a password. Short-circuited before the hash comparison so
  // an empty submit cannot depend on how the hasher treats an empty string.
  if (password === "") return false;

  const ctx = await auth.$context;
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  const credential = accounts.find(
    (account) => account.providerId === "credential",
  );
  if (!credential?.password) return false;

  return ctx.password.verify({ hash: credential.password, password });
}
