import { guardCMDBRequest } from "@/lib/cmdb-api";
import {
  MAX_SYNC_RECORDS,
  importItemRecords,
  type ImportRecord,
} from "@/lib/cmdb-import";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/v1/cmdb/sync — upsert many items in one call.

   For a discovery agent: it posts what it found, MITS matches by asset tag and updates
   rather than duplicating. The same code path as the CSV importer, so the rules about
   partial data are identical — an agent that only knows tags and serials does not wipe
   the manufacturer somebody typed in.

   Answers with the same summary the import mask shows, so an agent can log what its run
   actually changed. A record without a name is reported in `skipped` and does not fail
   the call: one bad entry out of four hundred must not discard the other 399.
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const guard = await guardCMDBRequest(request);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Kein gültiges JSON." }, { status: 400 });
  }

  // Either `{ items: [...] }` or a bare array. Both are what a caller writes first.
  const raw = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
      ? ((body as { items: unknown[] }).items)
      : null;

  if (!raw) {
    return Response.json(
      { error: "Erwartet wird ein Array oder ein Objekt mit items." },
      { status: 400 },
    );
  }

  if (raw.length > MAX_SYNC_RECORDS) {
    return Response.json(
      {
        error: `Höchstens ${MAX_SYNC_RECORDS} Objekte pro Aufruf.`,
      },
      { status: 413 },
    );
  }

  const records: ImportRecord[] = raw.map((entry, index) => {
    const line = index + 1;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      // Kept rather than dropped, so the reported row numbers still match the request.
      return { name: "", sourceLine: line };
    }

    const object = entry as Record<string, unknown>;
    const text = (field: string): string | undefined => {
      const value = object[field];
      if (value === null || value === undefined || typeof value === "object") {
        return undefined;
      }
      return String(value);
    };

    const attributes =
      object.attributes &&
      typeof object.attributes === "object" &&
      !Array.isArray(object.attributes)
        ? Object.fromEntries(
            Object.entries(object.attributes as Record<string, unknown>).map(
              ([key, value]) => [key, value === null ? "" : String(value)],
            ),
          )
        : undefined;

    return {
      sourceLine: line,
      name: text("name") ?? "",
      asset_tag: text("asset_tag"),
      type: text("type"),
      status: text("status"),
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
  });

  const summary = importItemRecords(records);
  return Response.json(summary);
}
