import "server-only";

import { bearerToken, verifyApiKey } from "@/lib/api-keys";
import { API_TOKEN_HEADER, isValidApiToken } from "@/lib/api-tokens";
import { requireApiRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import {
  formatInventoryNumber,
  type MITSConfigurationItem,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Shared guard and shape for the CMDB REST endpoints.

   Three ways in, in this order:

   1. `Authorization: Bearer mits_live_…` — a named key from `lib/api-keys.ts`, so an
      admin can see which system is calling and revoke one without the others.
   2. `X-MITS-API-Token` — the older shared instance token. Still accepted because it
      is configured on running instances; dropping it would break them on update.
   3. A signed-in agent or admin — so the same URL can be opened in a browser.

   Tokens first, because a machine caller sends no cookies and evaluating the session
   path first would mean a database read per request for nothing.

   Both are checked here rather than per route so a new endpoint cannot ship with half
   the rule. The module flag is part of the guard: a switched-off CMDB answers 404, not
   an empty list — an empty list is a claim about the inventory.
   ────────────────────────────────────────────────────────────────────────── */

export type ApiGuard = { ok: true } | { ok: false; response: Response };

export async function guardCMDBRequest(request: Request): Promise<ApiGuard> {
  if (!isFeatureEnabled("feature_cmdb")) {
    return {
      ok: false,
      response: Response.json({ error: "Die CMDB ist abgeschaltet." }, { status: 404 }),
    };
  }

  if (verifyApiKey(bearerToken(request.headers.get("authorization")))) {
    return { ok: true };
  }

  if (isValidApiToken(request.headers.get(API_TOKEN_HEADER))) {
    return { ok: true };
  }

  const auth = await requireApiRole("agent", request);
  if ("response" in auth) return { ok: false, response: auth.response };

  return { ok: true };
}

/**
 * The wire shape of an item.
 *
 * Explicit rather than serialising the row, so adding an internal column does not
 * silently publish it. Dates go out as ISO strings; the date-only columns stay in their
 * `YYYY-MM-DD` form because that is what they mean.
 */
export function itemToJson(item: MITSConfigurationItem): Record<string, unknown> {
  return {
    id: item.id,
    /*
     * Both forms of the MITS number: the counter for a caller that stores it, the
     * formatted string so an external system prints the same thing MITS does. It is
     * read-only over the wire — `itemFromJson` does not accept either, and the store
     * would ignore it if it did.
     */
    inventory_number: item.inventory_number,
    inventory_label: formatInventoryNumber(item.inventory_number),
    asset_tag: item.asset_tag,
    name: item.name,
    type: item.type,
    status: item.status,
    organization_id: item.organization_id,
    location_id: item.location_id,
    assigned_user_id: item.assigned_user_id,
    manufacturer: item.manufacturer,
    model: item.model,
    serial_number: item.serial_number,
    purchased_on: item.purchased_on,
    warranty_until: item.warranty_until,
    seats_total: item.seats_total,
    expires_at: item.expires_at,
    note: item.note,
    attributes: item.attributes,
    created_at: item.created_at.toISOString(),
    updated_at: item.updated_at.toISOString(),
  };
}

