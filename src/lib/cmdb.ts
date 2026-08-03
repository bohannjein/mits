import "server-only";

import { randomUUID } from "node:crypto";

import { db, nextInventoryNumber } from "@/lib/db/sqlite";
import {
  CIRelationKind,
  CIStatus,
  CIType,
  MITSCIRelationSchema,
  MITSConfigurationItemSchema,
  SEAT_RELATION,
  normaliseCIAttributes,
  parseInventoryNumber,
  seatUsage,
  type MITSCIRelation,
  type MITSConfigurationItem,
  type SeatUsage,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   CMDB store.

   One table for every asset kind; see the comment on MITSConfigurationItemSchema.

   Seats are never stored. `seatUsage` counts the `licensed_for` relations pointing out
   of the licence, so "used" is a consequence of assignments rather than a number
   somebody has to remember to decrement. A stored counter and a relation table would
   disagree the first time an asset is deleted, and the disagreement would be a
   compliance figure nobody re-checks.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Soft-deleted items are invisible to every read.
 *
 * Same convention as `lib/tickets.ts`: named and appended per query, so
 * `grep ALIVE src/lib/cmdb.ts` audits the file. A read path without it is a deletion
 * that appears not to have worked.
 */
const ALIVE = "deleted_at IS NULL";

const SELECT_CI = `
  SELECT id, inventory_number, asset_tag, name, type, status, organization_id,
         location_id, assigned_user_id, manufacturer, model, serial_number,
         purchased_on, warranty_until, seats_total, expires_at, note, attributes,
         created_at, updated_at
    FROM mits_configuration_item
`;

interface CIRow {
  id: string;
  /** NULL only between the column being added and the startup backfill. */
  inventory_number: number | null;
  asset_tag: string;
  name: string;
  type: string;
  status: string;
  organization_id: string | null;
  location_id: string | null;
  assigned_user_id: string | null;
  manufacturer: string;
  model: string;
  serial_number: string;
  purchased_on: string;
  warranty_until: string;
  seats_total: number;
  expires_at: string;
  note: string;
  attributes: string;
  created_at: string;
  updated_at: string;
}

export class CMDBError extends Error {}

function rowToItem(row: CIRow): MITSConfigurationItem {
  /*
   * A stored attribute blob that no longer parses must not take the row with it. The
   * column is written by this module, by the importer and by the API — three writers,
   * and the reader is a detail page somebody opened to find out what is going on.
   */
  let attributes: Record<string, string> = {};
  try {
    attributes = normaliseCIAttributes(JSON.parse(row.attributes) as never);
  } catch {
    attributes = {};
  }

  return MITSConfigurationItemSchema.parse({ ...row, attributes });
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

export interface CIFilter {
  /** Matches name, asset tag, serial and model. */
  q?: string;
  type?: CIType;
  status?: CIStatus;
  organizationId?: string;
  locationId?: string;
  assignedUserId?: string;
}

/**
 * The item list, filtered.
 *
 * Every clause is a bound parameter and every filter narrows — there is no code path
 * that widens the set beyond "alive items", which is what the whole CMDB is for a
 * agent. Reporters never reach this: the pages are behind `requireRole`.
 */
export function listConfigurationItems(
  filter: CIFilter = {},
): MITSConfigurationItem[] {
  const clauses = [ALIVE];
  const params: unknown[] = [];

  const q = filter.q?.trim();
  if (q) {
    /*
     * An inventory number is searched as a number, not as text.
     *
     * `INV-10000042`, `inv 42` and `42` all mean object 42 — the counter is stored
     * without the prefix and without the leading digit, so a `LIKE '%INV-100…%'`
     * over the column would match nothing at all. `parseInventoryNumber` does the
     * reverse of the formatter, and a term that is not a number simply leaves this
     * clause out.
     */
    const number = parseInventoryNumber(q);
    clauses.push(
      `(name LIKE ? OR asset_tag LIKE ? OR serial_number LIKE ? OR model LIKE ?${
        number === null ? "" : " OR inventory_number = ?"
      })`,
    );
    // Escaped nowhere on purpose: LIKE has no injection surface through a bound
    // parameter, and a literal % in a search term matching more is not a defect.
    const like = `%${q}%`;
    params.push(like, like, like, like);
    if (number !== null) params.push(number);
  }
  if (filter.type) {
    clauses.push("type = ?");
    params.push(filter.type);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.organizationId) {
    clauses.push("organization_id = ?");
    params.push(filter.organizationId);
  }
  if (filter.locationId) {
    clauses.push("location_id = ?");
    params.push(filter.locationId);
  }
  if (filter.assignedUserId) {
    clauses.push("assigned_user_id = ?");
    params.push(filter.assignedUserId);
  }

  const rows = db
    .prepare(
      `${SELECT_CI} WHERE ${clauses.join(" AND ")}
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(...params) as CIRow[];
  return rows.map(rowToItem);
}

export function getConfigurationItem(id: string): MITSConfigurationItem | null {
  const row = db.prepare(`${SELECT_CI} WHERE ${ALIVE} AND id = ?`).get(id) as
    | CIRow
    | undefined;
  return row ? rowToItem(row) : null;
}

/**
 * The item carrying this serial number, for a machine caller that knows the
 * device but not the MITS id.
 *
 * Nothing enforces that a serial appears once — two vendors do reuse each
 * other's formats, and an import from a dirty export will happily land a
 * duplicate. The oldest row wins, deterministically, so a webhook that fires
 * twice attaches the same object both times instead of alternating between two.
 * An empty serial matches nothing rather than the first row with a blank
 * column, which is most of the inventory.
 */
export function findCIBySerial(serial: string): MITSConfigurationItem | null {
  const value = serial.trim();
  if (!value) return null;

  const row = db
    .prepare(
      `${SELECT_CI} WHERE ${ALIVE} AND serial_number = ?
        ORDER BY created_at ASC LIMIT 1`,
    )
    .get(value) as CIRow | undefined;

  return row ? rowToItem(row) : null;
}

/** Resolve several at once, for a relation list or a ticket's attached items. */
export function getConfigurationItems(ids: string[]): MITSConfigurationItem[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `${SELECT_CI} WHERE ${ALIVE} AND id IN (${placeholders})
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(...ids) as CIRow[];
  return rows.map(rowToItem);
}

/** Count per type and per status, for the overview header. Two queries, not N. */
export function cmdbCounts(): {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
} {
  const byType = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT type AS k, COUNT(*) AS n FROM mits_configuration_item
            WHERE ${ALIVE} GROUP BY type`,
        )
        .all() as { k: string; n: number }[]
    ).map((row) => [row.k, row.n]),
  );

  const byStatus = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT status AS k, COUNT(*) AS n FROM mits_configuration_item
            WHERE ${ALIVE} GROUP BY status`,
        )
        .all() as { k: string; n: number }[]
    ).map((row) => [row.k, row.n]),
  );

  const total = Object.values(byType).reduce((sum, n) => sum + n, 0);
  return { total, byType, byStatus };
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

/**
 * What a caller may set on an item.
 *
 * `inventory_number` is left **out** rather than made optional, the same way
 * `MITSTicketDraftSchema` omits `created_by`: MITS owns that number, and a field a
 * form could fill in is a field a hand-built request can fill in too. An attempt to
 * pass one does not compile.
 */
export interface CIInput
  extends Omit<
    MITSConfigurationItem,
    "created_at" | "updated_at" | "inventory_number"
  > {}

/**
 * Create or update one item. An empty `id` means create.
 *
 * The asset tag is unique among live items, enforced by a partial index *and* checked
 * here — the index gives the guarantee, this gives the sentence a human can act on.
 */
export function saveConfigurationItem(input: CIInput): MITSConfigurationItem {
  const now = new Date().toISOString();
  const parsed = MITSConfigurationItemSchema.safeParse({
    ...input,
    id: input.id.trim() || randomUUID(),
    attributes: normaliseCIAttributes(input.attributes),
    created_at: now,
    updated_at: now,
  });
  if (!parsed.success) {
    throw new CMDBError(
      parsed.error.issues[0]?.message ?? "Die Angaben sind unvollständig.",
    );
  }

  /*
   * The inventory number comes from the counter, never from the caller.
   *
   * Same rule as `created_by` on a ticket: `CIInput` cannot set it, an existing row
   * keeps the number it already has, and a new one is allocated here. Read
   * *including* soft-deleted rows — an object that is restored has to come back
   * with the number that is on the sticker.
   *
   * Allocation and insert are one statement apart inside the same synchronous
   * writer, which is what makes `MAX + 1` safe; see `nextInventoryNumber`.
   */
  const stored = db
    .prepare(
      "SELECT inventory_number FROM mits_configuration_item WHERE id = ?",
    )
    .get(parsed.data.id) as { inventory_number: number | null } | undefined;

  const item = {
    ...parsed.data,
    name: parsed.data.name.trim(),
    asset_tag: parsed.data.asset_tag.trim(),
    inventory_number: stored?.inventory_number ?? nextInventoryNumber(),
  };

  if (item.asset_tag) {
    const clash = db
      .prepare(
        `SELECT id FROM mits_configuration_item
          WHERE ${ALIVE} AND asset_tag = ? AND id <> ?`,
      )
      .get(item.asset_tag, item.id) as { id: string } | undefined;
    if (clash) {
      throw new CMDBError(`Fremdnummer bereits vergeben: ${item.asset_tag}`);
    }
  }

  db.prepare(
    /*
     * `inventory_number` is in the INSERT and deliberately **not** in the UPDATE
     * list: it is assigned once and then immutable. An update that carried it would
     * make a relabelled object silently change its number.
     *
     * Every key the bound object carries has to appear here — better-sqlite3
     * refuses an object with unused keys rather than ignoring them, which is how
     * `edited_at` once turned every reply into a 500. Two halves, one contract.
     */
    `INSERT INTO mits_configuration_item
       (id, inventory_number, asset_tag, name, type, status, organization_id,
        location_id, assigned_user_id, manufacturer, model, serial_number,
        purchased_on, warranty_until, seats_total, expires_at, note, attributes,
        created_at, updated_at)
     VALUES
       (@id, @inventory_number, @asset_tag, @name, @type, @status,
        @organization_id, @location_id, @assigned_user_id, @manufacturer, @model,
        @serial_number, @purchased_on, @warranty_until, @seats_total, @expires_at,
        @note, @attributes, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       asset_tag        = excluded.asset_tag,
       name             = excluded.name,
       type             = excluded.type,
       status           = excluded.status,
       organization_id  = excluded.organization_id,
       location_id      = excluded.location_id,
       assigned_user_id = excluded.assigned_user_id,
       manufacturer     = excluded.manufacturer,
       model            = excluded.model,
       serial_number    = excluded.serial_number,
       purchased_on     = excluded.purchased_on,
       warranty_until   = excluded.warranty_until,
       seats_total      = excluded.seats_total,
       expires_at       = excluded.expires_at,
       note             = excluded.note,
       attributes       = excluded.attributes,
       updated_at       = excluded.updated_at`,
  ).run({
    ...item,
    attributes: JSON.stringify(item.attributes),
    created_at: now,
    updated_at: now,
  });

  return item;
}

/**
 * Soft-delete an item and drop what only made sense while it existed.
 *
 * Relations and ticket attachments are removed for real, the item itself is only
 * flagged. The asymmetry is deliberate: the item carries the history somebody would
 * want back, a relation to it does not — and a restored item silently re-attached to
 * tickets it was detached from would be worse than re-linking by hand.
 *
 * One transaction, so an item never ends up flagged with its relations still standing.
 */
export function deleteConfigurationItem(id: string): void {
  db.transaction(() => {
    db.prepare(
      `UPDATE mits_configuration_item SET deleted_at = ?
        WHERE id = ? AND ${ALIVE}`,
    ).run(new Date().toISOString(), id);
    db.prepare("DELETE FROM mits_ci_relation WHERE from_ci = ? OR to_ci = ?").run(
      id,
      id,
    );
    db.prepare("DELETE FROM mits_ticket_ci WHERE ci_id = ?").run(id);
  })();
}

/* ── Relations ───────────────────────────────────────────────────────────── */

export interface ResolvedRelation {
  relation: MITSCIRelation;
  /** The item at the other end. */
  other: MITSConfigurationItem;
  /** True when this row was stated from the other side and is being read inverted. */
  inverted: boolean;
}

/**
 * Every relation touching this item, from both directions.
 *
 * A row whose other end is soft-deleted is left out entirely rather than shown as
 * "unknown": the relation described a thing that no longer exists, and a placeholder
 * row is a puzzle rather than information.
 */
export function listRelationsFor(ciId: string): ResolvedRelation[] {
  const rows = db
    .prepare(
      `SELECT id, from_ci, to_ci, kind, created_by, created_at
         FROM mits_ci_relation
        WHERE from_ci = ? OR to_ci = ?
        ORDER BY created_at ASC`,
    )
    .all(ciId, ciId) as {
    id: string;
    from_ci: string;
    to_ci: string;
    kind: string;
    created_by: string;
    created_at: string;
  }[];

  const otherIds = rows.map((row) => (row.from_ci === ciId ? row.to_ci : row.from_ci));
  const items = new Map(
    getConfigurationItems([...new Set(otherIds)]).map((item) => [item.id, item]),
  );

  const out: ResolvedRelation[] = [];
  for (const row of rows) {
    const inverted = row.from_ci !== ciId;
    const otherId = inverted ? row.from_ci : row.to_ci;
    const other = items.get(otherId);
    if (!other) continue;

    const parsed = MITSCIRelationSchema.safeParse(row);
    if (!parsed.success) continue;

    out.push({ relation: parsed.data, other, inverted });
  }
  return out;
}

/**
 * State a relation.
 *
 * Refuses a self-relation, refuses the same statement twice, and refuses the reverse of
 * the same kind — "A part of B" plus "B part of A" is not two facts, it is one fact
 * entered from both ends, and keeping both would make the graph read differently
 * depending on which item you opened.
 */
export function addRelation(
  fromCi: string,
  toCi: string,
  kind: CIRelationKind,
  actorId: string,
): MITSCIRelation {
  if (fromCi === toCi) {
    throw new CMDBError("Ein Objekt kann nicht mit sich selbst verknüpft werden.");
  }
  if (!getConfigurationItem(fromCi) || !getConfigurationItem(toCi)) {
    throw new CMDBError("Eines der beiden Objekte existiert nicht.");
  }

  const existing = db
    .prepare(
      `SELECT id FROM mits_ci_relation
        WHERE kind = ?
          AND ((from_ci = ? AND to_ci = ?) OR (from_ci = ? AND to_ci = ?))`,
    )
    .get(kind, fromCi, toCi, toCi, fromCi) as { id: string } | undefined;
  if (existing) {
    throw new CMDBError("Diese Verknüpfung besteht bereits.");
  }

  const relation = MITSCIRelationSchema.parse({
    id: randomUUID(),
    from_ci: fromCi,
    to_ci: toCi,
    kind,
    created_by: actorId,
    created_at: new Date().toISOString(),
  });

  db.prepare(
    `INSERT INTO mits_ci_relation (id, from_ci, to_ci, kind, created_by, created_at)
     VALUES (@id, @from_ci, @to_ci, @kind, @created_by, @created_at)`,
  ).run({ ...relation, created_at: relation.created_at.toISOString() });

  return relation;
}

export function removeRelation(id: string): void {
  db.prepare("DELETE FROM mits_ci_relation WHERE id = ?").run(id);
}

/* ── Licences and seats ──────────────────────────────────────────────────── */

export interface LicenceRecord {
  item: MITSConfigurationItem;
  seats: SeatUsage;
}

/**
 * Seats used per licence, counted from the relations.
 *
 * One grouped query for the whole list rather than one per licence: the licence page
 * shows every row with a bar, and a per-row count is the classic N+1 that only shows up
 * once an instance has real data.
 *
 * A relation whose target is soft-deleted does not count — the seat was freed when the
 * laptop was scrapped, and counting it would keep an instance permanently overbooked.
 */
export function seatCounts(): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT r.from_ci AS id, COUNT(*) AS n
         FROM mits_ci_relation r
         JOIN mits_configuration_item target ON target.id = r.to_ci
        WHERE r.kind = ? AND target.deleted_at IS NULL
        GROUP BY r.from_ci`,
    )
    .all(SEAT_RELATION) as { id: string; n: number }[];

  return Object.fromEntries(rows.map((row) => [row.id, row.n]));
}

export function listLicences(filter: Omit<CIFilter, "type"> = {}): LicenceRecord[] {
  const items = listConfigurationItems({ ...filter, type: "license" });
  const used = seatCounts();

  return items.map((item) => ({
    item,
    seats: seatUsage(item.seats_total, used[item.id] ?? 0),
  }));
}

export function seatUsageFor(licenceId: string, total: number): SeatUsage {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM mits_ci_relation r
         JOIN mits_configuration_item target ON target.id = r.to_ci
        WHERE r.kind = ? AND r.from_ci = ? AND target.deleted_at IS NULL`,
    )
    .get(SEAT_RELATION, licenceId) as { n: number };
  return seatUsage(total, row.n);
}

