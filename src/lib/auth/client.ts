"use client";

import { createAuthClient } from "better-auth/react";
import {
  inferAdditionalFields,
  twoFactorClient,
} from "better-auth/client/plugins";

/* ──────────────────────────────────────────────────────────────────────────
   Browser auth client.

   `inferAdditionalFields` is declared with a literal shape rather than
   `<typeof auth>` so this module never references the server instance — that
   import would drag the SQLite driver into the client graph.

   No baseURL: the client talks to /api/auth on the same origin, which is what a
   self-hosted instance behind any hostname needs.
   ────────────────────────────────────────────────────────────────────────── */

export const authClient = createAuthClient({
  plugins: [
    /*
     * Ohne `twoFactorPage` und ohne `onTwoFactorRedirect`.
     *
     * Beide Optionen schicken den Browser bei `twoFactorRedirect` von selbst
     * woandershin. Hier bleibt der zweite Schritt in derselben Karte, in der der
     * erste stand: eine eigene Seite müsste den Zwischenzustand aus einem Cookie
     * wiederherstellen, und ein Reload darauf wäre eine Seite, die nach nichts
     * mehr fragt. `LoginForm` liest `data.twoFactorRedirect` selbst.
     */
    twoFactorClient(),
    inferAdditionalFields({
      // `input: false` mirrors the server fields. Besides matching reality, it
      // keeps both out of the sign-up argument type — the client must not be
      // able to ask for a role, nor to clear its own password gate.
      user: {
        role: { type: "string", input: false },
        mustChangePassword: { type: "boolean", input: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession, twoFactor } = authClient;
