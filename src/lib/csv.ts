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
  /*
   * The MITS number, and it is a **match key, never a value.**
   *
   * `saveConfigurationItem` assigns it on insert and keeps it on update; nothing
   * here can write it. What it can do is find the row it belongs to, and that is
   * what makes an export re-importable: matching on `asset_tag` alone duplicates
   * every asset that has no sticker, which on a fresh instance is all of them.
   */
  { key: "inventory_match", label: "MITS-Nummer (nur zum Zuordnen)" },
  { key: "asset_tag", label: "Fremdnummer (Aufkleber, Altsystem)" },
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

/**
 * The two sentinels the mapping mask uses, shared so the guess can return them.
 *
 * Not targets: the server strips `IGNORE_COLUMN` and turns `AS_ATTRIBUTE` into
 * `attr:<Spaltenname>`. They live here rather than in the component because
 * `guessColumnMapping` produces them and the offline suite checks it.
 */
export const IGNORE_COLUMN = "__ignore";
export const AS_ATTRIBUTE = "__attribute";

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

/* ── Column guessing ─────────────────────────────────────────────────────── */

/**
 * Headers that become a free attribute rather than a field, before any guess runs.
 *
 * One entry so far, and it earns the mechanism. OTRS ITSM tracks **two** status
 * axes: `Verwendungsstatus` / `DeplState` (Produktiv, Wartung, Ausgemustert) and
 * `Vorfallstatus` / `InciState` (Betriebsbereit, Vorfall). MITS has one `status`,
 * and it means the first.
 *
 * Folding both into it would be unrecoverable — an asset that is in production
 * *and* has an open incident arrives as one or the other, and nobody can tell
 * afterwards which column won. Ignoring the second would throw the information
 * away. Keeping it as an attribute keeps it readable and out of the way.
 *
 * It also has to be decided *before* the guess table: `vorfallstatus` contains the
 * substring `status`, so the status pattern matches it. Worse than wrong on its
 * own — whichever of the two columns came first would claim `status` and the other
 * would be dropped as "target already taken", which is exactly the failure the
 * ordering fix below is about.
 */
const ATTRIBUTE_HEADERS: RegExp[] = [/(vorfallstatus|inci.?state)/];

/**
 * Header text, lowercased, to a target.
 *
 * **Order is the rule, and it was wrong.** These are substring patterns, so the
 * specific ones have to be tested before the general ones — and `nummer$` is
 * about as general as a pattern gets in a German inventory export. It matched
 * `Seriennummer` before the serial pattern was ever reached, so a file with both
 * `Fremdnummer` and `Seriennummer` put the tag in the tag column and then
 * **dropped every serial number**: the second column resolved to `asset_tag`
 * too, found it taken, and became "do not import".
 *
 * The failure mode is why it survived: the import reports success, the count is
 * right, and the field is simply empty on eight hundred assets. Now every
 * pattern that names a specific field sits above the two that end in `nummer`.
 */
const GUESSES: [RegExp, CIImportTarget][] = [
  [/^(bezeichnung|name|titel|asset|gerät|geraet)$/, "name"],
  // Specific first. Each of these also ends in "nummer" or contains "nummer".
  [/(seriennummer|serial|s\/n)/, "serial_number"],
  [/(hersteller|manufacturer|vendor)/, "manufacturer"],
  [/(modell|model|typbezeichnung)/, "model"],
  /*
   * MITS's own number, before the generic one below — it also ends in "nummer".
   * Deliberately narrow: a plain `Inventarnummer` in somebody else's export means
   * *their* number and belongs in the foreign column, so only a header that names
   * MITS matches here.
   */
  [/(mits.?nummer|mits.?nr)/, "inventory_match"],
  // …and only now the generic number column. An OTRS ConfigItem export calls it
  // `Number`, an inventory sheet `Inventarnummer`; both mean the foreign number.
  [/(inventar|asset.?tag|inventory|fremdnummer|nummer$|^number$)/, "asset_tag"],
  /*
   * `Klasse` is OTRS ITSM's ConfigItem class — Computer, Hardware, Software,
   * Network. That is the closest thing it has to an object kind, so it maps to
   * the type and `coerceCIType` knows the class names.
   */
  [/^(art|typ|type|kategorie|category|klasse|class)$/, "type"],
  /*
   * `Verwendungsstatus` / `DeplState` is the axis MITS's `status` means: in
   * service, in stock, in repair, retired. OTRS ITSM's second axis is handled by
   * `ATTRIBUTE_HEADERS` above — see the note there.
   */
  [/(verwendungsstatus|depl.?state|einsatzstatus|zustand|status|state)/, "status"],
  [/(firma|kunde|company|customer|organisation|organization|mandant)/, "organization"],
  [/(standort|filiale|location|site|raum)/, "location"],
  [/(mail|benutzer|user|besitzer|owner|zugeordnet)/, "assigned_email"],
  [/(angeschafft|kauf|purchase|beschaffung)/, "purchased_on"],
  [/(garantie|warranty|gewährleistung)/, "warranty_until"],
  [/(plätze|plaetze|seats|lizenzen|anzahl)/, "seats_total"],
  [/(ablauf|läuft|laeuft|expire|valid)/, "expires_at"],
  [/(notiz|note|bemerkung|kommentar|comment|beschreibung)/, "note"],
];

