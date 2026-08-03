"use server";

import { revalidatePath } from "next/cache";

import { ApiKeyError, createApiKey, deleteApiKey } from "@/lib/api-keys";
import { requireRole } from "@/lib/auth/session";

/* ──────────────────────────────────────────────────────────────────────────
   Create and revoke API keys.

   Every action re-checks for admin. The page does too, and neither check is
   redundant: a Server Action is a POST endpoint, reachable without ever
   rendering the page that offers it.
   ────────────────────────────────────────────────────────────────────────── */

export type ApiKeyActionResult =
  | { ok: true; message: string; token?: string; handle?: string }
  | { ok: false; error: string };

/**
 * Create a key and hand the token back exactly once.
 *
 * Returned to the caller instead of stored anywhere readable — the row keeps
 * only a SHA-256 of it. A lost key is replaced, not recovered, which is the
 * property that makes "shown once" honest rather than an inconvenience.
 */
export async function createApiKeyAction(
  _previous: ApiKeyActionResult | null,
  formData: FormData,
): Promise<ApiKeyActionResult> {
  const actor = await requireRole("admin");

  try {
    const { token, key } = createApiKey(
      String(formData.get("name") ?? ""),
      actor.email,
    );
    revalidatePath("/admin/settings/api-keys");
    return {
      ok: true,
      message: `„${key.name}“ angelegt.`,
      token,
      handle: key.handle,
    };
  } catch (error) {
    if (error instanceof ApiKeyError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function deleteApiKeyAction(
  _previous: ApiKeyActionResult | null,
  formData: FormData,
): Promise<ApiKeyActionResult> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Kein Key angegeben." };

  deleteApiKey(id);
  revalidatePath("/admin/settings/api-keys");
  return { ok: true, message: "Key gelöscht. Aufrufe damit werden abgewiesen." };
}
