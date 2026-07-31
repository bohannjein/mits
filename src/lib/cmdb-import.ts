import "server-only";

import { getConfigurationItem, saveConfigurationItem } from "@/lib/cmdb";
import {
  ATTRIBUTE_PREFIX,
  coerceCIStatus,
  coerceCIType,
  normaliseImportDate,
  parseDelimited,
  parseSeats,
  type ColumnMapping,
} from "@/lib/csv";
import { db } from "@/lib/db/sqlite";
import { listLocations } from "@/lib/locations";
import { listOrganizations } from "@/lib/organizations";
import { listUsers } from "@/lib/users";
import {
  CIStatus,
  CIType,
  normaliseCIAttributes,
  type MITSConfigurationItem,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Bulk import, from a CSV file or from the sync endpoint.

   One code path for both. The CSV importer maps columns to `ImportRecord` and the API
   maps a JSON body to the same shape — everything after that (matching, resolving,
   keeping unmapped fields) happens once. Two implementations of "update the item with
   this tag" would differ in exactly the rule that matters.

   Matching is by asset tag: a record whose tag already exists **updates** that item
   rather than creating a second one. That is what makes a re-import of a corrected
   export idempotent, which is how an inventory actually gets cleaned up. A record
   without a tag is always a create, because there is nothing to match on and guessing by
   name would merge two identically named laptops.

   Organizations, sites and people are resolved by their human-readable value — an export
   contains "Weller GmbH", not a UUID. Matched case-insensitively against name, code and
   mail address; an unresolvable reference leaves the field empty and is reported, rather
   than failing the record. An asset with no owner is a fixable record; a refused one is
   an asset nobody knows exists.

   Every value arrives as a string, including seat counts and dates. That keeps coercion
   in one place: `parseSeats` and `normaliseImportDate` are what a spreadsheet cell and a
   JSON field both go through, so the API cannot accept a date shape the CSV path rejects.
   ────────────────────────────────────────────────────────────────────────── */

/** One incoming row, already reduced to named fields. Everything optional but the name. */
export interface ImportRecord {
  name: string;
  asset_tag?: string;
  type?: string;
  status?: string;
  organization?: string;
  location?: string;
  assigned_email?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  purchased_on?: string;
  warranty_until?: string;
  seats_total?: string;
  expires_at?: string;
  note?: string;
  attributes?: Record<string, string>;
  /** For the report. The CSV path passes the spreadsheet line, the API the index. */
  sourceLine?: number;
}

export interface ImportSummary {
  created: number;
  updated: number;
  /** Records that could not become an item at all, with the reason. */
  skipped: { row: number; reason: string }[];
  /** Values that did not resolve. Counted per value, not per record. */
  unresolved: { value: string; kind: string }[];
  total: number;
}

/** Above this, a caller is not syncing an inventory. */
export const MAX_SYNC_RECORDS = 5000;

/**
 * Import record by record, not as one transaction.
 *
 * A real export is dirty, and an all-or-nothing import of eight hundred assets fails on
 * row six hundred and leaves the admin with nothing to work from. Writing as it goes and
 * reporting per row means a second run — with the six rows fixed — completes the job,
 * and the already-imported ones update instead of duplicating.
 */
export function importItemRecords(records: ImportRecord[]): ImportSummary {
  /*
   * The id is a key as well as the name and the code. A CSV never carries one, but the
   * API does — a caller that already holds an organization id should not have to look up
   * its name to write it. One table for both instead of two lookup paths that can
   * disagree about what resolves.
   */
  const organizationBy = new Map<string, string>();
  for (const organization of listOrganizations()) {
    organizationBy.set(key(organization.id), organization.id);
    organizationBy.set(key(organization.name), organization.id);
    if (organization.code) organizationBy.set(key(organization.code), organization.id);
  }

  const locationBy = new Map<string, string>();
  for (const location of listLocations()) {
    locationBy.set(key(location.id), location.id);
    locationBy.set(key(location.name), location.id);
    if (location.code) locationBy.set(key(location.code), location.id);
  }

  const personBy = new Map<string, string>();
  for (const person of listUsers()) {
    personBy.set(key(person.id), person.id);
    personBy.set(key(person.email), person.id);
    personBy.set(key(person.name), person.id);
  }

  /*
   * Tags already taken, so a file containing the same tag twice does not fail on the
   * unique index halfway through. The second occurrence updates the row the first one
   * created — the same rule that makes a re-import idempotent.
   */
  const existingByTag = new Map<string, string>(
    (
      db
        .prepare(
          `SELECT id, asset_tag FROM mits_configuration_item
            WHERE deleted_at IS NULL AND asset_tag <> ''`,
        )
        .all() as { id: string; asset_tag: string }[]
    ).map((row) => [key(row.asset_tag), row.id]),
  );

  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    skipped: [],
    unresolved: [],
    total: records.length,
  };

  const unresolvedSeen = new Set<string>();
  const noteUnresolved = (kind: string, value: string) => {
    const id = `${kind}:${key(value)}`;
    if (unresolvedSeen.has(id)) return;
    unresolvedSeen.add(id);
    summary.unresolved.push({ kind, value });
  };

  records.forEach((record, index) => {
    const line = record.sourceLine ?? index + 1;

    const name = (record.name ?? "").trim();
    if (!name) {
      summary.skipped.push({ row: line, reason: "Keine Bezeichnung" });
      return;
    }

    const value = (field: keyof ImportRecord): string => {
      const raw = record[field];
      return typeof raw === "string" ? raw.trim() : "";
    };

    const assetTag = value("asset_tag");
    const existingId = assetTag ? existingByTag.get(key(assetTag)) : undefined;
    const existing = existingId ? getConfigurationItem(existingId) : null;

    const resolve = (
      field: keyof ImportRecord,
      table: Map<string, string>,
      kind: string,
      fallback: string | null,
    ): string | null => {
      const raw = value(field);
      if (!raw) return fallback;
      const hit = table.get(key(raw));
      if (hit) return hit;
      noteUnresolved(kind, raw);
      return fallback;
    };

    /*
     * An unmapped field keeps what the stored item already had, rather than being
     * cleared. A partial export — say, only tags and sites — must not wipe the
     * manufacturer somebody typed in by hand.
     */
    const keep = (field: keyof ImportRecord, previous: string | undefined): string =>
      value(field) || previous || "";

    const typeValue = value("type");
    const statusValue = value("status");

    const draft: Omit<MITSConfigurationItem, "created_at" | "updated_at"> = {
      id: existing?.id ?? "",
      asset_tag: assetTag || (existing?.asset_tag ?? ""),
      name,
      type: (typeValue
        ? CIType.parse(coerceCIType(typeValue))
        : (existing?.type ?? "hardware")) as MITSConfigurationItem["type"],
      status: (statusValue
        ? CIStatus.parse(coerceCIStatus(statusValue))
        : (existing?.status ?? "active")) as MITSConfigurationItem["status"],
      organization_id: resolve(
        "organization",
        organizationBy,
        "Firma",
        existing?.organization_id ?? null,
      ),
      location_id: resolve(
        "location",
        locationBy,
        "Standort",
        existing?.location_id ?? null,
      ),
      assigned_user_id: resolve(
        "assigned_email",
        personBy,
        "Konto",
        existing?.assigned_user_id ?? null,
      ),
      manufacturer: keep("manufacturer", existing?.manufacturer),
      model: keep("model", existing?.model),
      serial_number: keep("serial_number", existing?.serial_number),
      purchased_on:
        normaliseImportDate(value("purchased_on")) || (existing?.purchased_on ?? ""),
      warranty_until:
        normaliseImportDate(value("warranty_until")) || (existing?.warranty_until ?? ""),
      seats_total: value("seats_total")
        ? parseSeats(value("seats_total"))
        : (existing?.seats_total ?? 0),
      expires_at:
        normaliseImportDate(value("expires_at")) || (existing?.expires_at ?? ""),
      note: keep("note", existing?.note),
      // Merged, not replaced: an import carrying two columns must not drop the six
      // attributes somebody recorded by hand.
      attributes: normaliseCIAttributes({
        ...(existing?.attributes ?? {}),
        ...(record.attributes ?? {}),
      }),
    };

    try {
      const saved = saveConfigurationItem(draft);
      if (existing) summary.updated += 1;
      else {
        summary.created += 1;
        if (saved.asset_tag) existingByTag.set(key(saved.asset_tag), saved.id);
      }
    } catch (error) {
      summary.skipped.push({
        row: line,
        reason: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  });

  return summary;
}

/**
 * CSV or spreadsheet text plus a column mapping.
 *
 * Re-parsed here from the raw text rather than taking the browser's parsed rows: the
 * mapping mask parses only to show a preview.
 */
export function importConfigurationItems(
  text: string,
  mapping: ColumnMapping,
  delimiter?: string,
): ImportSummary {
  const { rows } = parseDelimited(text, delimiter);

  const columnsFor = (target: string): string[] =>
    Object.entries(mapping)
      .filter(([, value]) => value === target)
      .map(([column]) => column);

  const attributeColumns = Object.entries(mapping)
    .filter(([, value]) => value.startsWith(ATTRIBUTE_PREFIX))
    .map(([column, value]) => ({
      column,
      name: value.slice(ATTRIBUTE_PREFIX.length).trim() || column,
    }));

  /*
   * Two columns mapped to one target is legal and takes the first non-empty one. An OTRS
   * export regularly carries "Seriennummer" and "Serial" where only one is filled per
   * row, and forcing a choice would drop half the values.
   */
  const records: ImportRecord[] = rows.map((row, index) => {
    const pick = (target: string): string => {
      for (const column of columnsFor(target)) {
        const cell = row[column]?.trim();
        if (cell) return cell;
      }
      return "";
    };

    return {
      // 1-based and counting the header, so the number matches what a spreadsheet shows.
      sourceLine: index + 2,
      name: pick("name"),
      asset_tag: pick("asset_tag"),
      type: pick("type"),
      status: pick("status"),
      organization: pick("organization"),
      location: pick("location"),
      assigned_email: pick("assigned_email"),
      manufacturer: pick("manufacturer"),
      model: pick("model"),
      serial_number: pick("serial_number"),
      purchased_on: pick("purchased_on"),
      warranty_until: pick("warranty_until"),
      seats_total: pick("seats_total"),
      expires_at: pick("expires_at"),
      note: pick("note"),
      attributes: Object.fromEntries(
        attributeColumns
          .map(({ column, name }) => [name, row[column]?.trim() ?? ""])
          .filter(([, value]) => value),
      ),
    };
  });

  return importItemRecords(records);
}

const key = (value: string): string => value.trim().toLowerCase();
