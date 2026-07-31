import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/sqlite";
import { MITSLocationSchema, type MITSLocation } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Locations (branches / sites).

   A real table rather than a settings blob, unlike the portal lists: tickets
   reference a location by id, so the rows have to be individually addressable and
   are expected to outlive several edits of the list.

   No foreign key from `mits_ticket.location_id`. Deleting a branch must not
   delete its tickets, and a ticket whose location is gone should still open —
   `resolveLocation` returns null and the UI shows the ticket without a site.
   ────────────────────────────────────────────────────────────────────────── */

interface LocationRow {
  id: string;
  name: string;
  code: string;
  city: string;
  active: number;
}

function rowToLocation(row: LocationRow): MITSLocation {
  return MITSLocationSchema.parse({
    id: row.id,
    name: row.name,
    code: row.code,
    city: row.city,
    // SQLite has no boolean.
    active: row.active === 1,
  });
}

export class LocationError extends Error {}

export function listLocations(): MITSLocation[] {
  const rows = db
    .prepare(
      "SELECT id, name, code, city, active FROM mits_location ORDER BY name ASC",
    )
    .all() as LocationRow[];
  return rows.map(rowToLocation);
}

/** Only the ones a reporter may pick. Inactive rows stay for existing tickets. */
export function listActiveLocations(): MITSLocation[] {
  return listLocations().filter((location) => location.active);
}

export function getLocation(id: string): MITSLocation | null {
  const row = db
    .prepare("SELECT id, name, code, city, active FROM mits_location WHERE id = ?")
    .get(id) as LocationRow | undefined;
  return row ? rowToLocation(row) : null;
}

/**
 * Replace the whole list in one transaction.
 *
 * The admin table is edited as a list and submitted as a list, so a diff-based
 * API would only move the bookkeeping into the form. Rows absent from `next` are
 * deleted; `mits_ticket.location_id` may then dangle, which `resolveLocation`
 * handles.
 */
export function replaceLocations(next: MITSLocation[]): MITSLocation[] {
  const locations = next.map((location) =>
    MITSLocationSchema.parse({
      ...location,
      id: location.id.trim() || randomUUID(),
    }),
  );

  const names = new Set<string>();
  for (const location of locations) {
    const key = location.name.trim().toLowerCase();
    if (names.has(key)) {
      throw new LocationError(`Standort doppelt vergeben: ${location.name}`);
    }
    names.add(key);
  }

  const ids = new Set(locations.map((location) => location.id));

  db.transaction(() => {
    const existing = db.prepare("SELECT id FROM mits_location").all() as {
      id: string;
    }[];

    const remove = db.prepare("DELETE FROM mits_location WHERE id = ?");
    for (const row of existing) {
      if (!ids.has(row.id)) remove.run(row.id);
    }

    const upsert = db.prepare(
      `INSERT INTO mits_location (id, name, code, city, active)
       VALUES (@id, @name, @code, @city, @active)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         code = excluded.code,
         city = excluded.city,
         active = excluded.active`,
    );

    for (const location of locations) {
      upsert.run({ ...location, active: location.active ? 1 : 0 });
    }
  })();

  return listLocations();
}

/** Ticket count per location, for the heatmap. Tickets without a site are dropped. */
export function ticketCountsByLocation(): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT location_id AS id, COUNT(*) AS count
         FROM mits_ticket
        -- Soft-deleted tickets do not count towards a branch's load.
        WHERE deleted_at IS NULL
          AND location_id IS NOT NULL
        GROUP BY location_id`,
    )
    .all() as { id: string; count: number }[];

  return Object.fromEntries(rows.map((row) => [row.id, row.count]));
}
