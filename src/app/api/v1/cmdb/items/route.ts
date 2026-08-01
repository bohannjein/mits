import { guardCMDBRequest, itemToJson } from "@/lib/cmdb-api";
import { importItemRecords, type ImportRecord } from "@/lib/cmdb-import";
import { cmdbCounts, listConfigurationItems, type CIFilter } from "@/lib/cmdb";
import { CIStatus, CIType } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   GET  /api/v1/cmdb/items   — read the inventory, filtered and paged
   POST /api/v1/cmdb/items   — create or update one item

   Authorization in `guardCMDBRequest`: an API token, or a signed-in agent. Enforced
   here and not in the proxy, which is not a security boundary.

   POST goes through the same import path as the CSV importer, so an item created over the
   API is matched by asset tag and resolves its company by name exactly as an imported row
   does. One rule, one implementation.
   ────────────────────────────────────────────────────────────────────────── */

/** A page, not a dump. A caller wanting everything asks repeatedly with an offset. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const guard = await guardCMDBRequest(request);
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;

  // Unknown enum values are dropped rather than passed through: a filter matching
  // nothing looks exactly like an empty inventory.
  const type = CIType.safeParse(params.get("type"));
  const status = CIStatus.safeParse(params.get("status"));

  const filter: CIFilter = {
    ...(params.get("q") ? { q: params.get("q") as string } : {}),
    ...(type.success ? { type: type.data } : {}),
    ...(status.success ? { status: status.data } : {}),
    ...(params.get("organization_id")
      ? { organizationId: params.get("organization_id") as string }
      : {}),
    ...(params.get("location_id")
      ? { locationId: params.get("location_id") as string }
      : {}),
    ...(params.get("assigned_user_id")
      ? { assignedUserId: params.get("assigned_user_id") as string }
      : {}),
  };

  const all = listConfigurationItems(filter);

  const offset = clampInt(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = clampInt(params.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const page = all.slice(offset, offset + limit);

  return Response.json({
    items: page.map(itemToJson),
    // `matched` is the filtered count, `total` the whole inventory — a caller paging
    // through needs the first, a dashboard the second.
    matched: all.length,
    total: cmdbCounts().total,
    offset,
    limit,
  });
}

export async function POST(request: Request) {
  const guard = await guardCMDBRequest(request);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Kein gültiges JSON." }, { status: 400 });
  }

  const record = toImportRecord(body);
  if (!record) {
    return Response.json(
      { error: "Ein Objekt braucht mindestens ein Feld name." },
      { status: 400 },
    );
  }

  const summary = importItemRecords([record]);

  if (summary.skipped.length > 0) {
    return Response.json(
      { error: summary.skipped[0].reason },
      { status: 422 },
    );
  }

  /*
   * 201 only for a genuine create. A caller re-posting the same asset tag has updated
   * something, and telling them it was created would make an idempotent sync look like a
   * growing inventory.
   */
  return Response.json(
    { created: summary.created, updated: summary.updated },
    { status: summary.created > 0 ? 201 : 200 },
  );
}

/**
 * A JSON body to an import record.
 *
 * Every value stringified, because the import path coerces from strings — that is what
 * keeps `"31.12.2026"` and `"2026-12-31"` and a numeric seat count all going through the
 * same two functions the CSV path uses. Returns null when there is no name, which is the
 * one field nothing can be derived from.
 */
function toImportRecord(body: unknown): ImportRecord | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;

  const text = (field: string): string | undefined => {
    const value = raw[field];
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object") return undefined;
    return String(value);
  };

  const name = text("name")?.trim();
  if (!name) return null;

  const attributes =
    raw.attributes && typeof raw.attributes === "object" && !Array.isArray(raw.attributes)
      ? Object.fromEntries(
          Object.entries(raw.attributes as Record<string, unknown>).map(
            ([key, value]) => [key, value === null ? "" : String(value)],
          ),
        )
      : undefined;

  return {
    name,
    asset_tag: text("asset_tag"),
    type: text("type"),
    status: text("status"),
    // Both spellings: a caller holding an id sends `_id`, an exporter sends the name.
    organization: text("organization") ?? text("organization_id"),
    location: text("location") ?? text("location_id"),
    assigned_email: text("assigned_email") ?? text("assigned_user_id"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serial_number: text("serial_number"),
    purchased_on: text("purchased_on"),
    warranty_until: text("warranty_until"),
    seats_total: text("seats_total"),
    expires_at: text("expires_at"),
    note: text("note"),
    attributes,
  };
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
