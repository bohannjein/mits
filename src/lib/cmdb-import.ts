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
   CSV / OTRS import.

   Parses on the server, from the raw text, using the same parser the mapping mask used
   for its preview. The client's parsed rows are never trusted — a preview is a
   convenience, not a source.

   Matching is by asset tag: a row whose tag already exists **updates** that item rather
   than creating a second one. That is what makes a re-import of a corrected export
   idempotent, which is how an inventory actually gets cleaned up. A row without a tag is
   always a create, because there is nothing to match on and guessing by name would merge
   two identically named laptops.

   Organizations, sites and people are resolved by their human-readable value — an export
   contains "Weller GmbH", not a UUID. Resolved case-insensitively against name, code and
   mail address; an unresolvable reference leaves the field empty and is reported, rather
   than failing the row. An asset with no owner is a fixable record; a refused row is an
   asset nobody knows exists.
   ────────────────────────────────────────────────────────────────────────── */

export interface ImportSummary {
  created: number;
  updated: number;
  /** Rows that could not become an item at all, with the reason. */
  skipped: { row: number; reason: string }[];
  /** Values that did not resolve. Counted per value, not per row. */
  unresolved: { value: string; kind: string }[];
  total: number;
}

/**
 * Import row by row, not as one transaction.
 *
 * A real export is dirty, and an all-or-nothing import of eight hundred assets fails on
 * row six hundred and leaves the admin with nothing to work from. Writing as it goes and
 * reporting per row means a second run — with the six rows fixed — completes the job,
 * and the already-imported ones update instead of duplicating.
 */
export function importConfigurationItems(
  text: string,
  mapping: ColumnMapping,
  delimiter?: string,
): ImportSummary {
  const { rows } = parseDelimited(text, delimiter);

  const organizations = listOrganizations();
  const locations = listLocations();
  const people = listUsers();

  const organizationBy = new Map<string, string>();
  for (const organization of organizations) {
    organizationBy.set(key(organization.name), organization.id);
    if (organization.code) organizationBy.set(key(organization.code), organization.id);
  }

  const locationBy = new Map<string, string>();
  for (const location of locations) {
    locationBy.set(key(location.name), location.id);
    if (location.code) locationBy.set(key(location.code), location.id);
  }

  const personBy = new Map<string, string>();
  for (const person of people) {
    personBy.set(key(person.email), person.id);
    personBy.set(key(person.name), person.id);
  }

  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    skipped: [],
    unresolved: [],
    total: rows.length,
  };
  const unresolvedSeen = new Set<string>();
  const noteUnresolved = (kind: string, value: string) => {
    const id = `${kind}:${key(value)}`;
    if (unresolvedSeen.has(id)) return;
    unresolvedSeen.add(id);
    summary.unresolved.push({ kind, value });
  };

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

  rows.forEach((row, index) => {
    // 1-based and counting the header, so the number matches what a spreadsheet shows.
    const lineNumber = index + 2;

    const pick = (target: string): string => {
      for (const column of columnsFor(target)) {
        const value = row[column]?.trim();
        if (value) return value;
      }
      return "";
    };

    const name = pick("name");
    if (!name) {
      summary.skipped.push({ row: lineNumber, reason: "Keine Bezeichnung" });
      return;
    }

    const assetTag = pick("asset_tag");
    const existingId = assetTag ? existingByTag.get(key(assetTag)) : undefined;
    const existing = existingId ? getConfigurationItem(existingId) : null;

    const organizationValue = pick("organization");
    let organizationId = existing?.organization_id ?? null;
    if (organizationValue) {
      const hit = organizationBy.get(key(organizationValue));
      if (hit) organizationId = hit;
      else noteUnresolved("Firma", organizationValue);
    }

    const locationValue = pick("location");
    let locationId = existing?.location_id ?? null;
    if (locationValue) {
      const hit = locationBy.get(key(locationValue));
      if (hit) locationId = hit;
      else noteUnresolved("Standort", locationValue);
    }

    const personValue = pick("assigned_email");
    let assignedUserId = existing?.assigned_user_id ?? null;
    if (personValue) {
      const hit = personBy.get(key(personValue));
      if (hit) assignedUserId = hit;
      else noteUnresolved("Konto", personValue);
    }

    const typeValue = pick("type");
    const statusValue = pick("status");

    const attributes = normaliseCIAttributes({
      ...(existing?.attributes ?? {}),
      ...Object.fromEntries(
        attributeColumns
          .map(({ column, name: attributeName }) => [
            attributeName,
            row[column]?.trim() ?? "",
          ])
          .filter(([, value]) => value),
      ),
    });

    /*
     * An unmapped field keeps what the stored item already had, rather than being
     * cleared. A partial export — say, only tags and sites — must not wipe the
     * manufacturer somebody typed in by hand.
     */
    const keep = (value: string, previous: string | undefined): string =>
      value || previous || "";

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
      organization_id: organizationId,
      location_id: locationId,
      assigned_user_id: assignedUserId,
      manufacturer: keep(pick("manufacturer"), existing?.manufacturer),
      model: keep(pick("model"), existing?.model),
      serial_number: keep(pick("serial_number"), existing?.serial_number),
      purchased_on: keep(
        normaliseImportDate(pick("purchased_on")),
        existing?.purchased_on,
      ),
      warranty_until: keep(
        normaliseImportDate(pick("warranty_until")),
        existing?.warranty_until,
      ),
      seats_total: pick("seats_total")
        ? parseSeats(pick("seats_total"))
        : (existing?.seats_total ?? 0),
      expires_at: keep(normaliseImportDate(pick("expires_at")), existing?.expires_at),
      note: keep(pick("note"), existing?.note),
      attributes,
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
        row: lineNumber,
        reason: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  });

  return summary;
}

const key = (value: string): string => value.trim().toLowerCase();