/* ── Tickets ↔ items ─────────────────────────────────────────────────────── */

/** Items attached to a ticket. Soft-deleted ones drop out with the JOIN. */
export function listCIsForTicket(ticketId: string): MITSConfigurationItem[] {
  const rows = db
    .prepare(
      `SELECT ci_id AS id FROM mits_ticket_ci
        WHERE ticket_id = ? ORDER BY created_at ASC`,
    )
    .all(ticketId) as { id: string }[];
  return getConfigurationItems(rows.map((row) => row.id));
}

/** Tickets an item appears in, newest first. Ids only — the caller applies scope. */
export function ticketIdsForCI(ciId: string): string[] {
  const rows = db
    .prepare(
      `SELECT ticket_id AS id FROM mits_ticket_ci
        WHERE ci_id = ? ORDER BY created_at DESC`,
    )
    .all(ciId) as { id: string }[];
  return rows.map((row) => row.id);
}

export function attachCIToTicket(
  ticketId: string,
  ciId: string,
  actorId: string,
): MITSConfigurationItem {
  const item = getConfigurationItem(ciId);
  if (!item) throw new CMDBError("Das Objekt existiert nicht.");

  db.prepare(
    `INSERT INTO mits_ticket_ci (ticket_id, ci_id, created_by, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ticket_id, ci_id) DO NOTHING`,
  ).run(ticketId, ciId, actorId, new Date().toISOString());

  return item;
}