/**
 * Guess a mapping from the header row, to be corrected by hand in the mask.
 *
 * Guessing without showing the guess would be the worst version of this: an
 * import that silently put serial numbers in the model column. The mask renders
 * every decision this makes.
 *
 * The two prefixes are honoured before anything else, which is what makes an
 * exported file re-importable without a single manual correction — `attr:RAM`
 * comes back as the attribute it was, `info:Inventarnummer` stays out.
 */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  const mapping: ColumnMapping = {};

  for (const header of headers) {
    const key = header.trim().toLowerCase();

    if (key.startsWith(ATTRIBUTE_PREFIX)) {
      mapping[header] = AS_ATTRIBUTE;
      continue;
    }
    if (ATTRIBUTE_HEADERS.some((pattern) => pattern.test(key))) {
      mapping[header] = AS_ATTRIBUTE;
      continue;
    }

    const hit = GUESSES.find(([pattern]) => pattern.test(key));
    // One column per target. A second "Nummer" column is ignored rather than
    // overwriting the first one's mapping — the admin can still map it by hand.
    if (hit && !used.has(hit[1])) {
      used.add(hit[1]);
      mapping[header] = hit[1];
    } else {
      mapping[header] = IGNORE_COLUMN;
    }
  }

  return mapping;
}

/**
 * The mask's choices to what the server expects.
 *
 * `AS_ATTRIBUTE` becomes `attr:<Spaltenname>`, so the attribute is named after
 * the column it came from — and an already-prefixed header keeps its own name
 * rather than becoming `attr:attr:RAM` on a second round trip.
 */
export function mappingForSubmit(mapping: ColumnMapping): ColumnMapping {
  return Object.fromEntries(
    Object.entries(mapping)
      .filter(([, target]) => target !== IGNORE_COLUMN)
      .map(([column, target]) => {
        if (target !== AS_ATTRIBUTE) return [column, target];
        const name = column.trim().toLowerCase().startsWith(ATTRIBUTE_PREFIX)
          ? column.trim().slice(ATTRIBUTE_PREFIX.length)
          : column;
        return [column, `${ATTRIBUTE_PREFIX}${name}`];
      }),
  );
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
  // OTRS ITSM ships these four ConfigItem classes out of the box. `Location` is
  // one of them and maps to `other`: a site is a row in `mits_location` here, not
  // an inventory object, and importing it as one would put buildings in the fleet.
  server: "hardware",
  virtuelle_maschine: "hardware",
  "virtual machine": "hardware",
  location: "other",
  standort: "other",
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
  /*
   * OTRS ITSM deployment states, as they are written in a German instance.
   *
   * `Pilot` and `Test/QS` are in service — somebody is using the machine, and
   * calling it stock would take it out of the licence count. `Wartung` is
   * `repair`: not available, not scrapped.
   */
  pilot: "active",
  "test/qs": "active",
  test: "active",
  inbetriebnahme: "active",
  wartung: "repair",
  maintenance: "repair",
  planung: "stock",
  planned: "stock",
  bestellt: "stock",
  expired: "retired",
  abgelaufen: "retired",
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
