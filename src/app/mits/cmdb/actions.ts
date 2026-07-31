"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole, type SessionUser } from "@/lib/auth/session";
import {
  CMDBError,
  addRelation,
  attachCIToTicket,
  deleteConfigurationItem,
  detachCIFromTicket,
  getConfigurationItem,
  removeRelation,
  saveConfigurationItem,
} from "@/lib/cmdb";
import { isFeatureEnabled } from "@/lib/features";
import { getLocation } from "@/lib/locations";
import { organizationExists } from "@/lib/organizations";
import { findUser } from "@/lib/users";
import {
  CIRelationKind,
  MITSConfigurationItemSchema,
  NO_LOCATION,
  NO_ORGANIZATION,
  type MITSConfigurationItem,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   CMDB write paths.

   Technician and above, checked here rather than only in the route gate — a Server
   Action is reachable without the page it was rendered on, and `src/proxy.ts` is not a
   security boundary (see AGENTS.md rule 5).

   The module flag is re-checked in every action for the same reason: switching CMDB off
   has to close the endpoints, not just hide the links.
   ────────────────────────────────────────────────────────────────────────── */

export type CMDBActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string };

/** Role plus module, in one place so no action can forget half of it. */
async function authorize(): Promise<
  { ok: true; user: SessionUser } | { ok: false; error: string }
> {
  const user = await requireRole("technician");
  if (!isFeatureEnabled("feature_cmdb")) {
    return { ok: false, error: "Die CMDB ist abgeschaltet." };
  }
  return { ok: true, user };
}

/**
 * Every "not assigned" picker posts the same sentinel.
 *
 * Radix Select has no legal empty value, and an empty string in a reference column is
 * an id that matches nothing rather than the absence of one. The three exported
 * constants — location, organization, on-call — all carry this value; one local
 * comparison covers them instead of three names for one string.
 */
const NONE_SENTINELS = new Set([NO_LOCATION, NO_ORGANIZATION]);

const asReference = (value: string | null): string | null =>
  !value || NONE_SENTINELS.has(value) ? null : value;

/**
 * The item as the form posts it.
 *
 * `created_at` and `updated_at` are stripped rather than accepted: they are the store's
 * to set, and a client-supplied timestamp is a record that claims to have been changed
 * at a time it was not.
 */
const ItemInputSchema = MITSConfigurationItemSchema.omit({
  created_at: true,
  updated_at: true,
});

function revalidateCMDB(id?: string): void {
  revalidatePath("/mits/cmdb");
  revalidatePath("/mits/cmdb/licenses");
  if (id) revalidatePath(`/mits/cmdb/${id}`);
}

export async function saveConfigurationItemAction(
  _previous: CMDBActionResult | null,
  formData: FormData,
): Promise<CMDBActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("item") ?? ""));
  } catch {
    return { ok: false, error: "Eingaben konnten nicht gelesen werden." };
  }

  const parsed = ItemInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind unvollständig.",
    };
  }

  const input = normaliseReferences(parsed.data);

  // A stale id out of a cached form must not attach the item to nothing.
  if (input.organization_id && !organizationExists(input.organization_id)) {
    return { ok: false, error: "Die gewählte Firma ist unbekannt." };
  }
  if (input.location_id && !getLocation(input.location_id)) {
    return { ok: false, error: "Der gewählte Standort ist unbekannt." };
  }
  if (input.assigned_user_id && !findUser(input.assigned_user_id)) {
    return { ok: false, error: "Das gewählte Konto ist unbekannt." };
  }

  let saved;
  try {
    saved = saveConfigurationItem(input);
  } catch (error) {
    if (error instanceof CMDBError) return { ok: false, error: error.message };
    throw error;
  }

  revalidateCMDB(saved.id);
  return { ok: true, message: `${saved.name} gespeichert.`, id: saved.id };
}

/** The pickers post sentinels for "not assigned"; the columns want null. */
function normaliseReferences(
  input: z.infer<typeof ItemInputSchema>,
): Omit<MITSConfigurationItem, "created_at" | "updated_at"> {
  return {
    ...input,
    organization_id: asReference(input.organization_id),
    location_id: asReference(input.location_id),
    assigned_user_id: asReference(input.assigned_user_id),
  };
}

export async function deleteConfigurationItemAction(
  _previous: CMDBActionResult | null,
  formData: FormData,
): Promise<CMDBActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const id = String(formData.get("itemId") ?? "");
  const item = id ? getConfigurationItem(id) : null;
  if (!item) return { ok: false, error: "Das Objekt existiert nicht." };

  deleteConfigurationItem(id);

  revalidateCMDB(id);
  return { ok: true, message: `${item.name} gelöscht.` };
}

export async function addCIRelationAction(
  _previous: CMDBActionResult | null,
  formData: FormData,
): Promise<CMDBActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const fromCi = String(formData.get("fromCi") ?? "");
  const toCi = String(formData.get("toCi") ?? "");
  const kind = CIRelationKind.safeParse(formData.get("kind"));

  if (!fromCi || !toCi) return { ok: false, error: "Kein Ziel gewählt." };
  if (!kind.success) return { ok: false, error: "Unbekannte Beziehungsart." };

  try {
    addRelation(fromCi, toCi, kind.data, auth.user.id);
  } catch (error) {
    if (error instanceof CMDBError) return { ok: false, error: error.message };
    throw error;
  }

  revalidateCMDB(fromCi);
  revalidatePath(`/mits/cmdb/${toCi}`);
  return { ok: true, message: "Beziehung angelegt." };
}

export async function removeCIRelationAction(
  _previous: CMDBActionResult | null,
  formData: FormData,
): Promise<CMDBActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const id = String(formData.get("relationId") ?? "");
  if (!id) return { ok: false, error: "Keine Beziehung angegeben." };

  removeRelation(id);

  revalidateCMDB(String(formData.get("fromCi") ?? "") || undefined);
  return { ok: true, message: "Beziehung entfernt." };
}

/* ── Ticket ↔ item ───────────────────────────────────────────────────────── */

/**
 * Attach an asset to a ticket.
 *
 * Technician and above only — a reporter cannot state which asset their ticket is
 * about, because the list of assets is not theirs to browse. They describe the problem;
 * the technician records which thing it turned out to be.
 */
export async function attachCIToTicketAction(
  _previous: CMDBActionResult | null,
  formData: FormData,
): Promise<CMDBActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const ticketId = String(formData.get("ticketId") ?? "");
  const ciId = String(formData.get("ciId") ?? "");
  if (!ticketId || !ciId) return { ok: false, error: "Kein Objekt gewählt." };

  let item;
  try {
    item = attachCIToTicket(ticketId, ciId, auth.user.id);
  } catch (error) {
    if (error instanceof CMDBError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath(`/mits/cmdb/${ciId}`);
  return { ok: true, message: `${item.name} verknüpft.` };
}

export async function detachCIFromTicketAction(
  _previous: CMDBActionResult | null,
  formData: FormData,
): Promise<CMDBActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const ticketId = String(formData.get("ticketId") ?? "");
  const ciId = String(formData.get("ciId") ?? "");
  if (!ticketId || !ciId) return { ok: false, error: "Kein Objekt gewählt." };

  detachCIFromTicket(ticketId, ciId);

  revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath(`/mits/cmdb/${ciId}`);
  return { ok: true, message: "Verknüpfung entfernt." };
}
