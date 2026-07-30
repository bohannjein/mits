"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { clearMustChangePassword } from "@/lib/auth/seed-admin";
import { requireUserForPasswordChange } from "@/lib/auth/session";

/* ──────────────────────────────────────────────────────────────────────────
   Own-password change.

   A Server Action rather than a client call to `authClient.changePassword`,
   because the `must_change_password` flag has to be cleared by the *same* code
   path that changed the password. The field is `input: false`, so a client can
   never clear it on its own — and here it can only be cleared after Better Auth
   confirmed the old password and stored the new one.
   ────────────────────────────────────────────────────────────────────────── */

export interface PasswordChangeResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export async function changeOwnPassword(
  _previous: PasswordChangeResult | null,
  formData: FormData,
): Promise<PasswordChangeResult> {
  // Authoritative: the action re-reads the session itself. `...ForPasswordChange`
  // is the gated variant, since this is the one thing a gated session may do.
  const user = await requireUserForPasswordChange();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword) {
    return { ok: false, error: "Bitte beide Passwortfelder ausfüllen." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Die Wiederholung stimmt nicht überein." };
  }
  if (newPassword === currentPassword) {
    return {
      ok: false,
      error: "Das neue Passwort muss sich vom alten unterscheiden.",
    };
  }
  // Mirrors emailAndPassword.minPasswordLength. Better Auth enforces it too; this
  // check exists so the user gets a German message instead of an API error code.
  if (newPassword.length < 10) {
    return { ok: false, error: "Das neue Passwort braucht mindestens 10 Zeichen." };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        // Anything that signed in with the published default password is
        // logged out here. Whoever changed it keeps their own session.
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch {
    // Deliberately not passing the upstream message through: it distinguishes
    // "wrong password" from other failures, and this endpoint is reachable with
    // a stolen session cookie.
    return {
      ok: false,
      error:
        "Passwort konnte nicht geändert werden. Stimmt das aktuelle Passwort?",
    };
  }

  clearMustChangePassword(user.id);

  return { ok: true, message: "Passwort geändert." };
}
