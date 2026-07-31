/**
 * Delimited-text parsing and value coercion for the CMDB importer.
 *
 * Deliberately **not** `server-only`: the mapping mask parses the pasted file in the
 * browser to show headers and a preview, the import re-parses it on the server, and the
 * offline suite checks both against the same functions. Three callers, one parser —
 * a second implementation for the preview is a preview that lies.
 *
 * No dependency. A CSV library would be a fourth package for something whose whole
 * difficulty is one quoting rule, and the rule is implemented below.
 */

/** What a mapped column writes into. */
export const CI_IMPORT_TARGETS = [
  { key: "name", label: "Bezeichnung", required: true },
  { key: "asset_tag", label: "Inventarnummer" },
  { key: "type", label: "Art" },
  { key: "status", label: "Zustand" },
  { key: "organization", label: "Firma (Name oder Kurzcode)" },
  { key: "location", label: "Standort (Name oder Kurzcode)" },
  { key: "assigned_email", label: "Zugeordnet an (E-Mail)" },
  { key: "manufacturer", label: "Hersteller" },
  { key: "model", label: "Modell" },
  { key: "serial_number", label: "Seriennummer" },
  { key: "purchased_on", label: "Angeschafft am" },
  { key: "warranty_until", label: "Garantie bis" },
  { key: "seats_total", label: "Lizenzplätze" },
  { key: "expires_at", label: "Läuft ab am" },
  { key: "note", label: "Notiz" },
] as const;

export type CIImportTarget = (typeof CI_IMPORT_TARGETS)[number]["key"];

/**
 * Prefix that turns a column into a free attribute instead of a field.
 *
 * `attr:RAM` writes the column into `attributes.RAM`. That is how an OTRS export with
 * thirty site-specific columns arrives without thirty new schema fields — which is the
 * same argument the attributes map exists for.
 */
export const ATTRIBUTE_PREFIX = "attr:";

/** Column → target. A column absent from the map is ignored. */
export type ColumnMapping = Record<string, string>;

export interface DelimitedTable {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

/**
 * Guess the delimiter from the header line.
 *
 * Semicolon first, not comma: a German Excel or OTRS export uses it, and a
 * comma-guessing parser turns such a file into one column whose header is the whole
 * line. Tab is checked too because a spreadsheet paste is tab-separated.
 *
 * Counted on the first line only — a quoted comma inside a later field would otherwise
 * outvote the real delimiter.
 */
export function sniffDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", "\t", ",", "|"].map((candidate) => ({
    candidate,
    n: firstLine.split(candidate).length - 1,
  }));
  const best = counts.reduce((a, b) => (b.n > a.n ? b : a));
  return best.n > 0 ? best.candidate : ";";
}

/**
 * Parse delimited text into headers and row objects.
 *
 * Handles the one thing that actually matters: a quoted field may contain the
 * delimiter, a line break and a doubled quote. Everything else — comments, escapes with
 * backslash, a header on line five — is not in any export MITS is asked to read.
 *
 * A row with fewer cells than headers is padded rather than rejected. Trailing empty
 * columns are what a spreadsheet writes when the last field is blank, and refusing the
 * row would drop an asset over a missing note.
 */
export function parseDelimited(text: string, delimiter?: string): DelimitedTable {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? sniffDelimiter(clean);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      continue;
    }
    if (char === sep) {
      record.push(field);
      field = "";
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }
    field += char;
  }

  // Whatever is still in hand when the text ends is the last field of the last row.
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter(
    (cells) => cells.some((cell) => cell.trim() !== ""),
  );
  if (nonEmpty.length === 0) return { headers: [], rows: [], delimiter: sep };

  const headers = nonEmpty[0].map((cell, index) => {
    const name = cell.trim();
    // An unnamed column still needs a stable key, otherwise two of them collide.
    return name || `Spalte ${index + 1}`;
  });

  const rows = nonEmpty.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [header, (cells[index] ?? "").trim()]),
    ),
  );

  return { headers, rows, delimiter: sep };
}

/* ── Value coercion ──────────────────────────────────────────────────────── */

/**
 * German labels and common English keys, back to the enum.
 *
 * An OTRS export writes what a human chose in a dropdown, so "Lizenz" and "license"
 * both arrive. Unknown values fall back to `other` rather than failing the row: an asset
 * with the wrong type is fixable in the mask, a refused import row is a laptop nobody
 * knows exists.
 */
const TYPE_ALIASES: Record<string, string> = {
  hardware: "hardware",
  computer: "hardware",
  notebook: "hardware",
  laptop: "hardware",
  pc: "hardware",
  drucker: "hardware",
  printer: "hardware",
  monitor: "hardware",
  software: "software",
  programm: "software",
  lizenz: "license",
  license: "license",
  netzwerk: "network",
  network: "network",
  switch: "network",
  router: "network",
  mobilgerät: "mobile",
  mobilgeraet: "mobile",
  mobile: "mobile",
  handy: "mobile",
  smartphone: "mobile",
  telefon: "mobile",
  dienst: "service",
  service: "service",
  sonstiges: "other",
  other: "other",
};

export function coerceCIType(value: string): string {
  const key = value.trim().toLowerCase();
  if (!key) return "hardware";
  return TYPE_ALIASES[key] ?? "other";
}

const STATUS_ALIASES: Record<string, string> = {
  "im einsatz": "active",
  einsatz: "active",
  aktiv: "active",
  active: "active",
  productive: "active",
  produktiv: "active",
  lager: "stock",
  stock: "stock",
  ersatz: "stock",
  reserve: "stock",
  "in reparatur": "repair",
  reparatur: "repair",
  repair: "repair",
  defekt: "repair",
  ausgemustert: "retired",
  retired: "retired",
  inaktiv: "retired",
  inactive: "retired",
  entsorgt: "retired",
};

/**
 * Unknown status is `active`, not `retired`.
 *
 * The safe direction: an imported asset wrongly marked as scrapped disappears from the
 * live fleet and from the licence count without anybody noticing. Wrongly counted as
 * in-service is visible and gets corrected.
 */
export function coerceCIStatus(value: string): string {
  const key = value.trim().toLowerCase();
  if (!key) return "active";
  return STATUS_ALIASES[key] ?? "active";
}

/**
 * Any of the date shapes an export produces, to `YYYY-MM-DD`.
 *
 * `31.12.2026`, `2026-12-31`, `2026-12-31 09:14:00`, `31/12/2026`. Anything else becomes
 * the empty string — a date MITS cannot read is better absent than guessed, because a
 * guessed warranty end is a wrong answer to the only question the field is asked.
 */
export function normaliseImportDate(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const german = raw.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (german) {
    const day = german[1].padStart(2, "0");
    const month = german[2].padStart(2, "0");
    return `${german[3]}-${month}-${day}`;
  }

  return "";
}

/** A seat count out of a spreadsheet cell. Anything unreadable is zero, not one. */
export function parseSeats(value: string): number {
  const digits = value.trim().replace(/[^\d]/g, "");
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
