import { ATTRIBUTE_PREFIX, type CIImportTarget } from "@/lib/csv";
import { formatInventoryNumber, type MITSConfigurationItem } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The inventory as a spreadsheet — and as its own import format.

   **The export is round-trip exact.** Every column header is one the importer's
   guess resolves back to the field it came from, so a file exported here, edited
   in Excel and dropped back into `/admin/cmdb/import` needs zero manual mapping.
   That is the property the whole design serves, because it is what makes the
   export useful for more than reading: bulk-correcting four hundred sites is a
   spreadsheet operation, and any step that requires re-mapping fifteen columns by
   hand is a step somebody gets wrong on the eighth run.

   The offline suite proves the round trip rather than trusting it — see the
   `cmdb export` section in `verify-forms.mts`. A header renamed here without its
   guess following along would silently drop a column on re-import, and the import
   would still report success.

   **The first column is the identity, and it is match-only.** `MITS-Nummer` maps to
   `inventory_match`, which finds the row and can never write it — the store assigns
   the number on insert and keeps it. Without it a re-import would key on the
   foreign tag alone and duplicate every asset that has no sticker.

   **`attr:` marks a free attribute**, the syntax the importer already documents.
   One column per key found anywhere in the selection, so the sheet stays
   rectangular even when only half the assets carry `RAM`.

   **Derived values are not exported.** Occupied licence seats are counted out of
   the relations (`seatCounts`), never stored, and a column for them would be
   guessed straight into `seats_total` — an export that, re-imported, overwrites
   the licensed total with the used count. The licences page is where that number
   belongs. This file writes stored state only.

   No `server-only`: pure string work over values the caller has already read, and
   the offline suite owns it. Same arrangement as `lib/csv.ts` on the way in.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Semicolon, like the analytics export.
 *
 * German Excel reads a comma-separated file as one column per row unless the user
 * knows about the import dialog, and `sniffDelimiter` checks semicolon first — so
 * this is also the separator the importer is most certain to get right.
 */
const SEP = ";";

/** CRLF, because that is what a spreadsheet on Windows expects to find. */
const EOL = "\r\n";

/**
 * Human-readable references the export resolves, keyed by id.
 *
 * Passed in rather than looked up here: the ids mean nothing outside MITS, and an
 * export carrying UUIDs would be an export nobody can edit. The importer resolves
 * these same values back by name, code or address.
 */
export interface ExportLookups {
  organizations: Record<string, string>;
  locations: Record<string, string>;
  /** Address, not display name — that is what `assigned_email` matches on. */
  userEmails: Record<string, string>;
}

/**
 * The fixed columns, in order, each with the target its header guesses back to.
 *
 * The target is declared beside the header instead of being left implicit, which
 * is what lets the test assert the round trip: guess the exported header row and
 * compare it against this table.
 */