export function detachCIFromTicket(ticketId: string, ciId: string): void {
  db.prepare("DELETE FROM mits_ticket_ci WHERE ticket_id = ? AND ci_id = ?").run(
    ticketId,
    ciId,
  );
}

/**
 * What the reporter of this ticket probably means.
 *
 * Their own assigned items first, then everything at their site — the two answers to
 * "which device is this about" that do not require the agent to know the inventory. An
 * item already attached is left out; offering it again is an action that does nothing.
 *
 * A suggestion, not a filter: the full search stays available, because the device
 * somebody is complaining about is regularly not the one on their desk.
 */
export function suggestCIsForTicket(
  ticketId: string,
  reporterId: string,
  locationId: string | null,
): { assigned: MITSConfigurationItem[]; onSite: MITSConfigurationItem[] } {
  const attached = new Set(listCIsForTicket(ticketId).map((item) => item.id));

  /*
   * Two groups, kept apart rather than concatenated.
   *
   * They answer different questions and deserve different confidence. "This is
   * the reporter's laptop" is nearly always the right object; "this is something
   * else at their site" is a shortlist worth scanning. Merged into one list the
   * agent cannot tell which is which, and the first plausible name wins — which
   * on a shared site is regularly the wrong device.
   */
  const seen = new Set<string>();
  const take = (items: MITSConfigurationItem[], limit: number) => {
    const out: MITSConfigurationItem[] = [];
    for (const item of items) {
      if (attached.has(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  };

  // The reporter's own first, so their entries claim the ids before the site list
  // can — a laptop that is both is theirs, not "something at the office".
  const assigned = take(listConfigurationItems({ assignedUserId: reporterId }), 8);
  const onSite = take(
    locationId ? listConfigurationItems({ locationId }) : [],
    // Enough to pick from without turning the sidebar into a second inventory list.
    6,
  );

  return { assigned, onSite };
}
