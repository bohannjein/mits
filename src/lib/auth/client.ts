"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

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
    inferAdditionalFields({
      // `input: false` mirrors the server field. Besides matching reality, it
      // keeps `role` out of the sign-up argument type — the client must not be
      // able to ask for a role at registration.
      user: { role: { type: "string", input: false } },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