export const EXPORT_COLUMNS: {
  header: string;
  target: CIImportTarget;
  value: (item: MITSConfigurationItem, lookups: ExportLookups) => string;
}[] = [
  /*
   * First column, and it is what makes the round trip work at all.
   *
   * `inventory_match` finds the row on re-import and can never write it — the store
   * assigns the number on insert and keeps it on update. Matching on `asset_tag`
   * alone duplicates every asset without a sticker, which on most instances is most
   * of them: the re-import would report four hundred creates and quietly double the
   * inventory.
   *
   * Formatted (`INV-10000001`) rather than the bare counter, because that is the
   * string on the label and the one somebody reads out. `parseInventoryNumber`
   * turns it back.
   */
  {
    header: "MITS-Nummer",
    target: "inventory_match",
    value: (item) => formatInventoryNumber(item.inventory_number),
  },
  { header: "Bezeichnung", target: "name", value: (item) => item.name },
  { header: "Fremdnummer", target: "asset_tag", value: (item) => item.asset_tag },
  /*
   * The stored enum value, not its German label.
   *
   * `coerceCIType` accepts both, so a label would re-import correctly today — but
   * the labels are UI text and the enum is the contract. Exporting the label would
   * mean a renamed label silently stops being importable, and the failure would be
   * every asset arriving as `other`.
   */
  { header: "Art", target: "type", value: (item) => item.type },
  { header: "Zustand", target: "status", value: (item) => item.status },
  {
    header: "Firma",
    target: "organization",
    value: (item, lookups) =>
      item.organization_id ? (lookups.organizations[item.organization_id] ?? "") : "",
  },
  {
    header: "Standort",
    target: "location",
    value: (item, lookups) =>
      item.location_id ? (lookups.locations[item.location_id] ?? "") : "",
  },
  {
    header: "Zugeordnet an",
    target: "assigned_email",
    value: (item, lookups) =>
      item.assigned_user_id ? (lookups.userEmails[item.assigned_user_id] ?? "") : "",
  },
  { header: "Hersteller", target: "manufacturer", value: (item) => item.manufacturer },
  { header: "Modell", target: "model", value: (item) => item.model },
  {
    header: "Seriennummer",
    target: "serial_number",
    value: (item) => item.serial_number,
  },
  {
    header: "Angeschafft am",
    target: "purchased_on",
    value: (item) => item.purchased_on,
  },
  {
    header: "Garantie bis",
    target: "warranty_until",
    value: (item) => item.warranty_until,
  },
  /*
   * Zero is written as the empty string, not as "0".
   *
   * `parseSeats` reads an unreadable cell as zero, so both round-trip to the same
   * value — but a column of zeros on four hundred laptops is noise in a sheet whose
   * licence rows are the only ones the number means anything for.
   */
  {
    header: "Lizenzplätze",
    target: "seats_total",
    value: (item) => (item.seats_total > 0 ? String(item.seats_total) : ""),
  },
  { header: "Läuft ab am", target: "expires_at", value: (item) => item.expires_at },
  { header: "Notiz", target: "note", value: (item) => item.note },
];

/**
 * Quote a field if it could otherwise break the row.
 *
 * Doubling the quote is the RFC 4180 escape, and `parseDelimited` reads exactly
 * that back. Checked for the separator, both line endings and the quote itself — a
 * note field legitimately contains all four, and an unquoted line break shifts
 * every following row by one.
 *
 * A leading space is why `trim` is not enough on the way in: the parser trims
 * cells, so a value whose meaning depends on padding cannot survive either way.
 * Nothing in the CMDB has one.
 */
export function csvCell(value: string): string {
  if (!/[";\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Every attribute key present anywhere in the selection, sorted.
 *
 * Sorted rather than first-seen, so two exports of the same inventory produce the
 * same file — which is what makes a diff between them readable. Union rather than
 * intersection: an attribute on one asset out of four hundred is still the reason
 * somebody recorded it.
 */
export function attributeKeys(items: MITSConfigurationItem[]): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item.attributes)) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * The whole sheet.
 *
 * A header row even when there are no items: an empty file gives the mapping mask
 * nothing to show and reads as a failed download, while a header row is an honest
 * "this filter matched nothing".
 */
export function itemsToCsv(
  items: MITSConfigurationItem[],
  lookups: ExportLookups,
): string {
  const attributes = attributeKeys(items);

  const headers = [
    ...EXPORT_COLUMNS.map((column) => column.header),
    ...attributes.map((key) => `${ATTRIBUTE_PREFIX}${key}`),
  ];

  const lines = [headers.map(csvCell).join(SEP)];

  for (const item of items) {
    const cells = [
      ...EXPORT_COLUMNS.map((column) => column.value(item, lookups)),
      ...attributes.map((key) => item.attributes[key] ?? ""),
    ];
    lines.push(cells.map(csvCell).join(SEP));
  }

  // Trailing newline: a file whose last row has none is one some tools read as
  // truncated, and `parseDelimited` does not care either way.
  return `${lines.join(EOL)}${EOL}`;
}

/**
 * `mits-bestand-2026-08-05.csv`.
 *
 * Dated, because the second thing anybody does with an inventory export is take
 * another one a month later, and two files called `bestand.csv` in a downloads
 * folder are indistinguishable.
 */
export function exportFilename(at: Date): string {
  return `mits-bestand-${at.toISOString().slice(0, 10)}.csv`;
}
