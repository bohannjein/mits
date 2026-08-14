import type { JSONSchema7 } from "json-schema";
import { z } from "zod";

/* ──────────────────────────────────────────────────────────────────────────
   Core ticket model.

   Zod is the single source of truth; the TypeScript types are inferred from it
   so there is nothing to keep in sync by hand. Every one of the three intake
   modes (legacy / wizard / ai_chat) produces the same shape, which is what lets
   the AI path in Phase 3 be validated with exactly the same schema as a form
   submission.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * How the ticket entered the system.
 *
 * `email` is not just provenance — it changes what the ticket page renders. A
 * mailed-in ticket already carries the sender's message as its first stored
 * comment, so the opening bubble must **not** be synthesised from the payload on
 * top of it; every other source has no such comment and needs one. See
 * `openingMessageFor`.
 *
 * Which is also why a client cannot claim it: `createTicket` overrides the value
 * unless the caller is the mail ingest. A reporter posting `source: "email"` would
 * otherwise lose their own opening message from the thread.
 */
export const TicketSource = z.enum(["legacy", "wizard", "ai_chat", "email"]);
export type TicketSource = z.infer<typeof TicketSource>;

export const TICKET_SOURCE_LABELS: Record<TicketSource, string> = {
  // Reads the same as the tab that produces it. The stored value stays
  // `legacy` — renaming that would orphan every existing row.
  legacy: "Schnellerstellung",
  wizard: "Service-Katalog",
  ai_chat: "KI-Assistent",
  email: "E-Mail",
};

/* ──────────────────────────────────────────────────────────────────────────
   Ticket-Lebenszyklus: drei Werte, nicht sechs.

   Ein Status hat zwei Fragen zu beantworten — **wer ist am Zug** und **ist es
   fertig**. Das sind drei Werte. Die drei, die gestrichen wurden, trugen jeweils
   eine Auskunft, die woanders präziser steht und von der Anwendung dort auch
   gelesen wird:

   - **`in_progress` doppelte `assigned_to`.** Seit eine öffentliche Antwort die
     Zuweisung setzt, ist „In Bearbeitung" nichts anderes als *offen und hat einen
     Bearbeiter*. Das wird jetzt **angezeigt** statt gespeichert
     (`describeTicketState`) — zwei Spalten mit derselben Aussage laufen
     auseinander, und die, die es hier tat, war die, die niemand pflegte.
   - **`waiting_major` doppelte eine Verknüpfung.** `parkedChildren` joint
     `mits_ticket_link` auf `kind = 'parent_of'`; der Status war dort eine zweite,
     redundante Bedingung in derselben Abfrage — und eine Kopie, die stehenblieb,
     wenn jemand die Verknüpfung löste.
   - **`resolved` war `closed`.** Fünf Analytics-Abfragen, die Aufbewahrung und
     `todayCounts` schrieben schon immer `IN ('closed', 'resolved')`, und beide
     öffneten sich bei einer Melderantwort wieder.

   „Wartet auf Lieferant" — der Fall, für den man einen vierten Wert baut — ist
   eine **Erinnerung** (`mits_ticket_reminder`), kein Status.

   Reihenfolge ist Bedeutung: sie ist die der Statusauswahl, und
   `OPEN_TICKET_STATUSES` leitet sich daraus ab.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Statuswerte, die dieser Build nicht mehr schreibt, aber lesen muss.
 *
 * Migriert in `lib/db/sqlite.ts` — und die Zuordnung steht trotzdem hier, aus
 * exakt dem Grund, der bei `LEGACY_PRIORITY_MAP` steht: eine aus einem älteren
 * Backup zurückgespielte Datenbank hat die Migration nie gesehen. Ohne diese Map
 * scheitert `MITSTicketSchema` dann an **jeder** Zeile und nimmt ganze Listen mit
 * — ein Totalausfall für einen umbenannten Wert.
 *
 * Deckt auch ein gespeichertes Makro mit `set_status: "resolved"` ab: das Feld ist
 * ein `z.string()` und wird erst beim Anwenden geparst.
 */
export const LEGACY_STATUS_MAP: Record<string, string> = {
  in_progress: "open",
  waiting_major: "open",
  resolved: "closed",
};

export const TicketStatus = z.preprocess(
  (value) =>
    typeof value === "string" ? (LEGACY_STATUS_MAP[value] ?? value) : value,
  z.enum(["open", "waiting_user", "closed"]),
);
export type TicketStatus = z.infer<typeof TicketStatus>;

/** The bare enum, for `.options` where the preprocess wrapper hides it. */
export const TicketStatusValues = ["open", "waiting_user", "closed"] as const;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Offen",
  waiting_user: "Wartet auf Anwender",
  closed: "Abgeschlossen",
};

/* ──────────────────────────────────────────────────────────────────────────
   Derselbe Status, zwei Vokabulare.

   `TICKET_STATUS_LABELS` ist die Sprache des Desks: „Wartet auf Anwender" sagt
   einem Agenten, dass dieses Ticket nicht seine Baustelle ist. Dem Melder sagt
   es nichts — es ist ein interner Zustandsname, und dabei ist es die
   handlungsrelevanteste Auskunft der ganzen Seite: *er* ist der Grund, dass
   nichts passiert.

   Deshalb eine zweite Map. Kein Umschreiben der ersten: zwei Rollen lesen
   dieselbe Zeile und brauchen zwei verschiedene Sätze, und der Agent, der einem
   Melder am Telefon hilft, muss weiter den Namen benutzen können, der in der
   Queue steht.

   **Zwei Längen, und das ist keine Bequemlichkeit.** Auf der Detailseite steht
   ein Satz, der sagt, was zu tun ist. In der Ticketliste am Rand — dreißig
   Zeilen in einer schmalen Spalte — steht ein Wort: „Wir warten auf Ihre
   Antwort" in einem Badge von 90 Pixeln wäre entweder ein Umbruch über drei
   Zeilen oder ein „Wir warten auf Ihre A…", und beides ist schlechter als
   „Ihre Antwort". Ein Objekt statt zweier Maps, damit ein neuer Status beide
   Formen erzwingt.

   Kein Name des Bearbeiters darin: der steht als eigenes Feld daneben, und zwei
   Orte für denselben Namen sind einer zu viel.
   ────────────────────────────────────────────────────────────────────────── */

export const CUSTOMER_STATUS: Record<
  TicketStatus,
  { short: string; long: string }
> = {
  open: { short: "Eingegangen", long: "Eingegangen" },
  waiting_user: {
    short: "Ihre Antwort",
    long: "Wir warten auf Ihre Antwort",
  },
  closed: { short: "Abgeschlossen", long: "Abgeschlossen" },
};

/** Noch nicht fertig — die Menge, auf die jede Queue-Ansicht filtert. */
export const OPEN_TICKET_STATUSES: TicketStatus[] = ["open", "waiting_user"];

export const isOpenStatus = (status: TicketStatus): boolean =>
  OPEN_TICKET_STATUSES.includes(status);

/* ──────────────────────────────────────────────────────────────────────────
   Was ein Ticket gerade tut — abgeleitet, nicht gespeichert.

   Drei gespeicherte Werte plus Daten, die es ohnehin gibt, ergeben fünf lesbare
   Zustände. Das ist der Tausch, der die Statusliste kürzen konnte: die Anzeige
   wird dabei reicher, nicht ärmer.

   | gespeichert | zusätzlich | Agent | Melder |
   |---|---|---|---|
   | `open` | kein Bearbeiter | Neu | Eingegangen |
   | `open` | Bearbeiter | In Bearbeitung | Wird bearbeitet |
   | `open` | an Hauptstörung | Bekannte Störung | Bekannte Störung |
   | `waiting_user` | — | Wartet auf Anwender | Wir warten auf Ihre Antwort |
   | `closed` | — | Abgeschlossen | Abgeschlossen |

   Rein, damit sie offline prüfbar ist (`npm run test:forms`) — dieselbe
   Aufteilung wie bei `nextStatusAfterReply` und `roleSeesArea`.

   **Die Hauptstörung sticht den Bearbeiter.** Ein Kind-Ticket hat meist beides;
   was der Melder wissen will, ist, dass sein Problem bekannt ist und mehrere
   betrifft — nicht der Name der Person, die es nicht einzeln lösen wird.
   ────────────────────────────────────────────────────────────────────────── */

export interface TicketStateView {
  /** Für den Desk. Kurz, das Vokabular der Queue. */
  agent: string;
  /** Für den Melder. `short` für Listen, `long` für die Detailseite. */
  short: string;
  long: string;
}

export function describeTicketState(ticket: {
  status: TicketStatus;
  assigned_to?: string | null;
  /** Hängt an einer Hauptstörung — aus der `parent_of`-Verknüpfung, nicht aus dem Status. */
  parkedBehindMajor?: boolean;
}): TicketStateView {
  if (ticket.status === "closed" || ticket.status === "waiting_user") {
    return {
      agent: TICKET_STATUS_LABELS[ticket.status],
      ...CUSTOMER_STATUS[ticket.status],
    };
  }

  if (ticket.parkedBehindMajor) {
    return {
      agent: "Bekannte Störung",
      short: "Bekannte Störung",
      long: "Bekannte Störung, wird zentral behoben",
    };
  }

  if (ticket.assigned_to) {
    return {
      agent: "In Bearbeitung",
      short: "In Arbeit",
      long: "Wird bearbeitet",
    };
  }

  // Offen und herrenlos. „Neu" für den Desk, weil das die Zeile ist, die aus dem
  // Eingang geholt werden muss; „Eingegangen" für den Melder, weil „neu" aus
  // seiner Sicht nichts über den Fortschritt sagt.
  return { agent: "Neu", short: "Eingegangen", long: "Eingegangen" };
}

/* ──────────────────────────────────────────────────────────────────────────
   Ballbesitz: der Status sagt, wer am Zug ist.

   Vorher war er Handbuchhaltung. `in_progress` unterschied sich von `open` nur
   dadurch, ob jemand daran gedacht hatte, und `waiting_user` war eine
   Einbahnstraße — ein Melder, der darauf antwortete, änderte nichts, also füllte
   sich der Tab „Wartend" mit Tickets, die längst beantwortet waren.

   Eine reine Funktion, damit sie offline prüfbar ist (`npm run test:forms`); die
   Serverseite reicht nur die Zeile herein. Dieselbe Aufteilung wie bei
   `roleSeesArea` und `priorityForRole`.

   Mit drei Werten ist die Tabelle drei Zeilen lang, und die zwei
   Entscheidungen darin sind:

   - **Der Agent hebt `closed` nicht auf.** Eine Nachtragsmail auf einem
     abgeschlossenen Ticket ist Archivarbeit. Nur der Melder holt ein Ticket
     zurück.
   - **`hasAssignee` spielt keine Rolle mehr.** Es entschied vorher zwischen
     `open` und `in_progress`; seit „in Bearbeitung" aus der Zuweisung *abgeleitet*
     wird (`describeTicketState`), gibt es dafür keinen zweiten Wert. Der Parameter
     bleibt trotzdem in der Signatur — siehe dort, warum.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Wohin ein Ticket nach einer **öffentlichen** Antwort wechselt.
 *
 * `null` heißt „nichts ändern" und nicht „auf den aktuellen Wert setzen": der
 * Aufrufer schreibt dann gar nicht, es gibt also keine Historienzeile und kein
 * Signal für einen Vorgang, der nichts bewegt hat.
 *
 * Interne Notizen kommen hier nie an — die Sichtbarkeit prüft der Aufrufer, weil
 * sie schon darüber entscheidet, ob überhaupt jemand am Zug ist.
 *
 * `hasAssignee` wird nicht mehr gelesen, bleibt aber in der Signatur: die
 * Aufrufstelle in `applyReplyWorkflow` beansprucht das Ticket unmittelbar vorher
 * und reicht das Ergebnis herein, und ein Parameter, der wegfällt und beim
 * nächsten Statuswert wieder gebraucht wird, ist eine Aufrufstelle, die man dann
 * neu verkabeln muss. `void` macht sichtbar, dass das Absicht ist.
 */
export function nextStatusAfterReply(
  current: TicketStatus,
  byAgent: boolean,
  hasAssignee: boolean,
): TicketStatus | null {
  void hasAssignee;

  if (byAgent) {
    // Nur aus einem laufenden Zustand heraus. `closed` bleibt, wo es ist.
    return current === "open" ? "waiting_user" : null;
  }

  // Der Melder ist am Zug gewesen und hat geantwortet — zurück zum Team.
  if (current === "waiting_user" || current === "closed") return "open";

  return null;
}

/**
 * Ticket priority.
 *
 * `normal` was renamed to `medium` and `urgent` to `critical`. The rename is
 * migrated in `lib/db/sqlite.ts`, but the preprocess below maps the old values
 * anyway — a database restored from a backup taken before the migration would
 * otherwise fail `MITSTicketSchema` on every row and take whole listings down
 * with it. Cheap insurance against a total outage.
 */
export const LEGACY_PRIORITY_MAP: Record<string, string> = {
  normal: "medium",
  urgent: "critical",
};

export const TicketPriority = z.preprocess(
  (value) =>
    typeof value === "string" ? (LEGACY_PRIORITY_MAP[value] ?? value) : value,
  z.enum(["low", "medium", "high", "critical"]),
);
export type TicketPriority = z.infer<typeof TicketPriority>;

/** The bare enum, for `.options` where the preprocess wrapper hides it. */
export const TicketPriorityValues = ["low", "medium", "high", "critical"] as const;

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

/** Above the default — what the escalated queue view and the badges react to. */
export const ELEVATED_PRIORITIES: TicketPriority[] = ["high", "critical"];

export const isElevatedPriority = (priority: TicketPriority): boolean =>
  ELEVATED_PRIORITIES.includes(priority);

/**
 * What a ticket is worth before anybody triages it.
 *
 * Also the ceiling a reporter gets: priority is an operational judgement about the
 * whole queue, and a field where everybody can write "kritisch" ranks nothing.
 * Enforced in `createTicket`, not by leaving the control out of a form — see the
 * note there.
 */
export const DEFAULT_TICKET_PRIORITY: TicketPriority = "medium";

/**
 * A stored or submitted value, or the built-in default.
 *
 * Falls back rather than throwing, so an unknown value in a settings blob does not
 * take the rest of that blob down with it — see `RoleRulesSchema`. The legacy names
 * still resolve, because `TicketPriority` preprocesses them.
 */
export function toTicketPriority(value: unknown): TicketPriority {
  return TicketPriority.safeParse(value).data ?? DEFAULT_TICKET_PRIORITY;
}

/* ──────────────────────────────────────────────────────────────────────────
   Quick categories for the chat intake.

   Three pills, not a dropdown of every schema category. This is the *free-text*
   path — somebody who knows which form they need takes the catalogue instead — and
   its whole purpose is to be answerable in one tap. A picker with fifteen entries
   would be the form monster this route exists to avoid.

   A fixed list rather than the distinct `category` values of the installed
   schemas: the value is stored in the payload and validated against the enum in
   `QUICK_TICKET_SCHEMA`, so a list that drifted from that enum would make the pill
   unsubmittable — and the enum is what the offline suite can check.
   ────────────────────────────────────────────────────────────────────────── */

export const INTAKE_CATEGORIES = [
  { value: "hardware", label: "Hardware-Problem" },
  { value: "software", label: "Software / Zugang" },
  { value: "other", label: "Sonstiges" },
] as const;

export type IntakeCategory = (typeof INTAKE_CATEGORIES)[number]["value"];

export const INTAKE_CATEGORY_VALUES = INTAKE_CATEGORIES.map(
  (entry) => entry.value,
) as IntakeCategory[];

export const INTAKE_CATEGORY_LABELS = Object.fromEntries(
  INTAKE_CATEGORIES.map((entry) => [entry.value, entry.label]),
) as Record<IntakeCategory, string>;

/**
 * Rank order for sorting, low to critical.
 *
 * A `priority` column sorted as text gives critical · high · low · medium, which is
 * alphabetical and answers no question anybody asked. The queue turns this into a
 * SQL `CASE`, so the order lives here once rather than in a hand-written expression.
 */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Same problem, same fix: lifecycle order, not alphabetical. */
export const STATUS_RANK: Record<TicketStatus, number> = {
  open: 0,
  waiting_user: 1,
  closed: 2,
};

/* ──────────────────────────────────────────────────────────────────────────
   Welche Spalten die Queue zeigt — eine Entscheidung je Agent.

   Vorher entschied das eine Mischung aus Props (`showOwner`, `showTime`,
   `locations`) und hartkodierten Breakpoints. Welche Spalten jemand braucht,
   hängt aber an seiner Arbeit: wer Standorte betreut, will die Spalte, wer Zeiten
   bucht, die Zeitspalte, und wer beides nicht tut, will den Platz für den Titel.

   **Nummer und Titel sind gesperrt**, und das ist keine Vorsicht. Die Titelspalte
   trägt `w-full max-w-0` und ist damit die *absorbierende*: sie nimmt den ganzen
   Schlupf und kürzt. Ohne sie hat das automatische Tabellenlayout nichts, dem es
   ihn geben kann, und die Tabelle fällt auf Inhaltsbreite zusammen. Die Nummer ist
   die Kennung, an der ein Mensch die Zeile liest — und der `j`/`k`-Cursor läuft
   über die Zeile, nicht über eine Spalte.

   **Gespeichert wird das Ausgeblendete, nicht das Gezeigte.** Dieselbe
   Entscheidung wie bei `hidden_forms`: eine Spalte, die eine spätere Version
   dazunimmt, ist damit für jeden sofort sichtbar. Die Gegenrichtung hätte sie für
   jeden unsichtbar gemacht, der einmal gespeichert hat — und das Fehlerbild wäre
   „die neue Spalte gibt es nicht".

   **Drei Verengungen, jede nimmt nur weg:** das Modul (`feature_time_tracking`,
   Pins, gibt es überhaupt Standorte), dann der Agent, dann der Viewport über die
   bestehenden `hidden … table-cell`-Breakpoints. Ein Agent kann nichts
   einschalten, was das Modul nicht anbietet — dieselbe Form wie „Sichtbarkeit
   verengt die Rolle".
   ────────────────────────────────────────────────────────────────────────── */

export const QUEUE_COLUMNS = [
  "pin",
  "location",
  "reporter",
  "owner",
  "priority",
  "status",
  "time",
  "age",
] as const;
export type QueueColumn = (typeof QUEUE_COLUMNS)[number];

export const QUEUE_COLUMN_LABELS: Record<QueueColumn, string> = {
  pin: "Anheften",
  location: "Standort",
  reporter: "Melder",
  owner: "Bearbeiter",
  priority: "Priorität",
  status: "Status",
  time: "Zeit",
  age: "Alter",
};

/**
 * Die ausgeblendeten Spalten eines Agenten.
 *
 * Gefiltert statt geprüft: `z.array(z.string())` mit Filter in der Transform und
 * **kein** `z.array(Enum)`. Zod 4 lehnt ein unbekanntes Element ab, und ein
 * abgelehnter Parse nähme die ganze Spaltenwahl mit — ein Spaltenschlüssel, den
 * eine spätere Version entfernt, macht dann aus einer gepflegten Auswahl den
 * Auslieferungszustand. Dieselbe Falle wie bei `hidden_areas` und `widget_order`.
 */
export function toHiddenQueueColumns(value: unknown): QueueColumn[] {
  if (!Array.isArray(value)) return [];
  const named = new Set(value.filter((entry) => typeof entry === "string"));
  // In der Reihenfolge von `QUEUE_COLUMNS`, damit die gespeicherte Zeile nicht
  // davon abhängt, in welcher Reihenfolge die Maske ihre Haken abschickt.
  return QUEUE_COLUMNS.filter((column) => named.has(column));
}

/** Zeigt die Queue diese Spalte? Ein fehlender Eintrag heißt „ja". */
export const queueColumnVisible = (
  hidden: QueueColumn[],
  column: QueueColumn,
): boolean => !hidden.includes(column);

/* ──────────────────────────────────────────────────────────────────────────
   Two number series, one shape: a prefix, a leading 1, then the counter.

   `TCK-1000000000000001` is the first ticket ever written on an instance,
   `INV-10000001` the first inventory object. Sixteen digits for a ticket, eight
   for an object, the leading 1 included in both counts.

   **The leading 1 is part of the *display*, not of the stored value.** The
   database keeps the plain counter — 1, 2, 3 — and the formatter builds the rest.
   That is not decoration: a literal seventeen-digit value would be past
   `Number.MAX_SAFE_INTEGER` (~9.007e15), so `10000000000000001` cannot be held in
   a JavaScript number without silently rounding. Everything that sorts, counts or
   compares therefore works on the counter, and only the two functions below know
   about the padding.

   Why a leading 1 at all: a fixed first digit makes every number the same width
   from the very first one, so `TCK-…001` and `TCK-…999` line up in a mail subject,
   a spreadsheet column and a sorted list. Zero-padding alone did that too, but a
   run of leading zeros invites somebody to drop them.

   The counter's ceiling is the field width minus that digit: 10^15 - 1 tickets and
   9,999,999 objects. Recorded rather than left as a surprise.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Only affects a fresh instance. An existing one keeps counting from its own
 * highest number: renumbering would invalidate every reference in every mail
 * already sent.
 */
export const TICKET_NUMBER_START = 1;

/** Total digits after the prefix, the leading 1 included. */
export const TICKET_NUMBER_DIGITS = 16;
export const TICKET_NUMBER_PREFIX = "TCK";

/** Retired from display, kept because the parser still recognises it. */
export const LEGACY_TICKET_PREFIX = "TICK";

export const INVENTORY_NUMBER_START = 1;
export const INVENTORY_NUMBER_DIGITS = 8;
export const INVENTORY_NUMBER_PREFIX = "INV";

/**
 * `<PREFIX>-1<counter padded to width - 1>`.
 *
 * Shared by both series so the two cannot drift apart in the one respect that
 * matters — where the counter starts inside the digit run — and so `parse` below
 * has exactly one format to reverse.
 */
function formatSeries(prefix: string, digits: number, n: number): string {
  return `${prefix}-1${String(Math.max(0, Math.trunc(n))).padStart(digits - 1, "0")}`;
}

/**
 * The counter behind whatever somebody typed, or null.
 *
 * Accepts the full form (`TCK-1000000000000042`), the prefix with a short number
 * (`TCK-42`), a bare number (`42`) and a leading `#`. Case and the separator are
 * free, because these get read off a sticky note and out of a mail subject.
 *
 * **A digit run of exactly the full width beginning with 1 is the display form**
 * and its leading digit is dropped; anything shorter is taken as the counter
 * itself. That rule is what makes both `TCK-1000000000000042` and `42` mean ticket
 * 42 — and it is the reason the leading digit is fixed rather than free: a
 * variable first digit would make the two readings ambiguous.
 */
function parseSeries(
  input: string,
  prefixes: string[],
  digits: number,
): number | null {
  const cleaned = input.trim().replace(/^#/, "");
  const pattern = new RegExp(
    `^(?:(?:${prefixes.join("|")})[\\s-]*)?#?(\\d{1,${digits}})$`,
    "i",
  );
  const match = cleaned.match(pattern);
  if (!match) return null;

  const shown = match[1];
  const counter =
    shown.length === digits && shown.startsWith("1")
      ? shown.slice(1)
      : shown;

  const value = Number.parseInt(counter, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export const formatTicketNumber = (n: number): string =>
  formatSeries(TICKET_NUMBER_PREFIX, TICKET_NUMBER_DIGITS, n);

export const parseTicketNumber = (input: string): number | null =>
  parseSeries(
    input,
    [TICKET_NUMBER_PREFIX, LEGACY_TICKET_PREFIX],
    TICKET_NUMBER_DIGITS,
  );

/**
 * The inventory number of a CMDB object: `INV-10000001`.
 *
 * Assigned by MITS on insert and never editable — see `saveConfigurationItem`. The
 * free-text `asset_tag` beside it is somebody else's number (a vendor sticker, an
 * older system) and stays optional.
 */
export const formatInventoryNumber = (n: number): string =>
  formatSeries(INVENTORY_NUMBER_PREFIX, INVENTORY_NUMBER_DIGITS, n);

export const parseInventoryNumber = (input: string): number | null =>
  parseSeries(input, [INVENTORY_NUMBER_PREFIX], INVENTORY_NUMBER_DIGITS);

/**
 * An attachment as it appears in a stored payload.
 *
 * The browser holds real `File` objects; they are uploaded before the ticket is
 * created and the payload keeps this reference. `fileId` and `url` are optional so
 * tickets written before disk storage existed still parse — those rows carry name
 * and size only.
 */
export const AttachmentMetaSchema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  type: z.string().default(""),
  /** Id in `mits_upload`. Ownership is verified server-side before it is stored. */
  fileId: z.string().optional(),
  /** Download path, e.g. /api/uploads/<fileId>. */
  url: z.string().optional(),
});
export type AttachmentMeta = z.infer<typeof AttachmentMetaSchema>;

export const MITSTicketSchema = z.object({
  id: z.string(),
  /**
   * Sequential, human-readable. Defaults to 0 so a row written before the column
   * existed still parses — it renders as 0, which is visibly wrong rather than
   * silently plausible.
   */
  ticket_number: z.coerce.number().int().nonnegative().default(0),
  /** Branch or site this ticket belongs to. Null for tickets filed before locations. */
  location_id: z.string().nullable().default(null),
  /**
   * The category this ticket sits in — always the leaf, never the pair.
   *
   * Null means uncategorised, which is honest for every ticket filed before
   * categories existed and for one the triage rules did not recognise. The
   * cascading filter treats it as "no match" rather than folding it into a root.
   *
   * Defaulted, so a row written before the column parses instead of throwing on
   * read — the same reason `location_id` is.
   */
  category_id: z.string().nullable().default(null),
  source: TicketSource,
  /** Which MITSFormSchema produced `payload`. Absent for free-text legacy tickets. */
  form_schema_id: z.string().optional(),
  /** Short display line for lists and the board; derived server-side from the payload. */
  title: z.string(),
  /** Answers, keyed by the JSON-Schema property name. Validated per form schema. */
  payload: z.record(z.string(), z.unknown()),
  status: TicketStatus,
  priority: TicketPriority,
  /** Owner. Set from the session — never accepted from the client. */
  created_by: z.string(),
  created_by_email: z.string(),
  /** Agent the ticket is assigned to, if any. */
  assigned_to: z.string().nullable().default(null),
  /**
   * Display name of the assignee, resolved on read — **not** a stored column.
   *
   * Denormalised into the ticket shape rather than looked up per row, because the
   * queue's owner column and its owner *sort* need the same value and the sort has
   * to happen in SQL: sorting by `assigned_to` would order by opaque user ids, and
   * sorting in JavaScript after `LIMIT 500` would sort the wrong five hundred rows.
   * One LEFT JOIN answers both.
   *
   * Defaulted, so `createTicket` — which builds its row by hand — still parses.
   */
  assigned_to_name: z.string().nullable().default(null),
  /**
   * Newest thing that happened which this reader did not do, or null.
   *
   * Derived per request and per *user*: the reader's own reply is not news to them,
   * and for a reporter an internal note does not exist at all. Both exclusions live
   * in the SQL — see `searchTickets`.
   */
  last_activity_at: z.coerce.date().nullable().default(null),
  /** True when `last_activity_at` is newer than this reader's last visit. */
  unread: z.boolean().default(false),
  /**
   * Whether *this reader* has the ticket pinned to the top of their queue.
   *
   * Per user like `unread` beside it, and computed in the same one place
   * (`searchTickets`). Everywhere else the field is absent and this default is the
   * honest answer — a detail page that reported `pinned: false` from a query that
   * never asked would be stating something it did not check.
   */
  pinned: z.boolean().default(false),
  /**
   * Der Melder hat nachgelegt: es gibt eine Melder-Nachricht, die neuer ist als
   * die jüngste öffentliche Team-Antwort — und eine solche Antwort existiert.
   *
   * **Geteilt, nicht pro Leser.** Das ist der Unterschied zu `unread` und
   * `pinned` darüber: die beiden antworten je Konto, dieses Feld beschreibt das
   * Ticket. Zwei Agenten sehen hier denselben Wert, und genau das ist der Zweck —
   * „wartet ein Kunde auf uns" ist keine persönliche Frage.
   *
   * Schärfer als „der Melder ist am Zug", weil das der Status schon sagt; die
   * Begründung steht am Ausdruck in `searchTickets`. Wie die zwei darüber nur
   * dort berechnet, überall sonst ist dieser Default die ehrliche Antwort.
   */
  awaiting_reply: z.boolean().default(false),
  /** Minutes of work logged against this ticket. Summed on read, never stored. */
  logged_minutes: z.number().int().nonnegative().default(0),
  /**
   * Topic labels, one to three, written once when the ticket is created.
   *
   * Stored rather than derived: they are produced by a model, and a value that
   * changed every time somebody opened the page — or vanished when the provider
   * was switched off — would be worse than no labels. An agent can see what was
   * suggested at the time and judge it.
   */
  tags: z.array(z.string()).default([]),
  /**
   * Addresses that get a copy of every mail this ticket sends.
   *
   * Not participants: they receive, they do not gain access. A CC address is a
   * mailbox, not an account — putting somebody in CC must not hand them a MITS
   * login or the right to read a ticket in the portal, and it does not.
   *
   * Defaulted, because every row written before the column existed has none.
   */
  cc_emails: z.array(z.string()).default([]),
  /**
   * This ticket *is* the outage, not one of its reports.
   *
   * A column rather than "has children", because the two are different claims: a
   * major incident is declared, and it stays one for the whole time it is being
   * worked even if its last child gets unlinked.
   */
  major_incident: z.boolean().default(false),
  /**
   * Dieses eine Ticket nimmt die Verfallsautomatik aus.
   *
   * Eine Agenten-Entscheidung am einzelnen Fall: „hier warte ich bewusst länger".
   * Defaultet auf `false`, also „Automatik gilt" — die andere Richtung wäre
   * sicherer und wäre trotzdem falsch, weil ein Bestand voller Ausnahmen aus
   * einer eingeschalteten Frist eine Einstellung macht, die nichts tut.
   */
  auto_close_off: z.boolean().default(false),
  /** Coerced: the API and Ollama both hand us ISO strings, not Date objects. */
  created_at: z.coerce.date(),
});
export type MITSTicket = z.infer<typeof MITSTicketSchema>;

/**
 * A ticket that has not been persisted yet.
 *
 * Everything the server owns is omitted, not optional: id, status, timestamp,
 * ownership, assignment and the derived title. A client that posts `created_by`
 * is therefore ignored rather than trusted — the API fills it from the session.
 */
export const MITSTicketDraftSchema = MITSTicketSchema.omit({
  id: true,
  ticket_number: true,
  status: true,
  created_at: true,
  created_by: true,
  created_by_email: true,
  assigned_to: true,
  title: true,
  /*
   * The read-time fields. Omitted rather than made optional for the same
   * reason `created_by` is: a client that sends `unread: false` or its own
   * `logged_minutes` should be ignored, and a schema that accepts the key invites
   * exactly one future call site to trust it.
   */
  assigned_to_name: true,
  last_activity_at: true,
  unread: true,
  pinned: true,
  awaiting_reply: true,
  logged_minutes: true,
  // Written by the routing service after the ticket exists, and declared by an
  // agent respectively. Neither is a client's to state.
  tags: true,
  major_incident: true,
  // Ein Schalter am Betriebsablauf, den ein Agent umlegt — nicht etwas, das mit
  // dem Formular hereinkommt. Ein Entwurf, der ihn setzen könnte, wäre ein
  // Melder, der sein Ticket von der Aufräumregel ausnimmt.
  auto_close_off: true,
  /*
   * Nor is this one. A CC address means every future answer on this ticket
   * lands in that mailbox; accepting it from whoever posts the form would let a
   * reporter — or a handcrafted request — subscribe an arbitrary address to a
   * conversation before anybody at the desk has seen it. Set afterwards, by an
   * agent, through `setTicketCc`.
   */
  cc_emails: true,
}).extend({
  /**
   * Optional, **not** defaulted — and that is the load-bearing part.
   *
   * A default here would make "did not say" and "said medium" the same value, and
   * `createTicket` needs to tell them apart: the priority a role's tickets start
   * with is configurable per role now, so an absent field has to mean "use that"
   * rather than "medium". With a default, the setting would be invisible to every
   * client that simply omits the field — which is all of them.
   *
   * A reporter's value is still ignored either way; see the note in `createTicket`.
   */
  priority: TicketPriority.optional(),
  /** The reporter may state their site; everything else about them comes from the session. */
  location_id: z.string().nullable().default(null),
  /**
   * Kept rather than omitted, unlike `tags` and `cc_emails`, and the difference is
   * what the value can do. A category is a filing decision: the intent tiles are
   * the reporter making it, and getting it wrong costs a re-route. It grants
   * nothing and reaches nobody.
   *
   * Still not trusted as given — `createTicket` checks the id against the category
   * table and drops an unknown one to null rather than storing a dangling
   * reference that no filter would ever match.
   */
  category_id: z.string().nullable().default(null),
});
export type MITSTicketDraft = z.infer<typeof MITSTicketDraftSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   Agent workflow: replies and internal notes.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * `internal` is the security-relevant half of this type. An internal note is
 * only ever returned to a agent or admin, and it never triggers a mail —
 * see `listCommentsFor` in `lib/ticket-comments.ts`.
 */
export const CommentVisibility = z.enum(["public", "internal"]);
export type CommentVisibility = z.infer<typeof CommentVisibility>;

/**
 * How `body` is to be read.
 *
 * `text` is rendered with `whitespace-pre-wrap`; `html` is handed to
 * `dangerouslySetInnerHTML` and is only ever written after `sanitizeRichText` has
 * cleaned it. Defaulted to `text` so a row from before the editor existed is never
 * treated as markup — that direction is the safe one.
 */
export const CommentBodyFormat = z.enum(["text", "html"]);
export type CommentBodyFormat = z.infer<typeof CommentBodyFormat>;

export const TicketCommentSchema = z.object({
  id: z.string(),
  ticket_id: z.string(),
  author_id: z.string(),
  author_email: z.string(),
  author_name: z.string(),
  /** Whether the author was staff when they wrote it, for the "Team" badge. */
  author_is_agent: z.boolean().default(false),
  visibility: CommentVisibility.default("public"),
  body: z.string().min(1).max(20000),
  body_format: CommentBodyFormat.default("text"),
  created_at: z.coerce.date(),
  /**
   * When it was last corrected, or `null` for never.
   *
   * Shown as a marker next to the timestamp rather than hidden: a message whose
   * text changed after somebody replied to it is a different message, and the
   * reader of the reply has to be able to tell.
   */
  edited_at: z.coerce.date().nullable().default(null),
});
export type TicketComment = z.infer<typeof TicketCommentSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   Worklogs — time booked against a ticket.

   Stored in whole minutes. People type "45", "1,5 Std", "1:30" and "90m", and the
   thing that has to be summed is a number; keeping the typed form would move the
   rounding into every report that adds it up, and two reports would then disagree
   about the same week.
   ────────────────────────────────────────────────────────────────────────── */

/** One booking may not exceed a long day. A typo of 4500 is not a 75-hour shift. */
export const WORKLOG_MAX_MINUTES = 16 * 60;

export const WorklogEntrySchema = z.object({
  id: z.string(),
  ticket_id: z.string(),
  user_id: z.string(),
  /** Copied at write time, like `author_name` on a comment: a deleted account must
   *  not turn a year of timesheets into rows of opaque ids. */
  user_name: z.string(),
  minutes: z.number().int().positive().max(WORKLOG_MAX_MINUTES),
  note: z.string().max(500).default(""),
  /** `YYYY-MM-DD`. When the work happened, not when the row was written. */
  performed_at: z.string().max(10),
  created_at: z.coerce.date(),
});
export type WorklogEntry = z.infer<typeof WorklogEntrySchema>;

/**
 * Read a duration the way a person writes one.
 *
 * Accepted: `45`, `45m`, `45 Min`, `1:30`, `1,5`, `1.5h`, `2 Std`, `1h30`.
 * Returns null for anything it cannot read, so the caller reports a parse failure
 * instead of booking a number nobody meant — silently reading "1,5" as one minute
 * is the mistake that only surfaces at the end of the month.
 *
 * The ambiguous case is a bare number: `90` means ninety **minutes**, because that
 * is what a helpdesk timesheet is denominated in and "1,5" is how the same person
 * writes an hour and a half. A bare decimal (`1,5`, `0.25`) is read as hours,
 * since nobody books a quarter of a minute.
 *
 * Pure and here rather than in `lib/worklogs.ts` for the usual reason: the module
 * is `server-only`, and this is the function where an off-by-a-factor-of-sixty has
 * no visible failure mode.
 */
export function parseDurationMinutes(input: string): number | null {
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;

  // `1:30` — hours and minutes. Minutes above 59 are a typo, not 1h90m.
  const clock = raw.match(/^(\d{1,3}):([0-5]\d)$/);
  if (clock) {
    return clamp(Number(clock[1]) * 60 + Number(clock[2]));
  }

  // `1h30`, `1std30`, `2h`, `2std`
  const split = raw.match(/^(\d{1,3})(?:h|std|stunden?)(\d{1,2})?(?:m|min|minuten?)?$/);
  if (split) {
    const minutes = split[2] === undefined ? 0 : Number(split[2]);
    if (minutes > 59) return null;
    return clamp(Number(split[1]) * 60 + minutes);
  }

  // `1,5h`, `0.25 std`
  const hours = raw.match(/^(\d{1,3}(?:[.,]\d{1,2})?)(?:h|std|stunden?)$/);
  if (hours) {
    return clamp(Math.round(Number(hours[1].replace(",", ".")) * 60));
  }

  // `45m`, `45min`
  const minutes = raw.match(/^(\d{1,4})(?:m|min|minuten?)$/);
  if (minutes) return clamp(Number(minutes[1]));

  // A bare decimal is hours; a bare integer is minutes. See the note above.
  const bare = raw.match(/^(\d{1,4})([.,]\d{1,2})?$/);
  if (bare) {
    if (bare[2]) {
      return clamp(Math.round(Number(raw.replace(",", ".")) * 60));
    }
    return clamp(Number(bare[1]));
  }

  return null;
}

/** Zero and anything past the daily ceiling are refused rather than rounded. */
function clamp(minutes: number): number | null {
  if (!Number.isFinite(minutes)) return null;
  if (minutes <= 0 || minutes > WORKLOG_MAX_MINUTES) return null;
  return Math.round(minutes);
}

/* ──────────────────────────────────────────────────────────────────────────
   Ticket links.

   Stored once per pair, in the direction the agent stated it. The opposite
   direction is derived on read — two rows would be two places for the same fact
   and could drift apart.
   ────────────────────────────────────────────────────────────────────────── */

export const TicketLinkKind = z.enum([
  "relates_to",
  "duplicate_of",
  "blocked_by",
  "parent_of",
]);
export type TicketLinkKind = z.infer<typeof TicketLinkKind>;

/** How the stored direction reads. */
export const TICKET_LINK_LABELS: Record<TicketLinkKind, string> = {
  relates_to: "Hängt zusammen mit",
  duplicate_of: "Ist Duplikat von",
  blocked_by: "Hängt ab von",
  parent_of: "Übergeordnet zu",
};

/** …and how it reads from the other ticket's side. */
export const TICKET_LINK_INVERSE_LABELS: Record<TicketLinkKind, string> = {
  relates_to: "Hängt zusammen mit",
  duplicate_of: "Hat Duplikat",
  blocked_by: "Blockiert",
  parent_of: "Untergeordnet zu",
};

export const TicketLinkSchema = z.object({
  id: z.string(),
  from_ticket: z.string(),
  to_ticket: z.string(),
  kind: TicketLinkKind,
  created_by: z.string(),
  created_at: z.coerce.date(),
});
export type TicketLink = z.infer<typeof TicketLinkSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   Canned responses.
   ────────────────────────────────────────────────────────────────────────── */

export const CannedResponseSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(8000),
  category: z.string().max(120).default(""),
  /** Typed after the slash to reach this entry. Optional; see `normalizeShortcut`. */
  shortcut: z.string().max(40).default(""),
  order_index: z.number().int().nonnegative().default(0),
});
export type CannedResponse = z.infer<typeof CannedResponseSchema>;

/**
 * The stored form of a slash shortcut: lower case, no slash, letters, digits
 * and dashes.
 *
 * Normalised on the way in rather than validated: an admin who types "/Reset"
 * or "Reset " means the same thing as "reset", and rejecting it teaches them a
 * syntax instead of accepting an obvious intent. The empty string is the honest
 * result for input that folds away to nothing, and an empty shortcut simply
 * means the entry is reachable by name only.
 */
export function normalizeShortcut(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9-]+/g, "")
    .slice(0, 40);
}

/**
 * Everything a template may substitute, resolved by the caller.
 *
 * Flat and complete: every field is required, so adding one is a compile error at
 * both call sites rather than an empty string in somebody's reply. A partial
 * object would substitute "undefined" into a message going to a customer.
 */
export interface TemplateValues {
  ticket_number: string;
  ticket_category: string;
  reporter_name: string;
  reporter_first_name: string;
  agent_name: string;
  agent_first_name: string;
}

/**
 * The tokens a canned response or macro may carry.
 *
 * **Two syntaxes, both supported, and that is deliberate.** `{{kunde.vorname}}`
 * is the documented one — dotted, doubled braces, readable to somebody who has
 * seen any other template language. `{reporter_name}` is what earlier versions
 * wrote, and templates using it are sitting in `mits_setting` on every existing
 * instance. Dropping it would turn those into messages that mail the literal
 * `{reporter_name}` to a customer, which is the worst possible way to deprecate
 * a syntax.
 *
 * Literal replacement, no expression language. Same rule as `fillPortalText`: a
 * template that could compute would be a template that could leak.
 */
const TEMPLATE_TOKENS: Record<string, keyof TemplateValues> = {
  // Current syntax.
  "{{ticket.id}}": "ticket_number",
  "{{ticket.nummer}}": "ticket_number",
  "{{ticket.kategorie}}": "ticket_category",
  "{{kunde.name}}": "reporter_name",
  "{{kunde.vorname}}": "reporter_first_name",
  "{{agent.name}}": "agent_name",
  "{{agent.vorname}}": "agent_first_name",
  // Kept working for templates written before the dotted form existed.
  "{ticket_number}": "ticket_number",
  "{reporter_name}": "reporter_name",
  "{agent_name}": "agent_name",
};

export function fillCannedResponse(
  body: string,
  values: TemplateValues,
): string {
  let out = body;
  for (const [token, key] of Object.entries(TEMPLATE_TOKENS)) {
    out = out.replaceAll(token, values[key]);
  }
  return out;
}

/**
 * A first name, from whatever the display name happens to be.
 *
 * The first whitespace-separated word, and an address has none — so
 * `anna.meier@firma.de` yields the whole address rather than something that looks
 * like a name and is not. Greeting somebody by a mangled fragment of their email
 * is worse than greeting them by the address.
 */
export function firstNameOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed.includes("@")) return trimmed;
  return trimmed.split(/\s+/)[0];
}

/** Shown in the admin mask, so nobody has to guess the spelling. */
export const CANNED_PLACEHOLDERS = [
  "{{kunde.vorname}}",
  "{{kunde.name}}",
  "{{agent.vorname}}",
  "{{agent.name}}",
  "{{ticket.id}}",
  "{{ticket.kategorie}}",
] as const;

/* ──────────────────────────────────────────────────────────────────────────
   Macros — one click, several field changes.

   A macro is *data*, not code: four optional field changes and an optional canned
   response, stored as JSON in `mits_setting` beside the responses themselves. A
   scripting hook would be more powerful and would also be a language nobody can
   audit; every action here is one an agent could have performed by hand, which is
   what makes the audit trail it leaves honest.

   The empty string means "leave this alone" throughout. A `null` would say the
   same thing, but the admin form posts strings and a sentinel that survives a
   round trip through `FormData` unchanged is one fewer place to get it wrong.
   ────────────────────────────────────────────────────────────────────────── */

/** What a macro does about assignment. */
export const MacroAssign = z.enum(["", "self", "unassign"]);
export type MacroAssign = z.infer<typeof MacroAssign>;

/**
 * What happens to the macro's canned response.
 *
 * `insert` puts it in the composer and the agent presses send — the rule the rest
 * of MITS follows, and the default here.
 *
 * `send` posts it immediately. That is a real exception to "Textbausteine werden
 * eingesetzt, nie gesendet", and it is allowed because the confirming human is a
 * different one: an *admin* wrote this text and deliberately marked this macro as
 * auto-sending. The agent clicking it is choosing that pre-approved message by
 * name. What is still impossible is a client deciding to send text of its own.
 */
export const MacroReplyMode = z.enum(["insert", "send"]);
export type MacroReplyMode = z.infer<typeof MacroReplyMode>;

export const MACRO_REPLY_MODE_LABELS: Record<MacroReplyMode, string> = {
  insert: "In das Antwortfeld einsetzen",
  send: "Sofort als Antwort senden",
};

export const MacroSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  /** One line in the macro menu. Optional — a good title often needs no gloss. */
  description: z.string().max(300).default(""),
  /** Lucide icon name, resolved through the allow-list in lib/icons.ts. */
  icon: z.string().max(60).default("Zap"),
  /** Typed after the slash to reach this macro. Same rules as a canned response. */
  shortcut: z.string().max(40).default(""),
  /*
   * Parsed leniently rather than as the status enum: a macro written against a
   * status a later build removed has to still load, so the admin can see and fix
   * it. `runMacro` validates before applying and ignores anything unrecognised —
   * a macro that silently does nothing beats a macros page that will not open.
   */
  set_status: z.string().max(32).default(""),
  set_priority: z.string().max(32).default(""),
  assign: MacroAssign.default(""),
  /** Id of a canned response, or empty for a macro that only changes fields. */
  canned_response_id: z.string().max(64).default(""),
  reply_mode: MacroReplyMode.default("insert"),
  order_index: z.number().int().nonnegative().default(0),
});
export type Macro = z.infer<typeof MacroSchema>;

/**
 * Whether this macro would actually do anything.
 *
 * Checked when saving. A macro with every field left alone and no response is a
 * button that reports success and changes nothing, which is worse than no button:
 * the agent believes the ticket moved.
 */
export function macroIsEmpty(macro: Macro): boolean {
  return (
    macro.set_status === "" &&
    macro.set_priority === "" &&
    macro.assign === "" &&
    macro.canned_response_id === ""
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Data retention and upload limits.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Upload sizes offered, in MB.
 *
 * A fixed set rather than a free number. The value bounds a single request body, and a
 * mistyped 5000 would let one upload exhaust the container's memory before any check
 * ran — a dropdown cannot be mistyped.
 */
export const UPLOAD_SIZE_CHOICES = [2, 5, 10, 25, 50, 100] as const;
export type UploadSizeChoice = (typeof UPLOAD_SIZE_CHOICES)[number];

/** Years a closed ticket is kept before the retention run may anonymise it. */
export const RETENTION_YEAR_CHOICES = [1, 2, 3, 5, 7, 10] as const;

export const DataSettingsSchema = z.object({
  /** Maximum size of one attachment, in MB. */
  maxUploadMb: z
    .unknown()
    .transform((value) => {
      const parsed = Number(value);
      return (UPLOAD_SIZE_CHOICES as readonly number[]).includes(parsed)
        ? parsed
        : 10;
    })
    .default(10),
  /**
   * How long a closed ticket keeps its reporter's identity.
   *
   * Coerced and clamped like the upload size: a stored value from an older build has to
   * resolve to something usable, and a failed parse would discard the upload limit
   * alongside it.
   */
  retentionYears: z
    .unknown()
    .transform((value) => {
      const parsed = Number(value);
      return (RETENTION_YEAR_CHOICES as readonly number[]).includes(parsed)
        ? parsed
        : 3;
    })
    .default(3),
});
export type DataSettings = z.infer<typeof DataSettingsSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   Workflow: was beim Antworten passiert, und was mit stillstehenden Tickets.

   Eigener Setting-Key (`workflow`) und keine Erweiterung von `data` — zwei
   Masken auf einem Blob überschreiben sich gegenseitig Abschnitte, dieselbe
   Begründung wie bei den fünf `portal_*`-Keys.

   **Alle drei Fristen stehen im Auslieferungszustand auf `0` = aus.** Ein
   Update, das anfängt, Kundentickets zu schließen und Mail zu verschicken, ist
   die eine Richtung, die niemand bemerkt, bis ein Kunde anruft. Die beiden
   Schalter darüber sind dagegen an: sie ändern nur, wie ein Status heißt, den
   sonst niemand pflegt.
   ────────────────────────────────────────────────────────────────────────── */

/** Tage. `0` heißt aus und steht deshalb vorn, nicht hinten. */
export const AUTO_CLOSE_DAY_CHOICES = [0, 1, 3, 7, 14, 30, 60, 90] as const;

/**
 * Eine Frist in Tagen, geklemmt statt geprüft.
 *
 * Dieselbe Regel wie bei `sessionLifetimeDays` und `hidden_areas`: ein Wert, den
 * dieser Build nicht kennt, wird zu `0` und nicht zum Ausfall der ganzen
 * Konfiguration. Und `0` ist hier die sichere Richtung — aus, nicht „sofort".
 */
export function toAutoCloseDays(value: unknown): number {
  const days = Number(value);
  return (AUTO_CLOSE_DAY_CHOICES as readonly number[]).includes(days) ? days : 0;
}

export const DEFAULT_WAITING_REMINDER_SUBJECT =
  "Erinnerung zu Ihrem Ticket {{ticket.nummer}}";

/*
 * Vorgabetexte mit denselben Platzhaltern wie Textbausteine und Makros
 * (`TEMPLATE_TOKENS` weiter unten), aufgelöst über `templateValuesFor` auf der
 * Serverseite. Kein zweiter Platzhalter-Satz: ein Admin, der die Tokens aus
 * einem Baustein kennt, soll sie hier nicht neu lernen — und ein Token, das es
 * nur hier gäbe, stünde beim ersten Versand wörtlich im Postfach eines Kunden.
 *
 * Der Titel steht bewusst in keinem Token: die Mail-Vorlage setzt ihn ohnehin
 * als Zeile unter die Überschrift.
 */
export const DEFAULT_WAITING_REMINDER_BODY = [
  "Guten Tag {{kunde.vorname}},",
  "",
  "zu Ihrem Ticket {{ticket.nummer}} warten wir noch auf eine Rückmeldung.",
  "",
  "Wenn sich die Sache erledigt hat, brauchen Sie nichts zu tun — das Ticket",
  "schließt sich dann von selbst.",
].join("\n");

export const DEFAULT_AUTO_CLOSE_NOTE =
  "Dieses Ticket wurde ohne weitere Rückmeldung automatisch geschlossen. Eine Antwort hier öffnet es wieder.";

export const WorkflowSettingsSchema = z.object({
  /** Eine öffentliche Antwort übernimmt ein unzugewiesenes Ticket. */
  claimOnReply: z.boolean().default(true),
  /** Der Status folgt dem Schreiben — siehe `nextStatusAfterReply`. */
  statusFollowsReply: z.boolean().default(true),

  /* Es gab hier einmal `resolvedCloseDays` — „Gelöst schließt nach N Tagen".
     Der Wert ist mit dem Statuswert `resolved` weggefallen: ein Zwischenzustand,
     dessen einziger Zweck war, später zum Endzustand zu werden, ist der
     Endzustand mit einer Verzögerung. Eine gespeicherte Zeile mit dem Schlüssel
     wird beim Parsen still verworfen, was hier richtig ist — das Objekt kennt
     keine `strict()`-Regel, und ein abgelehnter Parse nähme die Texte mit. */
  /** Erinnerung an den Melder, gerechnet ab dem Wechsel auf `waiting_user`. */
  waitingReminderDays: z.unknown().optional().transform(toAutoCloseDays),
  /** `waiting_user` → `closed`, gerechnet **ab der Erinnerung**, nicht ab dem Statuswechsel. */
  waitingCloseDays: z.unknown().optional().transform(toAutoCloseDays),

  waitingReminderSubject: z
    .string()
    .default(DEFAULT_WAITING_REMINDER_SUBJECT),
  waitingReminderBody: z.string().default(DEFAULT_WAITING_REMINDER_BODY),
  /** Was als öffentlicher Beitrag im Ticket steht, wenn die Automatik schließt. */
  autoCloseNote: z.string().default(DEFAULT_AUTO_CLOSE_NOTE),
});
export type WorkflowSettings = z.infer<typeof WorkflowSettingsSchema>;

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings =
  WorkflowSettingsSchema.parse({});

/**
 * Läuft überhaupt eine Automatik? Entscheidet, ob der Schalter am Ticket
 * erscheint.
 *
 * **Beide Fristen, nicht eine.** Ohne Erinnerung schließt „Wartet auf Anwender"
 * nie — die zweite Frist zählt ab dem Zeitpunkt, an dem die erste ihren Stempel
 * gesetzt hat. Eine Instanz mit nur der zweiten hat eine Einstellung, die nichts
 * tut, und der Schalter am Ticket wäre dann ein Schalter gegen nichts.
 */
export const hasAutoClose = (settings: WorkflowSettings): boolean =>
  settings.waitingReminderDays > 0 && settings.waitingCloseDays > 0;

/** `1,4 GB`, `312 MB`, `18 KB` — for a statistics panel, not a report. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} GB`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Object storage.

   Two backends, chosen per instance: the mounted data directory, or any
   S3-compatible endpoint — MinIO, AWS, Hetzner Object Storage.

   **The backend is recorded on every stored file, not only in the setting.** A row
   written while the disk backend was active has to keep being read from disk after
   somebody switches to S3; deciding on read from the current setting would make
   every existing attachment 404 the moment the switch was flipped, and nothing on
   the settings page would suggest that is what happened. Switching therefore
   affects new uploads only, and the two backends coexist indefinitely.
   ────────────────────────────────────────────────────────────────────────── */

export const StorageBackend = z.enum(["disk", "s3"]);
export type StorageBackend = z.infer<typeof StorageBackend>;

export const STORAGE_BACKEND_LABELS: Record<StorageBackend, string> = {
  disk: "Datenverzeichnis",
  s3: "S3-Objektspeicher",
};

export const S3SettingsSchema = z.object({
  /**
   * Host, optionally with a port. No scheme and no path — the scheme is `secure`
   * below and a path would end up inside the signed canonical URI, where it
   * silently breaks every signature.
   */
  endpoint: z.string().max(255).default(""),
  region: z.string().max(64).default("us-east-1"),
  bucket: z.string().max(255).default(""),
  accessKeyId: z.string().max(255).default(""),
  /** Empty on save means "keep the stored one" — see `resolveSmtpPassword`. */
  secretAccessKey: z.string().max(512).default(""),
  /** https unless somebody is running MinIO on a LAN without a certificate. */
  secure: z.boolean().default(true),
  /**
   * `https://host/bucket/key` rather than `https://bucket.host/key`.
   *
   * Default on, because it is what MinIO does out of the box and what every
   * S3-compatible provider still accepts. Virtual-host style additionally needs
   * a wildcard DNS entry, which a self-hosted MinIO usually does not have.
   */
  forcePathStyle: z.boolean().default(true),
  /** Key prefix, so one bucket can hold more than one instance. */
  prefix: z.string().max(120).default("mits/"),
});
export type S3Settings = z.infer<typeof S3SettingsSchema>;

export const DEFAULT_S3_SETTINGS: S3Settings = S3SettingsSchema.parse({});

/** Sentinel the admin form posts to mean "keep the stored secret". */
export const KEEP_S3_SECRET = "__keep__";

/** Enough to attempt a request. Checked before every call so a half-filled mask stays inert. */
export function isS3Configured(settings: S3Settings): boolean {
  return (
    settings.endpoint.trim() !== "" &&
    settings.bucket.trim() !== "" &&
    settings.accessKeyId.trim() !== "" &&
    settings.secretAccessKey.trim() !== ""
  );
}

/**
 * Whether this is usable as an endpoint host.
 *
 * A scheme or a path here is the mistake people actually make — pasting
 * `https://s3.example.com/` out of a provider's documentation. Both would land
 * inside the signed canonical URI and produce `SignatureDoesNotMatch`, which says
 * nothing about the real cause. Refused at the mask instead.
 */
export function isS3Endpoint(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  if (raw.includes("://") || raw.includes("/")) return false;
  return /^[A-Za-z0-9][A-Za-z0-9.-]*(:\d{1,5})?$/.test(raw);
}

/**
 * Normalise a key prefix: no leading slash, exactly one trailing one.
 *
 * An empty prefix stays empty — that is "the bucket root", which is legitimate.
 * A leading slash would produce a key beginning with `//`, which S3 accepts and
 * which then makes the object impossible to find with the obvious prefix listing.
 */
export function normaliseS3Prefix(value: string): string {
  const raw = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return raw === "" ? "" : `${raw}/`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Analytics.

   Seven widgets, each its own switch, plus the instance's default refresh
   interval. Stored as one row in `mits_setting` like every other admin-managed
   block.

   All seven default to **on**: unlike the AI features, nothing here leaves the
   instance or costs anything beyond a few indexed reads, and a panel that arrives
   empty reads as broken rather than as opt-in. The switches exist so an instance
   can hide a widget whose data it does not trust — a fresh install has no audit
   history, so its resolution times are honest but thin.
   ────────────────────────────────────────────────────────────────────────── */

export const ANALYTICS_WIDGETS = [
  "topCreators",
  "creatorTopics",
  "resolvedPerAgent",
  "resolutionTime",
  "firstResponse",
  "inflowVsResolved",
  "peakHeatmap",
  "distribution",
] as const;
export type AnalyticsWidget = (typeof ANALYTICS_WIDGETS)[number];

export const ANALYTICS_WIDGET_META: Record<
  AnalyticsWidget,
  { label: string; description: string }
> = {
  topCreators: {
    label: "Top Ticket-Ersteller",
    description: "Wer im Zeitraum die meisten Tickets aufgegeben hat.",
  },
  creatorTopics: {
    label: "Themen pro Anwender",
    description:
      "Welche Kategorien die häufigsten Melder einreichen — zeigt wiederkehrende Probleme an einem Arbeitsplatz.",
  },
  resolvedPerAgent: {
    label: "Gelöste Tickets pro Agent",
    description: "Abgeschlossene Tickets je Agentin und Agent im Zeitraum.",
  },
  resolutionTime: {
    label: "Durchschnittliche Lösungszeit",
    description:
      "Median und Mittel von der Erstellung bis zum Abschluss. Zählt nur Tickets, deren Abschluss in der Historie steht.",
  },
  firstResponse: {
    label: "Erstreaktionszeit",
    description:
      "Zeit bis zur ersten öffentlichen Antwort eines Agenten. Interne Notizen zählen nicht.",
  },
  inflowVsResolved: {
    label: "Eingang gegen Erledigt",
    description: "Zwei Linien im Zeitverlauf — zeigt, ob ein Rückstand wächst.",
  },
  peakHeatmap: {
    label: "Peak-Zeiten",
    description: "Wochentag gegen Uhrzeit, für die Schichtplanung.",
  },
  distribution: {
    label: "Verteilung",
    description: "Tickets nach Status, Priorität und Formular.",
  },
};

/**
 * Refresh intervals offered, in seconds. `0` is manual.
 *
 * A fixed set rather than a free number, for the same reason `REFRESH_INTERVALS`
 * is one: the value drives a timer that costs an aggregation per tick per open
 * tab, and "every second" typed into a box is a load problem nobody would connect
 * back to this field.
 */
export const ANALYTICS_REFRESH_CHOICES = [0, 5, 15, 30, 60, 300] as const;
export type AnalyticsRefresh = (typeof ANALYTICS_REFRESH_CHOICES)[number];

export const ANALYTICS_REFRESH_LABELS: Record<AnalyticsRefresh, string> = {
  0: "Aus (manuell)",
  5: "Alle 5 Sekunden",
  15: "Alle 15 Sekunden",
  30: "Alle 30 Sekunden",
  60: "Jede Minute",
  300: "Alle 5 Minuten",
};

export const isAnalyticsRefresh = (value: unknown): value is AnalyticsRefresh =>
  typeof value === "number" &&
  (ANALYTICS_REFRESH_CHOICES as readonly number[]).includes(value);

/** Parse a form field or a query parameter, falling back rather than throwing. */
export function toAnalyticsRefresh(
  value: unknown,
  fallback: AnalyticsRefresh = 0,
): AnalyticsRefresh {
  const parsed = Number(value);
  return isAnalyticsRefresh(parsed) ? parsed : fallback;
}

export const AnalyticsSettingsSchema = z.object({
  /** Instance default. An agent may override it live in the panel. */
  defaultRefreshSeconds: z
    .unknown()
    .transform((value) => toAnalyticsRefresh(value, 0))
    .default(0),
  topCreators: z.boolean().default(true),
  creatorTopics: z.boolean().default(true),
  resolvedPerAgent: z.boolean().default(true),
  resolutionTime: z.boolean().default(true),
  firstResponse: z.boolean().default(true),
  inflowVsResolved: z.boolean().default(true),
  peakHeatmap: z.boolean().default(true),
  distribution: z.boolean().default(true),
});
export type AnalyticsSettings = z.infer<typeof AnalyticsSettingsSchema>;

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings =
  AnalyticsSettingsSchema.parse({});

/* ──────────────────────────────────────────────────────────────────────────
   Audit trail.

   What happened to a ticket, in a table nothing ever updates. The actions are a
   closed set: an open string would let two call sites spell the same event
   differently and the history would stop being groupable.
   ────────────────────────────────────────────────────────────────────────── */

export const AuditAction = z.enum([
  "status_changed",
  "priority_changed",
  "assigned",
  "unassigned",
  "comment_added",
  "comment_edited",
  "comment_retracted",
  "comment_deleted",
  "comment_restored",
  "ticket_deleted",
  "ticket_withdrawn",
  "ticket_restored",
  "attachment_deleted",
  "link_added",
  "link_removed",
  "checklist_set",
  "cc_changed",
  "category_changed",
  "auto_close_changed",
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  status_changed: "Status geändert",
  priority_changed: "Priorität geändert",
  assigned: "Zugewiesen",
  unassigned: "Zuweisung entfernt",
  comment_added: "Beitrag hinzugefügt",
  comment_edited: "Beitrag bearbeitet",
  comment_retracted: "Beitrag zurückgezogen",
  comment_deleted: "Beitrag gelöscht",
  comment_restored: "Beitrag wiederhergestellt",
  ticket_deleted: "Ticket gelöscht",
  ticket_withdrawn: "Ticket zurückgezogen",
  ticket_restored: "Ticket wiederhergestellt",
  attachment_deleted: "Anhang gelöscht",
  link_added: "Verknüpfung gesetzt",
  link_removed: "Verknüpfung entfernt",
  checklist_set: "Checkliste beantwortet",
  cc_changed: "Beteiligte geändert",
  category_changed: "Kategorie geändert",
  auto_close_changed: "Automatisches Schließen geändert",
};

/**
 * Clean a CC list: trimmed, lower case, plausible addresses, no duplicates.
 *
 * Pure, so the browser and the server can apply the same rule and the mask
 * cannot show a list the server would then store differently. The check is
 * deliberately shallow — one `@`, something either side, no whitespace. A full
 * RFC 5322 validator rejects addresses that real mail servers accept, and the
 * consequence of letting a bad one through is a bounce, not a security hole.
 */
export const CC_LIMIT = 20;

export function normalizeCcEmails(values: string[]): string[] {
  const seen = new Set<string>();

  for (const raw of values) {
    const value = raw.trim().toLowerCase();
    if (!value || /\s/.test(value)) continue;
    const at = value.lastIndexOf("@");
    if (at <= 0 || at === value.length - 1) continue;
    if (value.length > 320) continue;
    seen.add(value);
    if (seen.size >= CC_LIMIT) break;
  }

  return [...seen];
}

export const AuditEntrySchema = z.object({
  id: z.string(),
  ticket_id: z.string(),
  actor_id: z.string(),
  actor_email: z.string(),
  /**
   * Parsed leniently: an entry written by a future version carries an action this
   * build does not know, and a strict enum would make the whole history unreadable
   * rather than showing one unfamiliar line. A log that refuses to render is worse
   * than a log with a row you cannot label.
   */
  action: z.string(),
  field: z.string().default(""),
  old_value: z.string().default(""),
  new_value: z.string().default(""),
  created_at: z.coerce.date(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** The label for a stored action, or the raw value when it is unknown. */
export const auditLabel = (action: string): string =>
  AUDIT_ACTION_LABELS[action as AuditAction] ?? action;

/* ──────────────────────────────────────────────────────────────────────────
   Mail ingest.

   Only the Defender rule's settings so far. The transport — IMAP, or a Graph app
   registration — is not here yet, on purpose: which one MITS speaks is undecided, and
   half a form for each would be two masks that configure nothing.
   ────────────────────────────────────────────────────────────────────────── */

/** Sentinel the on-call picker posts for "nobody nominated". */
export const NO_ON_CALL = "__none";

/**
 * How MITS reaches the support mailbox.
 *
 * `none` is not "unconfigured" — it is an explicit "do not fetch", and it is the
 * default so an instance never starts talking to a mail server nobody set up.
 */
export const MailTransport = z.enum(["none", "imap", "graph"]);
export type MailTransport = z.infer<typeof MailTransport>;

export const MAIL_TRANSPORT_LABELS: Record<MailTransport, string> = {
  none: "Kein Abruf",
  imap: "IMAP",
  graph: "Microsoft Graph",
};

/** Ceiling per run. A mailbox with a two-year backlog must not be one request. */
export const MAIL_FETCH_LIMIT = 25;

export const MailSettingsSchema = z.object({
  /** Address alerts and tickets arrive at. */
  supportAddress: z.string().max(320).default(""),
  /** Off makes a recognised alert an ordinary mail ticket. */
  defenderRuleEnabled: z.boolean().default(true),
  /** Account the incident is assigned to. Empty leaves it in the pool inbox. */
  onCallUserId: z.string().max(64).default(""),
  /** Where the immediate notification goes. Empty attempts no mail. */
  onCallEmail: z.string().max(320).default(""),

  /* ── Inbound transport ──────────────────────────────────────────────── */

  transport: MailTransport.default("none"),

  /**
   * The account inbound mail is filed under when the sender has none.
   *
   * Required for ingest, and deliberately so: `created_by` decides who may see a
   * ticket, and a mail from an address nobody recognises still has to belong to
   * *something*. It is filed under this account with the real sender kept in
   * `created_by_email`, so agents see it, replies route back to the human, and no
   * account is ever created by an unauthenticated message.
   */
  fallbackUserId: z.string().max(64).default(""),

  imapHost: z.string().max(255).default(""),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  /** Implicit TLS on 993. Off attempts STARTTLS. */
  imapSecure: z.boolean().default(true),
  imapUser: z.string().max(255).default(""),
  /** Empty on save means "keep the stored one" — never "clear it". */
  imapPassword: z.string().max(512).default(""),
  imapMailbox: z.string().max(255).default("INBOX"),

  /** Directory (tenant) id of the app registration. */
  graphTenantId: z.string().max(120).default(""),
  graphClientId: z.string().max(120).default(""),
  graphClientSecret: z.string().max(512).default(""),
  /**
   * The mailbox to read, as an address or an object id.
   *
   * Graph's client-credentials flow is application-wide: the app registration can
   * reach every mailbox in the tenant unless an Application Access Policy narrows
   * it. This field says which one MITS *uses*; restricting what it *could* use is
   * an Exchange-side policy and is called out in the admin mask.
   */
  graphMailbox: z.string().max(320).default(""),
});
export type MailSettings = z.infer<typeof MailSettingsSchema>;

export const DEFAULT_MAIL_SETTINGS: MailSettings = MailSettingsSchema.parse({});

/** Sentinel the admin form posts to mean "keep the stored secret". */
export const KEEP_MAIL_SECRET = "__keep__";

/** Enough to attempt a fetch. Checked before every run so a half-filled mask stays inert. */
export function isMailInboundConfigured(settings: MailSettings): boolean {
  if (settings.fallbackUserId.trim() === "") return false;

  if (settings.transport === "imap") {
    return (
      settings.imapHost.trim() !== "" &&
      settings.imapUser.trim() !== "" &&
      settings.imapPassword !== ""
    );
  }
  if (settings.transport === "graph") {
    return (
      settings.graphTenantId.trim() !== "" &&
      settings.graphClientId.trim() !== "" &&
      settings.graphClientSecret !== "" &&
      settings.graphMailbox.trim() !== ""
    );
  }
  return false;
}

/* ──────────────────────────────────────────────────────────────────────────
   Customer profile.

   Contact details a reporter maintains themselves, so the agent working their
   ticket does not have to ask where they sit.

   Declared as a list rather than written into the form as JSX, for the same reason a
   ticket type is a schema and not a component: the admin-side field configurator is
   meant to switch these on and off and mark them required, and that is an override of
   this list rather than a rewrite of the mask.

   The account's name and address are *not* here — those live on the `user` row and
   are the login identity. This is everything else.
   ────────────────────────────────────────────────────────────────────────── */

export const CUSTOMER_PROFILE_FIELDS = [
  { key: "phone", label: "Telefon", widget: "tel", autoComplete: "tel", max: 40 },
  { key: "street", label: "Straße und Hausnummer", widget: "text", autoComplete: "street-address", max: 160 },
  { key: "postal_code", label: "PLZ", widget: "text", autoComplete: "postal-code", max: 16 },
  { key: "city", label: "Stadt", widget: "text", autoComplete: "address-level2", max: 120 },
  { key: "country", label: "Land", widget: "text", autoComplete: "country-name", max: 80 },
  { key: "website", label: "Website", widget: "url", autoComplete: "url", max: 300 },
  { key: "note", label: "Hinweis für den Agenten", widget: "textarea", max: 500 },
] as const;

export type CustomerProfileField = (typeof CUSTOMER_PROFILE_FIELDS)[number];
export type CustomerProfileKey = CustomerProfileField["key"];

/**
 * One reporter's profile.
 *
 * Every field optional and defaulted to the empty string: a profile row may be
 * written the first time someone fills in a single field, and the rest has to parse
 * rather than fail. `location_id` is kept separate from the free-text fields because
 * it references `mits_location` and is offered as a picker.
 */
export const MITSUserProfileSchema = z.object({
  location_id: z.string().nullable().default(null),
  /**
   * The company this reporter belongs to.
   *
   * Read here so one type covers the whole profile row, but **not** writable through
   * `setUserProfile` — a reporter who could set their own organization could put
   * themselves in somebody else's, and the CMDB filters by exactly this field. Only
   * the admin action and the importer assign it.
   */
  organization_id: z.string().nullable().default(null),
  /**
   * Whether this reporter may see every ticket of their company.
   *
   * Coerced, because SQLite has no boolean and the column is 0/1. Not writable
   * through `setUserProfile` for the same reason `organization_id` is not: it
   * widens what somebody can read, and a field that widens access is never
   * taken from the form of the person it would widen it for.
   */
  is_org_admin: z.coerce.boolean().default(false),
  phone: z.string().max(40).default(""),
  street: z.string().max(160).default(""),
  postal_code: z.string().max(16).default(""),
  city: z.string().max(120).default(""),
  country: z.string().max(80).default(""),
  website: z.string().max(300).default(""),
  note: z.string().max(500).default(""),
});
export type MITSUserProfile = z.infer<typeof MITSUserProfileSchema>;

/**
 * Sentinel the location picker posts for "not specified".
 *
 * Radix Select has no legal empty value, and an empty string in the column would be a
 * location id that matches nothing rather than the absence of one.
 */
export const NO_LOCATION = "__none";

export const EMPTY_USER_PROFILE: MITSUserProfile = MITSUserProfileSchema.parse({});

/**
 * Whether this is a website address we are willing to store and render as a link.
 *
 * Stricter than `isSafeResourceHref`, which also accepts a site-relative path — that
 * is right for an admin-authored portal tile and wrong here: a reporter's "website"
 * pointing at `/admin` would put a link to our own pages in a field a agent
 * clicks. A host is required, and only http and https.
 */
export function isWebsiteUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

/** `example.de` → `https://example.de`, so a reporter need not type the scheme. */
export function normaliseWebsite(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return `https://${raw}`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Locations (branches / sites).
   ────────────────────────────────────────────────────────────────────────── */

export const MITSLocationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  /** Short code for lists and the heatmap, e.g. "HH" or "B1". */
  code: z.string().max(16).default(""),
  city: z.string().max(120).default(""),
  active: z.boolean().default(true),
});
export type MITSLocation = z.infer<typeof MITSLocationSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   Organizations.

   The company a reporter belongs to and an asset is owned by. Separate from
   `mits_location`, which is a *site*: one organization has several branches, and one
   branch of a shared building can host several organizations. Conflating them was the
   tempting shortcut and would have made "all assets of customer X" unanswerable.

   Referenced by id from `mits_user_profile` and `mits_configuration_item`, with no
   foreign key — same rule as everywhere else here. Deleting a customer must not delete
   their tickets, and a row pointing at a gone organization has to still open.
   ────────────────────────────────────────────────────────────────────────── */

export const MITSOrganizationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(160),
  /** Short code for dense lists and badges, e.g. "WG". */
  code: z.string().max(16).default(""),
  /**
   * Mail domain, without the `@`. Used to *suggest* an organization for a reporter,
   * never to grant anything — see `organizationIdForEmail`.
   */
  domain: z.string().max(190).default(""),
  customer_number: z.string().max(64).default(""),
  street: z.string().max(160).default(""),
  postal_code: z.string().max(16).default(""),
  city: z.string().max(120).default(""),
  country: z.string().max(80).default(""),
  phone: z.string().max(40).default(""),
  website: z.string().max(300).default(""),
  note: z.string().max(1000).default(""),
  /** Inactive rows stay referenceable but drop out of the pickers. */
  active: z.boolean().default(true),
});
export type MITSOrganization = z.infer<typeof MITSOrganizationSchema>;

/** Sentinel the organization picker posts for "not assigned". */
export const NO_ORGANIZATION = "__none";

/**
 * Which organization a mail address belongs to, by domain.
 *
 * Compared on the part after the **last** `@` and exactly, the same rule the
 * registration whitelist uses: `firma.de` must match neither `nichtfirma.de` nor
 * `x@firma.de@fremd.de`.
 *
 * A suggestion only. Assignment is written by a human or by the importer; deriving it
 * live would mean a customer changing their mail provider silently loses their assets.
 */
export function organizationIdForEmail(
  email: string,
  organizations: Pick<MITSOrganization, "id" | "domain" | "active">[],
): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return null;

  const hit = organizations.find(
    (organization) =>
      organization.active &&
      organization.domain.trim().toLowerCase().replace(/^@/, "") === domain,
  );
  return hit?.id ?? null;
}

/* ──────────────────────────────────────────────────────────────────────────
   CMDB — configuration items.

   One table for every kind of asset, not one per kind. What differs between a laptop
   and a license is which *attributes* matter, and that is `attributes` — a flat
   string map, so a new asset kind is a data entry rather than a migration. Same
   argument as schema-first ticket types: no `Laptop.tsx`, no `mits_laptop`.

   The columns that *are* fixed earned it by being queried or sorted on: type, status,
   owner, site, serial. An attribute nobody filters by does not need a column.
   ────────────────────────────────────────────────────────────────────────── */

export const CIType = z.enum([
  "hardware",
  "software",
  "license",
  "network",
  "mobile",
  "service",
  "other",
]);
export type CIType = z.infer<typeof CIType>;

export const CI_TYPE_LABELS: Record<CIType, string> = {
  hardware: "Hardware",
  software: "Software",
  license: "Lizenz",
  network: "Netzwerk",
  mobile: "Mobilgerät",
  service: "Dienst",
  other: "Sonstiges",
};

/**
 * Lifecycle of a thing rather than of a ticket.
 *
 * `stock` is deliberately not `active`: a laptop in the cupboard is a spare somebody
 * can hand out, and counting it as in-service overstates both the fleet and the
 * license demand.
 */
export const CIStatus = z.enum(["active", "stock", "repair", "retired"]);
export type CIStatus = z.infer<typeof CIStatus>;

export const CI_STATUS_LABELS: Record<CIStatus, string> = {
  active: "Im Einsatz",
  stock: "Lager",
  repair: "In Reparatur",
  retired: "Ausgemustert",
};

/** In service, so it can break and it consumes a seat. */
export const LIVE_CI_STATUSES: CIStatus[] = ["active", "repair"];

export const MITSConfigurationItemSchema = z.object({
  id: z.string(),
  /**
   * The number MITS gives the object: `INV-10000001`, sequential, never reused.
   *
   * Allocated on insert by `saveConfigurationItem` and never taken from the input —
   * same rule as `ticket_number` and as `created_by`. `0` is what a row reports
   * before the migration has assigned it; nothing displays that value, the
   * backfill runs at startup.
   */
  inventory_number: z.number().int().min(0).default(0),
  /**
   * Somebody else's number: a vendor sticker, a label from an older system.
   *
   * Optional and free text, and still unique where it is filled in. Not the same
   * thing as `inventory_number` — that one MITS owns, this one is a reference to a
   * number written down outside MITS, which is why an import can map a column onto
   * it.
   */
  asset_tag: z.string().max(64).default(""),
  name: z.string().min(1).max(200),
  type: CIType,
  status: CIStatus.default("active"),
  organization_id: z.string().nullable().default(null),
  location_id: z.string().nullable().default(null),
  /** User the asset is handed to. Drives the suggestions in a ticket sidebar. */
  assigned_user_id: z.string().nullable().default(null),
  manufacturer: z.string().max(120).default(""),
  model: z.string().max(160).default(""),
  serial_number: z.string().max(120).default(""),
  /** Dates as plain `YYYY-MM-DD` strings: nobody knows the hour a warranty ends. */
  purchased_on: z.string().max(10).default(""),
  warranty_until: z.string().max(10).default(""),
  /** Licenses only. Zero means "not seat-counted", not "no seats". */
  seats_total: z.number().int().min(0).max(1_000_000).default(0),
  expires_at: z.string().max(10).default(""),
  note: z.string().max(4000).default(""),
  /** Everything this instance cares about and MITS has no column for. */
  attributes: z.record(z.string(), z.string()).default({}),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type MITSConfigurationItem = z.infer<typeof MITSConfigurationItemSchema>;

/** How many attributes one item may carry, and how long a key and a value may be. */
export const CI_ATTRIBUTE_LIMIT = 40;
export const CI_ATTRIBUTE_KEY_MAX = 60;
export const CI_ATTRIBUTE_VALUE_MAX = 500;

/**
 * Clean an attribute map coming from a form, an import or the API.
 *
 * Unbounded because it is unschema'd: without a cap, one CSV column of pasted log
 * output becomes a row nothing can render. Keys are trimmed and collapsed, blank keys
 * and blank values dropped — an attribute with no value is noise in a detail view, and
 * the absence of a key is not a fact about the asset.
 *
 * Pure and here rather than in the store so the offline suite can check it: a silently
 * truncated import is the failure mode nobody notices.
 */
export function normaliseCIAttributes(
  input: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!input || typeof input !== "object") return {};

  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (Object.keys(out).length >= CI_ATTRIBUTE_LIMIT) break;

    const key = rawKey.trim().replace(/\s+/g, " ").slice(0, CI_ATTRIBUTE_KEY_MAX);
    if (!key) continue;

    const value =
      rawValue === null || rawValue === undefined
        ? ""
        : String(rawValue).trim().slice(0, CI_ATTRIBUTE_VALUE_MAX);
    if (!value) continue;

    out[key] = value;
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   CMDB — relations.

   Directional, one row per stated relation, the inverse derived on read. Exactly the
   `mits_ticket_link` pattern, for the same reason: two rows would be two places
   holding one fact, and they drift.
   ────────────────────────────────────────────────────────────────────────── */

export const CIRelationKind = z.enum([
  "depends_on",
  "part_of",
  "connected_to",
  "installed_on",
  "licensed_for",
]);
export type CIRelationKind = z.infer<typeof CIRelationKind>;

export const CI_RELATION_LABELS: Record<CIRelationKind, string> = {
  depends_on: "hängt ab von",
  part_of: "gehört zu",
  connected_to: "verbunden mit",
  installed_on: "installiert auf",
  licensed_for: "lizenziert für",
};

/** Read from the other end. `connected_to` is symmetric and reads the same. */
export const CI_RELATION_INVERSE_LABELS: Record<CIRelationKind, string> = {
  depends_on: "Voraussetzung für",
  part_of: "besteht aus",
  connected_to: "verbunden mit",
  installed_on: "trägt",
  licensed_for: "lizenziert durch",
};

export const MITSCIRelationSchema = z.object({
  id: z.string(),
  from_ci: z.string(),
  to_ci: z.string(),
  kind: CIRelationKind,
  created_by: z.string(),
  created_at: z.coerce.date(),
});
export type MITSCIRelation = z.infer<typeof MITSCIRelationSchema>;

/**
 * The relation kind that consumes a seat.
 *
 * Named rather than inlined because the licence manager's arithmetic depends on it: a
 * seat is used *because* something is licensed, so the count is derived from these rows
 * and never stored. A stored `seats_used` would be a second truth that drifts the first
 * time somebody deletes an asset.
 */
export const SEAT_RELATION: CIRelationKind = "licensed_for";

/* ──────────────────────────────────────────────────────────────────────────
   CMDB — licence arithmetic.

   Pure, so the offline suite covers the boundaries. Off-by-one here is a compliance
   statement that is wrong in the direction nobody checks.
   ────────────────────────────────────────────────────────────────────────── */

export interface SeatUsage {
  total: number;
  used: number;
  free: number;
  /** 0…1, clamped — the progress bar cannot be more than full. */
  ratio: number;
  /** More assignments than seats. The one state that needs saying out loud. */
  overbooked: boolean;
  /** No seat count kept for this licence, so the bar means nothing. */
  untracked: boolean;
}

export function seatUsage(total: number, used: number): SeatUsage {
  const seats = Math.max(0, Math.trunc(total));
  const taken = Math.max(0, Math.trunc(used));

  return {
    total: seats,
    used: taken,
    free: Math.max(0, seats - taken),
    ratio: seats === 0 ? 0 : Math.min(1, taken / seats),
    overbooked: seats > 0 && taken > seats,
    untracked: seats === 0,
  };
}

/** Days a licence may have left before it is called out. */
export const LICENCE_EXPIRY_WARN_DAYS = 60;

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/**
 * How urgent an expiry date is, compared on the **date** rather than the instant.
 *
 * A licence that runs out today is not expired yet — it stops working tomorrow. Day
 * granularity is also all the data has: the column is `YYYY-MM-DD`.
 */
export function expiryState(value: string, now: Date): ExpiryState {
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "none";

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const due = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return "none";

  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "expired";
  return days <= LICENCE_EXPIRY_WARN_DAYS ? "soon" : "ok";
}

/* ──────────────────────────────────────────────────────────────────────────
   Agent presence.
   ────────────────────────────────────────────────────────────────────────── */

export const PresenceState = z.enum(["active", "idle", "offline"]);
export type PresenceState = z.infer<typeof PresenceState>;

export const PRESENCE_LABELS: Record<PresenceState, string> = {
  active: "Aktiv",
  idle: "Inaktiv",
  offline: "Offline",
};

/** Seconds of silence before an active agent is shown as idle. */
export const PRESENCE_IDLE_AFTER_SECONDS = 5 * 60;
/** …and before they count as gone. */
export const PRESENCE_OFFLINE_AFTER_SECONDS = 30 * 60;

/**
 * Derive presence from a single timestamp.
 *
 * Deriving beats storing a state: a stored one would need a background job to
 * move somebody from active to idle, while silence does that work by itself.
 *
 * Here rather than in `lib/presence.ts` so the thresholds are testable — an
 * off-by-one at a boundary mislabels a colleague without anything looking wrong.
 * A null timestamp is offline, not unknown: someone who has never been seen
 * cannot take a ticket either way.
 */
export function presenceStateFor(
  seenAt: Date | null,
  now: number,
): PresenceState {
  if (!seenAt) return "offline";

  const secondsAgo = (now - seenAt.getTime()) / 1000;
  // A clock skew that puts the last sighting in the future counts as just-seen
  // rather than wrapping around to offline.
  if (secondsAgo <= PRESENCE_IDLE_AFTER_SECONDS) return "active";
  if (secondsAgo <= PRESENCE_OFFLINE_AFTER_SECONDS) return "idle";
  return "offline";
}

/* ──────────────────────────────────────────────────────────────────────────
   Was hochgeladen werden darf.

   Steht hier und nicht in `lib/storage.ts`, obwohl dort geprüft wird: die Prüfung
   ist Server-Sache, aber das `accept` des Dateiwählers ist Client-Sache, und ein
   Wähler, der weniger anbietet als der Server annimmt, ist ein Knopf, mit dem sich
   eine erlaubte Datei nicht auswählen lässt. Genau das war der Fall — der
   Erstellungs-Chat bot `image/*,.pdf,.log,.txt` an, während der Server auch `.csv`,
   `.zip`, `.eml`, `.msg`, `.docx` und `.xlsx` nimmt. Eine Liste, beide Seiten.

   Eine Allow-List und keine Deny-List: die interessanten Anhänge an einem
   IT-Ticket sind Screenshots, Logs und PDFs, und ausgeliefert wird ohnehin alles
   als Download.
   ────────────────────────────────────────────────────────────────────────── */

/** Endung → Typ, unter dem die Datei ausgeliefert wird. */
export const ALLOWED_UPLOAD_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".eml": "message/rfc822",
  ".msg": "application/vnd.ms-outlook",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Der `accept`-Wert für jeden Dateiwähler, der in diese Ablage schreibt.
 *
 * Endungen und keine MIME-Typen: `image/*` würde ein .heic vom iPhone anbieten,
 * das der Server ablehnt — die Liste oben ist auf Endungen definiert, also ist die
 * Auswahl es auch. Ein Wähler kann damit nichts anbieten, was hinterher scheitert.
 */
export const UPLOAD_ACCEPT = Object.keys(ALLOWED_UPLOAD_EXTENSIONS).join(",");

/* ──────────────────────────────────────────────────────────────────────────
   Feature toggles.

   Every optional module is gated here so an instance can be reduced to the parts
   it actually uses. Defaults match the specification: the three unfinished or
   noisy ones start off.
   ────────────────────────────────────────────────────────────────────────── */

export const FeatureFlagsSchema = z.object({
  feature_ticket_search: z.boolean().default(true),
  feature_agent_dashboard: z.boolean().default(true),
  feature_presence_sidebar: z.boolean().default(true),
  feature_email_notifications: z.boolean().default(true),
  feature_advanced_form_builder: z.boolean().default(true),
  feature_ticket_linking: z.boolean().default(true),
  feature_canned_responses: z.boolean().default(true),
  feature_cmdb: z.boolean().default(true),
  feature_time_tracking: z.boolean().default(true),
  feature_macros: z.boolean().default(true),
  feature_toast_notifications: z.boolean().default(true),
  feature_message_editing: z.boolean().default(true),
  feature_message_retract: z.boolean().default(true),
  feature_mail_inbound: z.boolean().default(false),
  feature_s3_storage: z.boolean().default(false),
  feature_typing_indicator: z.boolean().default(false),
  feature_stats_heatmap: z.boolean().default(true),
  feature_sla_countdown: z.boolean().default(false),
  feature_auto_merge_suggestions: z.boolean().default(false),
  feature_ticket_reminders: z.boolean().default(true),
  feature_ticket_categories: z.boolean().default(true),
  /**
   * On, for the same reason as the two above and unlike the one below.
   *
   * A pin is inert until somebody sets one: no pins means no block above the
   * queue and no column in the table. Nothing about it writes to an incoming
   * ticket, and nothing about it is visible to a reporter.
   */
  feature_ticket_pins: z.boolean().default(true),
  /**
   * Off by default, unlike the two above.
   *
   * The other two are inert until somebody uses them — an instance with no
   * categories shows no filter, an instance with no reminders shows an empty
   * widget. This one *writes* to incoming tickets, so it must be a decision
   * somebody made rather than something that started happening after an update.
   */
  feature_smart_routing: z.boolean().default(false),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type FeatureFlagKey = keyof FeatureFlags;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = FeatureFlagsSchema.parse({});

/* ──────────────────────────────────────────────────────────────────────────
   Notification channels.

   Modelled on the notification settings a phone has, because that is the mental
   model people already carry: a small number of named channels, each with its
   own switch and its own urgency, plus a few properties of the presentation
   itself. It is not a free-form editor — the channels are the things MITS can
   tell somebody about, and inventing another one means writing the query that
   finds it. `reminder` is the fourth, and its query is `dueReminders`.

   **`feature_toast_notifications` stays the master switch.** These settings shape
   what is shown, they do not decide *whether*. Two places that can silence
   notifications is one place too many to look when they are missing.
   ────────────────────────────────────────────────────────────────────────── */

export const NOTIFICATION_CHANNELS = [
  "reply",
  "ticket",
  "assigned",
  "reminder",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_META: Record<
  NotificationChannel,
  { label: string; description: string; staffOnly: boolean }
> = {
  reply: {
    label: "Neue Antwort",
    description:
      "Jemand hat auf ein Ticket geantwortet, das du sehen darfst. Die eigene Antwort löst nie eine Meldung aus.",
    staffOnly: false,
  },
  ticket: {
    label: "Neues Ticket im Pool",
    description:
      "Ein Ticket ist eingegangen, das noch niemandem zugewiesen ist. Nur für Agenten.",
    staffOnly: true,
  },
  assigned: {
    label: "Dir zugewiesen",
    description:
      "Jemand anderes hat dir ein Ticket übergeben. Nur für Agenten.",
    staffOnly: true,
  },
  reminder: {
    /*
     * Staff-only, wie die zwei darüber — und das war einmal anders.
     *
     * Die alte Begründung: ein Melder, der „nachfragen, wenn bis Freitag nichts
     * passiert ist" auf sein eigenes Ticket legt, fragt nicht am Dienstag an. Die
     * Entscheidung ist umgekehrt worden. Eine Erinnerung ist ein Arbeitsmittel des
     * Desks; der Melder bekommt sein Ticket nachgehalten, statt es selbst
     * nachhalten zu müssen.
     *
     * Bestehende Melder-Erinnerungen bleiben in der Tabelle stehen und feuern
     * hier nicht mehr. Sie zu löschen wäre ein `DELETE` über fremde Notizen, und
     * das tut ein Umbau nicht nebenbei.
     */
    label: "Erinnerung fällig",
    description:
      "Eine Erinnerung, die du selbst auf ein Ticket gelegt hast, ist fällig. Nur für Agenten.",
    staffOnly: true,
  },
};

/** Where the stack sits. The four corners, nothing in between. */
export const TOAST_POSITIONS = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
] as const;
export type ToastPosition = (typeof TOAST_POSITIONS)[number];

export const TOAST_POSITION_LABELS: Record<ToastPosition, string> = {
  "top-right": "Oben rechts",
  "top-left": "Oben links",
  "bottom-right": "Unten rechts",
  "bottom-left": "Unten links",
};

export const ToastTone = z.enum(["info", "success", "warning"]);
export type ToastTone = z.infer<typeof ToastTone>;

export const TOAST_TONE_LABELS: Record<ToastTone, string> = {
  info: "Neutral",
  success: "Positiv",
  warning: "Auffällig",
};

/**
 * Flat, not nested per channel.
 *
 * `z.object({...}).default({})` would be tidier to read and is exactly the shape
 * that bit this codebase twice already with `z.record` — see the two Zod-4 traps
 * documented for `PortalConfigSchema`. A flat record of defaulted primitives has
 * the property that matters here: parsing `{}` yields a complete, usable object,
 * so a row written by an older build or edited by hand degrades to the defaults
 * one field at a time instead of being discarded whole.
 */
export const NotificationSettingsSchema = z.object({
  position: z.enum(TOAST_POSITIONS).default("top-right"),
  /** How long a toast stays. Seconds, because that is what the admin types. */
  seconds: z.coerce.number().int().min(2).max(60).default(5),
  /** Cap on the visible stack. Beyond about four the lower ones are unreadable. */
  maxVisible: z.coerce.number().int().min(1).max(8).default(4),
  /** How often the browser asks. Lower means fresher and more requests. */
  pollSeconds: z.coerce.number().int().min(5).max(300).default(20),

  /**
   * From this many at once, one digest replaces the individual toasts.
   *
   * The point where a stack stops informing and starts burying: four toasts are
   * four things that happened, twelve are a wall somebody dismisses without
   * reading. `0` switches the digest off and lets the stack cap handle it.
   */
  digestThreshold: z.coerce.number().int().min(0).max(50).default(5),

  reply_enabled: z.boolean().default(true),
  reply_tone: ToastTone.default("info"),
  reply_sticky: z.boolean().default(false),

  ticket_enabled: z.boolean().default(true),
  ticket_tone: ToastTone.default("info"),
  ticket_sticky: z.boolean().default(false),

  reminder_enabled: z.boolean().default(true),
  reminder_tone: ToastTone.default("warning"),
  /*
   * Stays until dismissed, like an assignment and for a stronger reason: the
   * person asked to be told at this moment. A reminder that fired while they were
   * in a meeting and vanished after five seconds is the one notification whose
   * whole purpose was to survive not being watched.
   */
  reminder_sticky: z.boolean().default(true),

  assigned_enabled: z.boolean().default(true),
  assigned_tone: ToastTone.default("success"),
  /** On by default: a ticket handed to you is the one that must not scroll past. */
  assigned_sticky: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings =
  NotificationSettingsSchema.parse({});

/** The per-channel keys, so the form and the client read them the same way. */
export function channelConfig(
  settings: NotificationSettings,
  channel: NotificationChannel,
): { enabled: boolean; tone: ToastTone; sticky: boolean } {
  return {
    enabled: settings[`${channel}_enabled`],
    tone: settings[`${channel}_tone`],
    sticky: settings[`${channel}_sticky`],
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Where a filled-in form ends up on the ticket page.

   Every ticket carries a payload: the answers somebody gave to a schema. Those
   answers used to live in a labelled list beside the thread — the sidebar for an
   agent, a collapsed accordion for the reporter — while only the free-text field
   became a message. That splits one submission into two places, and the half that
   reads like a conversation is missing most of what was said.

   `chat` puts the answers in the opening bubble, under the reporter's own words.
   That is the default, because a ticket is a conversation and a form submission is
   the first thing said in it.

   `panel` is the old arrangement, kept because a schema with twenty fields — a
   hardware order, an onboarding — makes a bubble somebody has to scroll past on
   every visit. Which of the two is right depends on the forms an instance actually
   uses, which is why it is a setting and not a decision taken here.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * What has to be typed to confirm a wipe, letter for letter.
 *
 * Here rather than beside the action, and not because it fits the file: a
 * `"use server"` module may only export async functions, so a constant shared by
 * the dialog and the action cannot live there — and `lib/purge.ts` is `server-only`,
 * which puts it out of reach of the dialog. This module is the one both sides can
 * read.
 */
export const PURGE_CONFIRM_WORD = "löschen";

export const TICKET_FORM_DISPLAYS = ["chat", "panel", "both"] as const;
export type TicketFormDisplay = (typeof TICKET_FORM_DISPLAYS)[number];

/** Admin-facing copy, beside the values so a new mode cannot ship unlabelled. */
export const TICKET_FORM_DISPLAY_META: Record<
  TicketFormDisplay,
  { label: string; description: string }
> = {
  chat: {
    label: "Im Verlauf",
    description:
      "Die Antworten stehen in der ersten Nachricht, unter dem Text des Melders.",
  },
  panel: {
    label: "Daneben",
    description:
      "Die Antworten stehen als Liste in der Seitenspalte, beim Melder aufklappbar.",
  },
  both: {
    label: "Beides",
    description: "Die Antworten stehen in der Nachricht und in der Liste.",
  },
};

/* ──────────────────────────────────────────────────────────────────────────
   Die Melder-Ticketseite als drei Spalten.

   Links die eigenen Tickets, in der Mitte das Gespräch, rechts die Kennzahlen des
   Tickets. Beide Randspalten und jedes einzelne Feld rechts sind abschaltbar,
   weil sie verschiedene Instanzen verschieden viel kosten: ein Desk mit drei
   Tickets pro Person braucht links keine Liste, und ein Haus, das seine
   Zuständigkeiten nicht nach außen zeigt, will „Bearbeiter" nicht darin haben.

   **Das kehrt eine frühere Entscheidung um, und zwar bewusst.** Die Melderansicht
   war eine Spalte, „kein Bearbeiter, keine Priorität" — die Begründung war, dass
   alles neben der Frage „hat jemand geantwortet" Lärm ist. Das gilt weiterhin für
   die *Priorität*, die hier auch nicht auftaucht. Ein Name und ein Datum sind
   dagegen die zwei Dinge, nach denen jemand fragt, der anruft, statt zu warten.
   ────────────────────────────────────────────────────────────────────────── */

export const CUSTOMER_META_FIELDS = [
  "type",
  "age",
  "created",
  "status",
  "category",
  "assignee",
] as const;
export const CustomerMetaField = z.enum(CUSTOMER_META_FIELDS);
export type CustomerMetaField = (typeof CUSTOMER_META_FIELDS)[number];

export const CUSTOMER_META_FIELD_LABELS: Record<CustomerMetaField, string> = {
  type: "Typ",
  age: "Alter",
  created: "Erstellt",
  status: "Status",
  // „Kategorie", nicht „Queue". Ein Melder hat keine Queue, und das Wort lädt zum
  // Raten am Organigramm ein — dieselbe Regel wie bei den Intent-Kacheln.
  category: "Kategorie",
  assignee: "Bearbeiter",
};

const allCustomerMetaEnabled = (): Record<CustomerMetaField, boolean> =>
  Object.fromEntries(CUSTOMER_META_FIELDS.map((key) => [key, true])) as Record<
    CustomerMetaField,
    boolean
  >;

export const TicketDisplaySettingsSchema = z.object({
  formDisplay: z.enum(TICKET_FORM_DISPLAYS).default("chat"),
  /** Die linke Spalte: die eigenen Tickets des Melders. */
  customerTicketList: z.boolean().default(true),
  /** Die rechte Spalte als Ganzes. Aus heißt: kein Feld, keine Karte. */
  customerMetaPanel: z.boolean().default(true),
  /*
   * Welche Felder rechts stehen.
   *
   * `partialRecord` plus Transform, nicht `record`: Zod 4 verlangt bei einem
   * Enum-Schlüssel jeden Schlüssel und lehnt ein Objekt ab, dem einer fehlt — und
   * ein abgelehnter Parse nähme hier `formDisplay` mit, also die Anordnung der
   * Formularantworten auf **beiden** Ticketseiten. Dieselbe Falle und dieselbe
   * Lösung wie bei `enabled_widgets`.
   *
   * Ein später ergänztes Feld ist damit per Default an, weil der Merge die Lücke
   * füllt. Das ist die richtige Richtung: ein neues Feld, das auf jeder
   * bestehenden Instanz still fehlt, ist ein Feld, das niemand findet.
   */
  customerMetaFields: z
    .partialRecord(CustomerMetaField, z.boolean())
    .default(allCustomerMetaEnabled)
    .transform((value) => ({ ...allCustomerMetaEnabled(), ...value })),
});
export type TicketDisplaySettings = z.infer<typeof TicketDisplaySettingsSchema>;

export const DEFAULT_TICKET_DISPLAY_SETTINGS: TicketDisplaySettings =
  TicketDisplaySettingsSchema.parse({});

/**
 * A stored or posted value, or the default.
 *
 * Falls back rather than throwing: this decides a layout, and a row written by an
 * older version — or a hand-edited one — must not take the ticket page down over
 * where a list of answers goes.
 */
export function toTicketFormDisplay(
  value: unknown,
  fallback: TicketFormDisplay = DEFAULT_TICKET_DISPLAY_SETTINGS.formDisplay,
): TicketFormDisplay {
  return TICKET_FORM_DISPLAYS.includes(value as TicketFormDisplay)
    ? (value as TicketFormDisplay)
    : fallback;
}

/**
 * Flags that are declared but gate nothing yet.
 *
 * Kept on request as roadmap placeholders. The mask marks them, because a switch
 * that silently does nothing is worse than a missing switch — an admin flips it,
 * waits for an effect, and concludes the app is broken.
 */
export const INERT_FEATURE_FLAGS: FeatureFlagKey[] = [
  "feature_typing_indicator",
  "feature_sla_countdown",
  "feature_auto_merge_suggestions",
];

/** Admin-facing copy. Kept beside the schema so a new flag cannot ship unlabelled. */
export const FEATURE_FLAG_META: Record<
  FeatureFlagKey,
  { label: string; description: string }
> = {
  feature_ticket_search: {
    label: "Ticket-Suche",
    description:
      "Suchleiste im Header und auf /tickets. Eingabe einer Nummer springt direkt ins Ticket.",
  },
  feature_agent_dashboard: {
    label: "Agenten-Dashboard",
    description:
      "Ticketeingang mit Übernehmen-Aktion und Übersicht der eigenen offenen Tickets.",
  },
  feature_presence_sidebar: {
    label: "Agenten-Präsenz",
    description:
      "Zeigt an, welche Agentinnen und Agenten gerade angemeldet sind.",
  },
  feature_email_notifications: {
    label: "E-Mail-Benachrichtigungen",
    description:
      "Versand bei Ticket-Eingang und bei öffentlichen Antworten. Braucht eine SMTP-Konfiguration.",
  },
  feature_advanced_form_builder: {
    label: "Erweiterter Formular-Builder",
    description:
      "Drag-and-drop-Canvas mit Eigenschaften-Inspektor, bedingter Sichtbarkeit und abhängigen Dropdowns.",
  },
  feature_ticket_linking: {
    label: "Ticket-Verknüpfung",
    description:
      "Tickets miteinander in Beziehung setzen: hängt ab von, Duplikat, über- und untergeordnet.",
  },
  feature_cmdb: {
    label: "CMDB",
    description:
      "Anlagen- und Lizenzverwaltung unter /mits/cmdb, Verknüpfung von Tickets mit betroffenen Geräten.",
  },
  feature_canned_responses: {
    label: "Textbausteine",
    description:
      "Vorformulierte Antworten, die im Antwortfeld eingesetzt werden. Gepflegt unter /admin/canned-responses.",
  },
  feature_time_tracking: {
    label: "Zeiterfassung",
    description:
      "Agenten erfassen Arbeitszeit am Ticket, per Timer oder von Hand. Die Summe steht am Ticket und in der Queue.",
  },
  feature_macros: {
    label: "Makros",
    description:
      "Ein Klick setzt Status, Priorität und Zuweisung und fügt einen Textbaustein ein. Gepflegt unter /admin/macros.",
  },
  feature_message_editing: {
    label: "Nachrichten nachträglich bearbeiten",
    description:
      "Wer eine Nachricht geschrieben hat, kann ihren Text ändern. Die Änderung wird an der Nachricht vermerkt und in der Historie festgehalten.",
  },
  feature_message_retract: {
    label: "Nachricht zurückziehen",
    description:
      "15 Sekunden lang lässt sich die eigene letzte Nachricht wieder entfernen. Danach nicht mehr.",
  },
  feature_toast_notifications: {
    label: "Live-Benachrichtigungen",
    description:
      "Einblendung oben rechts bei neuer Antwort, neuem Ticket im Pool und eigener Zuweisung. Fragt regelmäßig nach.",
  },
  feature_mail_inbound: {
    label: "E-Mail-Abruf",
    description:
      "Holt Nachrichten aus dem Support-Postfach per IMAP oder Microsoft Graph und legt daraus Tickets und Antworten an. Braucht eine Konfiguration unter /admin/mail.",
  },
  feature_s3_storage: {
    label: "S3-Objektspeicher",
    description:
      "Legt neue Anhänge in einem S3-Bucket ab statt auf der Platte. Bereits abgelegte Dateien bleiben, wo sie sind.",
  },
  feature_typing_indicator: {
    label: "Schreibt-gerade-Anzeige",
    description:
      "Zeigt im Ticket an, wenn die Gegenseite tippt. Erzeugt dauerhaft Anfragen.",
  },
  feature_stats_heatmap: {
    label: "Statistik & Filial-Heatmap",
    description: "Eröffnet gegen geschlossen sowie Verteilung über die Standorte.",
  },
  feature_sla_countdown: {
    label: "SLA-Countdown",
    description:
      "Restzeit bis zur Reaktionsfrist am Ticket. Ohne gepflegte SLA-Zeiten wenig aussagekräftig.",
  },
  feature_ticket_reminders: {
    label: "Ticket-Erinnerungen",
    description:
      "Ein Ticket auf später legen: Knopf am Ticket, Einblendung bei Fälligkeit, Liste der anstehenden Erinnerungen im Portal.",
  },
  feature_ticket_pins: {
    label: "Tickets anheften",
    description:
      "Agenten heften Tickets an; die angehefteten stehen in einem eigenen Block über der Queue. Jede Person heftet für sich.",
  },
  feature_ticket_categories: {
    label: "Kategorien",
    description:
      "Haupt- und Unterkategorie am Ticket, kaskadierender Filter in der Queue. Gepflegt unter /admin/categories.",
  },
  feature_smart_routing: {
    label: "Smart-Routing",
    description:
      "Regeln ordnen eingehende Tickets anhand von Stichworten einer Kategorie zu und zeigen Anwendern beim Schreiben passende FAQ-Einträge und Prozesse. Gepflegt unter /admin/settings/routing.",
  },
  feature_auto_merge_suggestions: {
    label: "Zusammenführungs-Vorschläge",
    description:
      "Schlägt Tickets vor, die Duplikate sein könnten. Experimentell.",
  },
};

/* ──────────────────────────────────────────────────────────────────────────
   Sichtbarkeit je Rolle.

   Ein Feature-Flag schaltet ein Modul für die ganze Instanz ab. Das hier ist die
   andere Achse: das Modul bleibt an, und **eine Rolle** bekommt es nicht zu
   sehen. Zwei Dinge, die man sonst über einen Schalter erledigen möchte und
   dabei feststellt, dass es zwei Fragen sind — „gibt es die CMDB auf dieser
   Instanz" und „darf ein Melder sie sehen".

   Alles ist per Default sichtbar, und zwar als Abwesenheit eines Eintrags: die
   gespeicherte Form ist eine Liste des *Weggenommenen*. Ein neu angelegtes
   Formular ist damit für jede Rolle sichtbar, ohne dass irgendwo eine Zeile
   nachgezogen werden muss — die Gegenrichtung (Liste des Erlaubten) hätte jedes
   neue Formular still für alle unsichtbar gemacht.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Rollen, deren Sicht sich beschneiden lässt.
 *
 * `admin` steht bewusst nicht darin, und zwar nicht als Bequemlichkeit: die
 * Maske, in der man die Einschränkungen pflegt, liegt selbst unter `/admin`.
 * Eine Rolle, die sich den Weg zu ihrer eigenen Einstellung wegnehmen kann,
 * sperrt die Instanz aus — und der letzte Admin kann sich aus demselben Grund
 * schon heute nicht selbst herabstufen.
 *
 * Die Reihenfolge ist aufsteigend und wird als Rang gelesen (siehe
 * `areasForRole`), damit diese Datei ohne Import aus `lib/auth/roles` auskommt.
 */
export const RESTRICTABLE_ROLES = ["user", "agent"] as const;
export type RestrictableRole = (typeof RESTRICTABLE_ROLES)[number];

export function isRestrictableRole(value: unknown): value is RestrictableRole {
  return (
    typeof value === "string" &&
    (RESTRICTABLE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Navigierbare Flächen, die einer Rolle abgenommen werden können.
 *
 * Eine feste Liste und kein freier Pfad: jeder Eintrag hat auf der Serverseite
 * eine Stelle, die ihn durchsetzt. Ein Pfadmuster, das ein Admin eintippt, wäre
 * eine Regel ohne Gegenstück — sie würde den Link ausblenden und die Seite
 * offen lassen, also genau die Kosmetik, die dieses Projekt an Schaltern nicht
 * haben will.
 *
 * **Kein Eintrag für das Zuhause einer Rolle.** `/customer` für den Melder und
 * `/mits` für den Agenten sind das Ziel jeder Umleitung; sie wegnehmbar zu
 * machen hieße, eine Rolle in eine Schleife zu schicken.
 */
export const NAV_AREAS = [
  "customer_new",
  "customer_tickets",
  "intake_ai",
  "ticket_search",
  "mits_cmdb",
  "mits_analytics",
] as const;
export type NavArea = (typeof NAV_AREAS)[number];

export const NAV_AREA_META: Record<
  NavArea,
  {
    label: string;
    description: string;
    /**
     * Niedrigste Rolle, für die es die Fläche überhaupt gibt. Darunter ist
     * nichts wegzunehmen, und ein Schalter dafür wäre eine Behauptung, ein
     * Melder käme sonst in die CMDB.
     */
    role: RestrictableRole;
  }
> = {
  customer_new: {
    label: "Ticket erstellen",
    description:
      "Der Eingang unter /customer/new samt der Kacheln auf dem Portal. Abgeschaltet bleibt der Weg über E-Mail und Schnittstelle offen.",
    role: "user",
  },
  customer_tickets: {
    label: "Meine Tickets",
    description:
      "Die eigene Ticketliste unter /customer/tickets, inklusive des Eintrags im Benutzermenü.",
    role: "user",
  },
  intake_ai: {
    label: "KI-Assistent",
    description:
      "Der Chat-Reiter im Ticketeingang und die Portal-Kachel dorthin. Die beiden anderen Reiter hängen an den Formularen.",
    role: "user",
  },
  ticket_search: {
    label: "Ticket-Suche",
    description: "Das Suchfeld in der Kopfzeile und der Sprung per Nummer.",
    role: "user",
  },
  mits_cmdb: {
    label: "CMDB",
    description:
      "Bestand, Lizenzen und Objekt-Detailansicht unter /mits/cmdb.",
    role: "agent",
  },
  mits_analytics: {
    label: "Statistiken",
    description: "Die Auswertung unter /mits/analytics und ihre JSON-Ausgabe.",
    role: "agent",
  },
};

/** Die Flächen, die es für diese Rolle gibt — in der Reihenfolge von `NAV_AREAS`. */
export function areasForRole(role: RestrictableRole): NavArea[] {
  const rank = RESTRICTABLE_ROLES.indexOf(role);
  return NAV_AREAS.filter(
    (area) => RESTRICTABLE_ROLES.indexOf(NAV_AREA_META[area].role) <= rank,
  );
}

/**
 * Was einer Rolle fehlt.
 *
 * `hidden_areas` ist ein `z.array(z.string())` mit einem Filter in der
 * Transform und **kein** `z.array(Enum)`: Zod 4 lehnt ein unbekanntes Element
 * ab, statt es verwerfen zu lassen, und ein in einer späteren Version
 * entfernter Bereichsschlüssel nähme sonst die komplette Konfiguration mit —
 * inklusive der Formularregeln, um die es hier eigentlich geht. Dieselbe Falle
 * wie bei `widget_order` in `PortalConfigSchema`.
 *
 * Formular-Ids werden **nicht** gegen den Bestand geprüft. Ein Formular kann aus
 * dem Katalog verschwinden und später zurückkommen; die Regel dazu jetzt
 * wegzuwerfen hieße, es bei der Rückkehr still für alle sichtbar zu machen.
 */
const RoleRulesSchema = z.object({
  hidden_forms: z
    .array(z.string())
    .default([])
    .transform((ids) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))]),
  hidden_areas: z
    .array(z.string())
    .default([])
    .transform((keys) => [
      ...new Set(
        keys.filter((key): key is NavArea =>
          (NAV_AREAS as readonly string[]).includes(key),
        ),
      ),
    ]),
  /**
   * Die Priorität, mit der ein Ticket dieser Rolle startet.
   *
   * Die einzige Angabe hier, die **nicht** etwas wegnimmt — und deshalb die
   * einzige mit einem Wert statt einer Liste. Sie sitzt trotzdem in diesem Blob,
   * weil es eine Angabe *pro Rolle* ist und die Maske dafür schon existiert; ein
   * zweiter Setting-Key wäre eine zweite Maske für dieselbe Frage.
   *
   * Durch `toTicketPriority` geführt statt als `TicketPriority` deklariert,
   * dieselbe Begründung wie bei `hidden_areas` daneben: ein unbekannter Wert
   * würde den ganzen Parse ablehnen und damit die Formular- und Bereichsregeln
   * mitnehmen.
   */
  default_priority: z.unknown().optional().transform(toTicketPriority),
});
export type RoleRules = z.infer<typeof RoleRulesSchema>;

/** Die Sichtbarkeitsregeln allein — was eine Vorlage speichert. */
export type RoleVisibilityRules = Pick<
  RoleRules,
  "hidden_forms" | "hidden_areas"
>;

const EMPTY_ROLE_RULES = {
  hidden_forms: [],
  hidden_areas: [],
  default_priority: DEFAULT_TICKET_PRIORITY,
};

export const RoleVisibilitySchema = z.object({
  user: RoleRulesSchema.default(EMPTY_ROLE_RULES),
  agent: RoleRulesSchema.default(EMPTY_ROLE_RULES),
});
export type RoleVisibility = z.infer<typeof RoleVisibilitySchema>;

/** Nichts weggenommen — der Zustand einer Instanz, die die Maske nie geöffnet hat. */
export const DEFAULT_ROLE_VISIBILITY: RoleVisibility =
  RoleVisibilitySchema.parse({});

/**
 * Darf diese Rolle die Fläche sehen?
 *
 * Rein, damit die Regel offline prüfbar ist — der Serverteil (`lib/role-visibility.ts`)
 * liest nur die Zeile und reicht sie hier herein. Eine Rolle außerhalb von
 * `RESTRICTABLE_ROLES` ist `admin` oder etwas Unbekanntes; beides sieht alles,
 * weil `toRole` Unbekanntes vorher auf `user` gezogen hat.
 */
export function roleSeesArea(
  visibility: RoleVisibility,
  role: unknown,
  area: NavArea,
): boolean {
  if (!isRestrictableRole(role)) return true;
  return !visibility[role].hidden_areas.includes(area);
}

/** Dasselbe für ein Formular, geprüft über seine Schema-Id. */
export function roleSeesForm(
  visibility: RoleVisibility,
  role: unknown,
  formSchemaId: string,
): boolean {
  if (!isRestrictableRole(role)) return true;
  return !visibility[role].hidden_forms.includes(formSchemaId);
}

/**
 * Mit welcher Priorität ein Ticket dieser Rolle startet.
 *
 * Eine Rolle außerhalb von `RESTRICTABLE_ROLES` ist `admin` — die Maske führt sie
 * nicht, also gilt der eingebaute Default. Kein Verlust: ein Admin ist Technik und
 * setzt die Priorität im Entwurf, wenn er eine meint.
 */
export function priorityForRole(
  visibility: RoleVisibility,
  role: unknown,
): TicketPriority {
  if (!isRestrictableRole(role)) return DEFAULT_TICKET_PRIORITY;
  return visibility[role].default_priority;
}

/* ──────────────────────────────────────────────────────────────────────────
   Vorlagen.

   Eine benannte Zusammenstellung — „Personalabteilung sieht Eintritt und
   Freitext" — die sich auf eine Rolle anwenden lässt. Angelegt, umbenannt und
   gelöscht wie jede andere Liste in der Administration; die drei
   mitgelieferten sind Inhalt und kein Code, also auch löschbar.

   **Eine Vorlage ist keine Rolle.** Sie füllt die Schalter einer Rolle, und die
   gilt für jedes Konto darin. Wer „Personalabteilung" auf `user` anwendet, sagt:
   die Anwender dieser Instanz sind die Personalabteilung. Solange es keine
   Zuordnung pro Konto gibt, ist das die ganze Wahrheit über diese Funktion, und
   die Maske sagt es auch — eine Vorlage, die aussieht wie eine Rolle und keine
   ist, wäre sonst eine still falsch angewendete Einschränkung.

   **Angewendet wird im Browser, gespeichert wird getrennt.** Ein Klick auf
   „Anwenden" setzt die Schalter; gespeichert wird erst mit dem Knopf darunter.
   Sofort zu schreiben hieße, dass eine falsch getroffene Vorlage sofort für
   alle gilt.
   ────────────────────────────────────────────────────────────────────────── */

export const VisibilityPresetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  /** Für welche Rolle die Vorlage gedacht ist. Bestimmt, in welchem Reiter sie steht. */
  role: z.enum(RESTRICTABLE_ROLES),
  hidden_forms: z
    .array(z.string())
    .default([])
    .transform((ids) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))]),
  // Gefiltert statt abgelehnt, aus demselben Grund wie in `RoleRulesSchema`:
  // ein entfernter Bereichsschlüssel darf nicht die ganze Vorlagenliste
  // mitnehmen.
  hidden_areas: z
    .array(z.string())
    .default([])
    .transform((keys) => [
      ...new Set(
        keys.filter((key): key is NavArea =>
          (NAV_AREAS as readonly string[]).includes(key),
        ),
      ),
    ]),
});
export type VisibilityPreset = z.infer<typeof VisibilityPresetSchema>;

/**
 * Die Formular-Ids, auf die die mitgelieferten Vorlagen zeigen.
 *
 * Als Literale und nicht aus `lib/mock-schemas.ts` importiert: die Datei
 * importiert diese hier, und ein Zyklus zwischen Typmodell und Beispieldaten ist
 * teurer als zwei Zeichenketten. `npm test` prüft, dass es beide Formulare gibt
 * — eine Vorlage, die eine Id von gestern behält, blendet still alles aus.
 */
const QUICK_TICKET_ID = "quick-ticket";
const ONBOARDING_ID = "user-onboarding";

/**
 * Was eine frische Instanz mitbringt.
 *
 * Nicht geschrieben, sondern zurückgegeben, solange niemand die Liste angefasst
 * hat — dieselbe Mechanik wie bei den Modulen. Sobald eine davon gelöscht oder
 * eine eigene angelegt wird, steht die Liste in der Datenbank und diese
 * Vorgaben kommen nicht zurück. Genau das ist gemeint mit „löschbar".
 */
export const DEFAULT_VISIBILITY_PRESETS: VisibilityPreset[] = [
  VisibilityPresetSchema.parse({
    id: "anwender",
    name: "Anwender",
    role: "user",
    hidden_forms: [],
    hidden_areas: [],
  }),
  VisibilityPresetSchema.parse({
    id: "personalabteilung",
    name: "Personalabteilung",
    role: "user",
    // Eintritt und Freitext. Was hier steht, ist die Ausnahme — die Vorlage
    // wird beim Anwenden gegen den *aktuellen* Formularbestand aufgelöst, ein
    // später gebautes Bestellformular ist also ebenfalls weg.
    hidden_forms: [],
    hidden_areas: [],
  }),
  VisibilityPresetSchema.parse({
    id: "agent",
    name: "Agent",
    role: "agent",
    hidden_forms: [],
    hidden_areas: [],
  }),
];

/**
 * Vorlagen, die eine Positivliste sind statt einer Streichliste.
 *
 * „Die Personalabteilung sieht Eintritt und Freitext" muss sich auf ein
 * Formular beziehen, das es beim Anwenden noch gar nicht gab — sonst wäre die
 * Vorlage in dem Moment falsch, in dem jemand ein Bestellformular baut, und
 * zwar in die gefährliche Richtung: sichtbar. Deshalb hält
 * `PRESET_KEEP_FORMS` die Ids, die **bleiben**, und `presetRulesFor` rechnet
 * daraus beim Anwenden die Streichliste gegen den aktuellen Bestand aus.
 *
 * Nur für die mitgelieferten Vorlagen. Eine selbst angelegte speichert, was auf
 * den Schaltern stand — sie ist eine Momentaufnahme, und das ist die ehrliche
 * Bedeutung von „aus der aktuellen Auswahl gesichert".
 */
export const PRESET_KEEP_FORMS: Record<string, string[]> = {
  personalabteilung: [QUICK_TICKET_ID, ONBOARDING_ID],
};

/**
 * Die Regeln, die diese Vorlage auf den aktuellen Bestand ergibt.
 *
 * `formIds` ist der volle Formularbestand der Instanz, nicht der bereits
 * gefilterte — sonst würde zweimaliges Anwenden immer weiter wegnehmen.
 *
 * **Ohne `default_priority`**, und der Rückgabetyp sagt das. Eine Vorlage ist eine
 * Aussage über Sichtbarkeit; die Startpriorität ist eine Datenentscheidung, und
 * „Personalabteilung anwenden" darf sie nicht mitverstellen. Die Aufrufstelle
 * mischt deshalb, statt zu ersetzen.
 */
export function presetRulesFor(
  preset: VisibilityPreset,
  formIds: string[],
): RoleVisibilityRules {
  const keep = PRESET_KEEP_FORMS[preset.id];

  return {
    hidden_forms: keep
      ? formIds.filter((id) => !keep.includes(id))
      : preset.hidden_forms,
    hidden_areas: preset.hidden_areas,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   SMTP.

   The password lives in `mits_setting` like every other admin-managed value.
   That is a deliberate trade-off, documented in AGENTS.md: whoever can read the
   database can already read the sessions, and an env-only secret would make the
   settings mask unable to show whether anything is configured at all.
   ────────────────────────────────────────────────────────────────────────── */

export const SmtpSettingsSchema = z.object({
  host: z.string().max(255).default(""),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  user: z.string().max(255).default(""),
  /** Empty means "keep the stored one" when saving — never "clear it". */
  password: z.string().max(512).default(""),
  from: z.string().max(320).default(""),
  /** Implicit TLS (465). Otherwise STARTTLS is attempted on the given port. */
  secure: z.boolean().default(false),
  /**
   * Absolute base URL for the "open ticket" button in mails. Without it a link
   * would have to be built from a request, and a mail is sent outside one.
   */
  public_url: z.string().max(512).default(""),
});
export type SmtpSettings = z.infer<typeof SmtpSettingsSchema>;

export const DEFAULT_SMTP_SETTINGS: SmtpSettings = SmtpSettingsSchema.parse({});

/** Enough to attempt a send. Checked before every mail so a half-filled mask stays inert. */
export function isSmtpConfigured(settings: SmtpSettings): boolean {
  return settings.host.trim() !== "" && settings.from.trim() !== "";
}

/** Sentinel the admin form may post to mean "keep the stored password". */
export const KEEP_SMTP_PASSWORD = "__keep__";

/**
 * Decide which password a save should persist.
 *
 * A password input is never populated on render, so a blank field means "I did
 * not touch this" — treating it as "clear it" would wipe the credentials on every
 * unrelated save of the mask. Clearing stays possible by entering whitespace,
 * which trims to empty and is unambiguous.
 *
 * Extracted from `lib/smtp.ts` so it can be tested offline: silently emptying a
 * stored password has no visible failure mode until the next mail does not arrive.
 */
export function resolveSmtpPassword(submitted: string, stored: string): string {
  if (submitted === KEEP_SMTP_PASSWORD) return stored;
  if (submitted === "") return stored;
  return submitted.trim();
}

/* ──────────────────────────────────────────────────────────────────────────
   Dynamic form schemas.

   A ticket type is data, never a component — there is no Onboarding.tsx, only an
   onboarding *schema*. `schema` is standard JSON Schema so it stays portable
   (and can be handed to Ollama as the extraction target); `uiHints` carries the
   presentation-only bits JSON Schema has no opinion about.
   ────────────────────────────────────────────────────────────────────────── */

/** Which shadcn control renders a field. Inferred from the JSON Schema when omitted. */
export type MITSFieldWidget =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "date"
  | "datetime"
  | "select"
  | "radio"
  | "multiselect"
  | "checkbox"
  | "switch"
  | "file"
  /** Site picker, filled from `mits_location` at render time. */
  | "location"
  /** Colleague picker, filled from the user list at render time. */
  | "user";

/**
 * Show this field only while another one holds one of these values.
 *
 * **Not an access-control boundary.** A hidden field is dropped from the compiled
 * schema and its answer is stripped before submission, but nothing here stops a
 * hand-written request from carrying the property. `createTicket` re-derives
 * visibility from the payload it actually received and validates with
 * `strictObject` — that is where the boundary is.
 *
 * Values are compared as strings, so a condition on a checkbox reads
 * `equals: ["true"]`. An array-valued controller (multiselect) matches when any
 * of its entries is listed.
 */
export interface MITSFieldCondition {
  /** Property name of the controlling field. */
  field: string;
  /** Any one of these shows the field. Empty means the field never shows. */
  equals: string[];
}

/**
 * Narrow this field's choices by another field's answer — a cascading dropdown.
 *
 * The pairs live in the schema rather than being looked up at render time, so they
 * are known offline: the compiled zod enum can reject a child value that does not
 * belong to the chosen parent, on the server exactly as in the browser. The
 * child's own `enum` keeps the union of every value in the map, which is what
 * keeps `schema` valid JSON Schema and gives Ollama the full choice set.
 */
export interface MITSFieldCascade {
  /** Property name of the controlling field. */
  field: string;
  /** Parent value → the child values it permits. An absent key means no choices. */
  map: Record<string, string[]>;
}

export interface MITSFieldUIHint {
  widget?: MITSFieldWidget;
  placeholder?: string;
  /** Helper text under the control. */
  help?: string;
  /** Extra explanation behind an info icon next to the label. */
  tooltip?: string;
  /** `accept` attribute for file fields, e.g. "image/*,.pdf". */
  accept?: string;
  /**
   * Human labels for enum values, keyed by the raw value. Kept here rather than
   * in the JSON Schema so `schema` stays standard (no `enumNames` extension).
   */
  optionLabels?: Record<string, string>;
  /** Sort order within its step/group; falls back to JSON Schema property order. */
  order?: number;
  /** Fieldset label — groups related fields inside one step. */
  group?: string;
  /** 1-based wizard step. Everything without a step lands on step 1. */
  step?: number;
  /** Always hidden, regardless of any answer. Removed from the form entirely. */
  hidden?: boolean;
  /** Conditional visibility — see `MITSFieldCondition`. */
  visibleWhen?: MITSFieldCondition;
  /** Cascading choices — see `MITSFieldCascade`. */
  optionsFrom?: MITSFieldCascade;
}

export interface MITSFormSchema {
  /** Stable slug, e.g. "hardware-defect". Referenced by MITSTicket.form_schema_id. */
  id: string;
  title: string;
  description?: string;
  /** Top-level bucket the wizard groups by, e.g. "Hardware" or "Accounts". */
  category: string;
  /** Bumped on every breaking field change; old tickets keep their old version. */
  version: number;
  /** Lucide icon name, resolved at render time — never an imported component. */
  icon?: string;
  /** The field definitions. Draft-07 subset: object with typed properties. */
  schema: JSONSchema7;
  /** Presentation metadata, keyed by property name. */
  uiHints?: Record<string, MITSFieldUIHint>;
  /**
   * Steps the agent works through on a ticket of this type. See the block above
   * `ChecklistItemSchema`: it documents what was done, and it is not a form field.
   */
  checklist?: ChecklistItem[];
  submitLabel?: string;
  /**
   * Free-text description of when this form applies. Phase 3 puts this in the
   * routing prompt so the model can pick a schema from a plain-language request.
   */
  aiHint?: string;
}

/* ──────────────────────────────────────────────────────────────────────────
   The agent's checklist for a ticket type.

   Not part of the reporter's form and deliberately stored beside it: the schema
   describes what is *asked*, this describes what is *done*. An admin writes the
   steps once per ticket type — "Gerät geprüft", "Ersatzteil bestellt", "Rückgabe
   erhalten" — and every ticket of that type carries them for the agent to work
   through. It exists to make the work traceable afterwards, which is why each answer
   records who gave it and when, and why nothing here is ever locked: a step ticked
   by mistake has to be correctable, and a correction is itself part of the record
   (`checklist_set` in the audit trail).

   Two kinds, and that is the whole vocabulary:

   - `check` — one box. Done, or not yet.
   - `yesno` — Ja or Nein, because "Ersatzteil vorhanden?" has a *No* that means
     something. A checkbox cannot express that: an unticked box is indistinguishable
     from a step nobody has reached yet.

   The item id is what a stored answer points at, so it survives a renamed label —
   an admin fixing a typo must not orphan the answers already given on open tickets.
   ────────────────────────────────────────────────────────────────────────── */

export const CHECKLIST_ITEM_KINDS = ["check", "yesno"] as const;
export type ChecklistItemKind = (typeof CHECKLIST_ITEM_KINDS)[number];

export const CHECKLIST_ITEM_KIND_LABELS: Record<ChecklistItemKind, string> = {
  check: "Haken",
  yesno: "Ja / Nein",
};

export const ChecklistItemSchema = z.object({
  /** Stable across label edits — stored answers point at it. */
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Nur Buchstaben, Ziffern, - und _."),
  label: z.string().min(1).max(200),
  kind: z.enum(CHECKLIST_ITEM_KINDS).default("check"),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

/** How many steps one ticket type may carry. A list nobody reads is not a checklist. */
export const CHECKLIST_ITEM_LIMIT = 40;

/**
 * The stored answers, one string per kind plus the empty one.
 *
 * `""` is "not answered yet" and is what an item without a row reports. Kept as a
 * value rather than as an absent row so clearing an answer is a write like any
 * other — and so the audit trail can record the correction.
 */
export const CHECKLIST_VALUES = ["", "done", "yes", "no"] as const;
export type ChecklistValue = (typeof CHECKLIST_VALUES)[number];

/** Which answers a kind accepts. Anything else is a rejected write, not a shrug. */
export function isChecklistValueFor(
  kind: ChecklistItemKind,
  value: string,
): value is ChecklistValue {
  if (value === "") return true;
  return kind === "check" ? value === "done" : value === "yes" || value === "no";
}

/** Answered at all — what the progress count counts. */
export const isChecklistAnswered = (value: string): boolean => value !== "";

/**
 * Boundary validation for form schemas arriving from the API or the filesystem.
 * The inner `schema` is only checked to be an object here — JSON Schema itself is
 * validated by the form engine when it compiles the schema to zod (Phase 2).
 */
export const MITSFormSchemaMeta = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  version: z.number().int().positive(),
  icon: z.string().optional(),
  schema: z.record(z.string(), z.unknown()),
  uiHints: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  submitLabel: z.string().optional(),
  aiHint: z.string().optional(),
  /**
   * The agent checklist. Absent and empty mean the same thing — no section on the
   * ticket — which is why there is no switch beside it: a checklist with no steps is
   * a checklist that is off.
   */
  checklist: z.array(ChecklistItemSchema).max(CHECKLIST_ITEM_LIMIT).optional(),
});

/** Parse untrusted input into a MITSFormSchema, throwing on a malformed payload. */
export function parseFormSchema(input: unknown): MITSFormSchema {
  const meta = MITSFormSchemaMeta.parse(input);
  return { ...meta, schema: meta.schema as JSONSchema7 } as MITSFormSchema;
}

/* ──────────────────────────────────────────────────────────────────────────
   Users and authentication settings.

   The role values themselves live in `lib/auth/roles.ts` — the proxy imports
   those and must stay free of zod and any Node-only dependency.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Roles, with the pre-rename value tolerated on read.
 *
 * `technician` became `agent`. The column is migrated in `lib/db/sqlite.ts`, but the
 * preprocess stays for the same reason `TicketPriority` keeps its legacy map: a
 * database restored from an older backup would otherwise fail this parse on every
 * row and take the whole user list down with it. Unknown values are *not* mapped —
 * they fail, and `toRole` in `lib/auth/roles.ts` is what degrades them to `user`.
 */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  technician: "agent",
};

export const MITSRoleSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? (LEGACY_ROLE_MAP[value] ?? value) : value,
  z.enum(["user", "agent", "admin"]),
);

/** The user shape the UI is allowed to see. No password hash, no session token. */
export const MITSUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean().default(false),
  role: MITSRoleSchema.default("user"),
  image: z.string().nullable().default(null),
  createdAt: z.coerce.date(),
});
export type MITSUser = z.infer<typeof MITSUserSchema>;

/**
 * Admin-controlled registration policy.
 *
 * `allowedEmailDomains` empty means "any domain". Entries are stored lowercase
 * without a leading `@`; matching is exact on the part after the last `@`, so
 * `company.com` does not admit `evil-company.com`.
 */
/* ──────────────────────────────────────────────────────────────────────────
   Wie lange eine Anmeldung hält.

   Der Admin setzt die Obergrenze, die Person am Anmeldeformular entscheidet, ob
   sie sie in Anspruch nimmt. Zwei verschiedene Fragen: „wie lange darf eine
   Sitzung auf diesem Desk leben" ist eine Richtlinie, „will ich auf diesem Gerät
   angemeldet bleiben" ist eine Aussage über das Gerät — und ein gemeinsamer
   Rechner beantwortet die zweite anders als ein Diensthandy.

   Eine feste Liste und kein freies Feld: der Wert wird zur Lebensdauer eines
   Cookies, und „3600" in ein Zahlenfeld getippt ist eine Instanz, auf der sich
   niemand erklären kann, warum er stündlich fliegt.
   ────────────────────────────────────────────────────────────────────────── */

/** Tage. `0` heißt „immer aktiv" und ist deshalb der erste Eintrag, nicht der letzte. */
export const SESSION_LIFETIME_DAYS = [0, 1, 7, 14, 30] as const;
export type SessionLifetimeDays = (typeof SESSION_LIFETIME_DAYS)[number];

export const SESSION_LIFETIME_LABELS: Record<SessionLifetimeDays, string> = {
  0: "Immer aktiv",
  1: "1 Tag",
  7: "7 Tage",
  14: "14 Tage",
  30: "30 Tage",
};

export const DEFAULT_SESSION_LIFETIME_DAYS: SessionLifetimeDays = 30;

/**
 * „Immer aktiv" als Zahl: zehn Jahre.
 *
 * Es gibt kein unendlich — Better Auth rechnet `expiresIn` in ein Ablaufdatum und
 * in ein `Max-Age` um, und beides braucht einen Wert. Zehn Jahre sind länger als
 * jede Installation, die diese Frage stellt, und bleiben weit unterhalb der
 * Grenze, ab der ein Browser ein Cookie-Datum zurückstutzt.
 */
export const SESSION_LIFETIME_FOREVER_SECONDS = 60 * 60 * 24 * 365 * 10;

/**
 * Ein gespeicherter oder abgeschickter Wert, oder der Default.
 *
 * Fällt zurück statt zu werfen: das hier entscheidet über die Anmeldung, und
 * eine von Hand editierte Zeile darf nicht dazu führen, dass sich niemand mehr
 * anmelden kann.
 */
export function toSessionLifetimeDays(value: unknown): SessionLifetimeDays {
  const days = Number(value);
  return (SESSION_LIFETIME_DAYS as readonly number[]).includes(days)
    ? (days as SessionLifetimeDays)
    : DEFAULT_SESSION_LIFETIME_DAYS;
}

/** Die Zahl, die Better Auth als `session.expiresIn` bekommt. */
export function sessionLifetimeSeconds(days: SessionLifetimeDays): number {
  return days === 0 ? SESSION_LIFETIME_FOREVER_SECONDS : days * 60 * 60 * 24;
}

/* ──────────────────────────────────────────────────────────────────────────
   Zwei-Faktor-Pflicht je Rolle.

   Die Einrichtung selbst steht **jedem** Konto offen und braucht keinen
   Schalter — was der Admin hier entscheidet, ist, für wen sie Pflicht wird.

   Alle drei Rollen und nicht `RESTRICTABLE_ROLES`: das dort ist eine Liste
   dessen, wem man etwas *wegnehmen* kann, und einen Administrator vor der
   eigenen Maske auszusperren wäre eine Instanz ohne Weg zurück. Ein zweiter
   Faktor nimmt nichts weg, und ein Konto, das die Instanz verwaltet, ist genau
   das, für das er zuerst gelten sollte.

   Als eigene Liste geführt statt aus `lib/auth/roles` importiert — aus dem
   Grund, der schon bei `RESTRICTABLE_ROLES` steht: diese Datei bleibt frei von
   Importen aus der Auth-Schicht.
   ────────────────────────────────────────────────────────────────────────── */

export const TWO_FACTOR_ROLES = ["user", "agent", "admin"] as const;
export type TwoFactorRole = (typeof TWO_FACTOR_ROLES)[number];

export const TWO_FACTOR_ROLE_LABELS: Record<TwoFactorRole, string> = {
  user: "Melder",
  agent: "Agenten",
  admin: "Administration",
};

/**
 * Die Rollen, für die ein zweiter Faktor Pflicht ist.
 *
 * Filtert Unbekanntes heraus, statt es abzulehnen — dieselbe Regel wie bei
 * `hidden_areas`: ein Rollenname, den dieser Build nicht kennt, darf nicht die
 * ganze Auth-Konfiguration mitnehmen. Was übrig bleibt, ist dedupliziert und in
 * der Reihenfolge von `TWO_FACTOR_ROLES`, damit die gespeicherte Zeile nicht
 * davon abhängt, in welcher Reihenfolge die Maske ihre Schalter abschickt.
 */
export function toTwoFactorRoles(value: unknown): TwoFactorRole[] {
  if (!Array.isArray(value)) return [];
  const named = new Set(value.filter((entry) => typeof entry === "string"));
  return TWO_FACTOR_ROLES.filter((role) => named.has(role));
}

export const AuthSettingsSchema = z.object({
  registrationEnabled: z.boolean().default(true),
  allowedEmailDomains: z.array(z.string()).default([]),
  /*
   * Durch `toSessionLifetimeDays` geführt statt als `z.enum` deklariert.
   *
   * Zod lehnt einen unbekannten Enum-Wert ab, und ein abgelehnter Parse nimmt
   * hier die **ganze** Auth-Konfiguration mit — inklusive der Domain-Whitelist,
   * um die es eigentlich geht. Dieselbe Falle wie bei `hidden_areas` und bei
   * `widget_order`. Ein Wert, den dieser Build nicht kennt, wird zum Default,
   * nicht zum Ausfall der Registrierungsrichtlinie.
   */
  sessionLifetimeDays: z
    .unknown()
    .optional()
    .transform(toSessionLifetimeDays),
  /* Gefiltert statt geprüft — siehe `toTwoFactorRoles`. */
  twoFactorRequiredRoles: z
    .unknown()
    .optional()
    .transform(toTwoFactorRoles),
});
export type AuthSettings = z.infer<typeof AuthSettingsSchema>;

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  registrationEnabled: true,
  allowedEmailDomains: [],
  sessionLifetimeDays: DEFAULT_SESSION_LIFETIME_DAYS,
  /*
   * Leer, und das ist die tragende Vorgabe: ein Update, das die Pflicht
   * einschaltet, sperrt jede laufende Instanz aus — niemand hat einen zweiten
   * Faktor eingerichtet, den er noch nicht haben konnte.
   */
  twoFactorRequiredRoles: [],
};

/* ──────────────────────────────────────────────────────────────────────────
   System settings: display timezone and time server.

   The timezone is a *display* setting. Timestamps are stored as ISO strings in
   UTC and stay that way; this only decides how they are rendered, so changing it
   reinterprets nothing and cannot corrupt a stored date.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * How often a page refreshes itself, in minutes. `0` is off.
 *
 * A fixed set rather than a free number: the value drives a timer that costs a
 * request per tick per open tab, and "every 5 seconds" typed into a box is a load
 * problem nobody would connect back to this field.
 */
export const REFRESH_INTERVALS = [0, 1, 3, 5, 10, 15, 30] as const;
export type RefreshInterval = (typeof REFRESH_INTERVALS)[number];

export const DEFAULT_REFRESH_MINUTES: RefreshInterval = 3;

export const REFRESH_LABELS: Record<RefreshInterval, string> = {
  0: "Aus",
  1: "Jede Minute",
  3: "Alle 3 Minuten",
  5: "Alle 5 Minuten",
  10: "Alle 10 Minuten",
  15: "Alle 15 Minuten",
  30: "Alle 30 Minuten",
};

/**
 * Sentinel for "no override, follow the instance-wide value".
 *
 * Here rather than beside the Server Action that consumes it: a `"use server"` module
 * may only export async functions, so a constant declared there is a build error the
 * moment a client component imports it.
 */
export const REFRESH_FOLLOW_GLOBAL = "__global";

export const isRefreshInterval = (value: unknown): value is RefreshInterval =>
  typeof value === "number" &&
  (REFRESH_INTERVALS as readonly number[]).includes(value);

/** Parse a form field, falling back rather than throwing on anything unexpected. */
export function toRefreshInterval(
  value: unknown,
  fallback: RefreshInterval = DEFAULT_REFRESH_MINUTES,
): RefreshInterval {
  const parsed = Number(value);
  return isRefreshInterval(parsed) ? parsed : fallback;
}

export const SystemSettingsSchema = z.object({
  /** IANA zone name, e.g. `Europe/Berlin`. Validated against the runtime's ICU data. */
  timezone: z.string().max(64),
  /** Hostname or IP of an NTP server. No scheme, no port — this is UDP to 123. */
  ntpHost: z.string().max(253),
  /**
   * Instance-wide refresh interval. Binding for reporters, the default for staff.
   *
   * Coerced and clamped rather than validated strictly: a stored value from an older
   * build, or one an admin edited by hand, has to resolve to something usable —
   * failing the parse would discard the timezone and the NTP host along with it.
   */
  refreshMinutes: z
    .unknown()
    .transform((value) => toRefreshInterval(value))
    .default(DEFAULT_REFRESH_MINUTES),
});
export type SystemSettings = z.infer<typeof SystemSettingsSchema>;

export const DEFAULT_NTP_HOST = "pool.ntp.org";

/**
 * A hostname or IP literal, nothing else.
 *
 * The value is admin-supplied and goes to a socket, so the shape is checked rather
 * than trusted. Deliberately no scheme and no port: this is UDP to 123, and
 * accepting `http://…` would only invite the wrong thing being pasted in.
 *
 * Here rather than in `lib/ntp.ts` for the same reason `isValidModelName` is here:
 * that module imports `node:dgram` and is marked `server-only`, which makes it
 * unreachable from the offline test script — and a host validator nobody can test
 * is the one place a typo in the pattern would go unnoticed.
 */
const NTP_HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

export const isValidNtpHost = (value: string): boolean =>
  NTP_HOST_PATTERN.test(value.trim());

/** Above these the clock is worth acting on rather than just noting. */
export const NTP_WARN_OFFSET_MS = 2000;
export const NTP_CRITICAL_OFFSET_MS = 30_000;

export type ClockHealth = "ok" | "warn" | "critical";

/** Direction does not matter — a clock two minutes behind is as wrong as one ahead. */
export function clockHealth(offsetMs: number): ClockHealth {
  const magnitude = Math.abs(offsetMs);
  if (magnitude >= NTP_CRITICAL_OFFSET_MS) return "critical";
  if (magnitude >= NTP_WARN_OFFSET_MS) return "warn";
  return "ok";
}

/* ──────────────────────────────────────────────────────────────────────────
   AI settings.

   Configured in the UI, not in the environment. The web app reads them per
   request and passes them to the AI backend, which stays stateless and needs no
   database of its own.
   ────────────────────────────────────────────────────────────────────────── */

/** Ollama model tag: `llama3.1`, `qwen2.5-vl:7b`, `registry/user/model:tag`. */
const MODEL_PATTERN = /^[A-Za-z0-9._\-/]+(:[A-Za-z0-9._-]+)?$/;

/* ──────────────────────────────────────────────────────────────────────────
   Which model service MITS talks to.

   Three, because a self-hosted helpdesk has three plausible answers: a GPU in the
   rack (Ollama or anything speaking its API, vLLM included), or one of the two
   hosted providers most organisations already have a contract with.

   `ollama` stays the default and is the only one that needs no key — an instance
   that never opens this page has a working local path and no outbound traffic.
   ────────────────────────────────────────────────────────────────────────── */

export const AIProvider = z.enum(["ollama", "openai", "anthropic"]);
export type AIProvider = z.infer<typeof AIProvider>;

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  ollama: "Ollama / vLLM (lokal)",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/** Default endpoint per provider. An empty `baseUrl` resolves to these. */
export const AI_PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  ollama: "http://host.docker.internal:11434",
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
};

/** Only the cloud providers authenticate; Ollama has no key to give. */
export const providerNeedsKey = (provider: AIProvider): boolean =>
  provider !== "ollama";

/**
 * The optional assistance features, each its own switch.
 *
 * **All four default to off.** That is the whole architecture: an instance is a
 * complete ticket system with no model configured at all, and every feature that
 * sends text somewhere is something an administrator turned on deliberately. A
 * default-on assistance feature would be a silent outbound request on first start.
 */
export const AI_FEATURES = [
  "clustering",
  "summary",
  "routing",
  "deflection",
  "digest",
] as const;
export type AIFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_META: Record<
  AIFeature,
  { label: string; description: string; needsModel: boolean }
> = {
  clustering: {
    label: "Hauptstörungs-Erkennung",
    description:
      "Meldet im Queue-Kopf, wenn mehrere Tickets in kurzer Zeit dasselbe Thema haben, und bietet an, daraus eine Hauptstörung zu machen.",
    // The grouping itself is arithmetic; the model only writes the headline.
    needsModel: false,
  },
  summary: {
    label: "Verlaufszusammenfassung",
    description:
      "Schaltfläche im Ticket ab vier Nachrichten: Problem, bisherige Schritte, aktueller Stand.",
    needsModel: true,
  },
  routing: {
    label: "Auto-Tagging & Routing-Vorschlag",
    description:
      "Vergibt beim Anlegen ein bis drei Schlagworte und nennt die Kategorie, die besser gepasst hätte.",
    needsModel: true,
  },
  deflection: {
    label: "Selbsthilfe-Vorschläge",
    description:
      "Zeigt Anwendern während der Eingabe passende FAQ-Einträge. Durchsucht nur die eigene FAQ und braucht kein Modell.",
    needsModel: false,
  },
  digest: {
    label: "Sammelmeldung zusammenfassen",
    description:
      "Formuliert einen Satz darüber, was während der Abwesenheit passiert ist, sobald mehrere Benachrichtigungen auf einmal ankommen. Ohne Modell wird stattdessen gezählt — die Sammelmeldung selbst braucht keins.",
    needsModel: true,
  },
};

/** Fields that fall back to an environment variable when left empty. */
export const AI_FALLBACK_FIELDS = [
  "ollamaBaseUrl",
  "textModel",
  "visionModel",
] as const;
export type AIFallbackField = (typeof AI_FALLBACK_FIELDS)[number];

export const AISettingsSchema = z.object({
  /**
   * The master switch. On by default because the triage that shipped before this
   * page existed depends on it, and silently removing a working feature on update
   * is not an opt-in — it is a regression. Everything *new* is off below.
   */
  enabled: z.boolean().default(true),
  provider: AIProvider.default("ollama"),
  /** Where Ollama listens. Empty falls back to the environment default. */
  ollamaBaseUrl: z.string().max(300).default(""),
  /** Endpoint override for the cloud providers. Empty uses the documented one. */
  baseUrl: z.string().max(300).default(""),
  /** Empty on save means "keep the stored one" — never "clear it". */
  apiKey: z.string().max(512).default(""),
  textModel: z.string().max(120).default(""),
  visionModel: z.string().max(120).default(""),

  clustering: z.boolean().default(false),
  summary: z.boolean().default(false),
  routing: z.boolean().default(false),
  deflection: z.boolean().default(false),
  digest: z.boolean().default(false),

  /**
   * How far back the clustering looks, and how many reports make an outage.
   *
   * Both admin-tunable because the right numbers depend on the size of the
   * organisation: three tickets in an hour is an outage in a fifty-person company
   * and a Tuesday in a five-thousand-person one.
   */
  clusterWindowMinutes: z.coerce.number().int().min(15).max(1440).default(60),
  clusterMinTickets: z.coerce.number().int().min(2).max(20).default(3),
});
export type AISettings = z.infer<typeof AISettingsSchema>;

export const DEFAULT_AI_SETTINGS: AISettings = AISettingsSchema.parse({
  ollamaBaseUrl: AI_PROVIDER_ENDPOINTS.ollama,
  textModel: "llama3.1",
  visionModel: "llava",
});

/** Sentinel the admin form posts to mean "keep the stored key". */
export const KEEP_AI_KEY = "__keep__";

/**
 * Whether a model call can be attempted at all.
 *
 * Fail closed: a cloud provider without a key produces an unauthenticated request
 * and a 401 in a place the admin will not be looking. The features that need no
 * model — clustering's arithmetic, the FAQ search — do not consult this.
 */
export function isAIModelReady(settings: AISettings): boolean {
  if (!settings.enabled) return false;
  if (settings.textModel.trim() === "") return false;
  if (providerNeedsKey(settings.provider) && settings.apiKey.trim() === "") {
    return false;
  }
  return true;
}

/** Whether one feature should do anything right now. */
export function isAIFeatureOn(
  settings: AISettings,
  feature: AIFeature,
): boolean {
  if (!settings.enabled || !settings[feature]) return false;
  return AI_FEATURE_META[feature].needsModel ? isAIModelReady(settings) : true;
}

/**
 * Whether this may be used as the Ollama endpoint.
 *
 * Only http and https, and a host must be present. An admin can deliberately
 * point MITS at any reachable host — that is the feature — but the scheme check
 * keeps `file:` and friends out of a URL the backend will fetch.
 */
export function isSafeOllamaUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

export const isValidModelName = (value: string): boolean =>
  MODEL_PATTERN.test(value.trim());

/* ──────────────────────────────────────────────────────────────────────────
   Portal content: system announcements and the quick-resource grid.

   Both are admin-maintained lists, small enough to live as JSON in
   `mits_setting` rather than in tables of their own.
   ────────────────────────────────────────────────────────────────────────── */

export const AnnouncementLevel = z.enum(["info", "warning", "critical"]);
export type AnnouncementLevel = z.infer<typeof AnnouncementLevel>;

export const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2000),
  type: AnnouncementLevel.default("info"),
  /** Off keeps the text for later without showing it. */
  active: z.boolean().default(true),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const ResourceKind = z.enum(["download", "link"]);
export type ResourceKind = z.infer<typeof ResourceKind>;

export const PortalResourceSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(120),
  description: z.string().max(400).default(""),
  /**
   * Target. Only http(s) and site-relative paths are accepted — see
   * `isSafeResourceHref`. A `javascript:` URL in an admin-managed tile would be
   * stored XSS against every portal visitor.
   */
  href: z.string().min(1).max(2000),
  kind: ResourceKind.default("link"),
  /** Lucide icon name, resolved through the allow-list in lib/icons.ts. */
  icon: z.string().default("ExternalLink"),
});
export type PortalResource = z.infer<typeof PortalResourceSchema>;

export const PortalContentSchema = z.object({
  announcements: z.array(AnnouncementSchema).default([]),
  resources: z.array(PortalResourceSchema).default([]),
});
export type PortalContent = z.infer<typeof PortalContentSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   Modular portal layout.

   The portal is assembled from widgets an admin switches on, reorders and
   renames. Every field carries a `.default()`, so a stored row written by an
   older build still parses and only the missing pieces fall back.
   ────────────────────────────────────────────────────────────────────────── */

export const PortalWidgetKey = z.enum([
  "outages",
  "status",
  "maintenance",
  "faq",
  "downloads",
  "active_tickets",
]);
export type PortalWidgetKey = z.infer<typeof PortalWidgetKey>;

/** Order used when nothing is stored, and the source of truth for completeness. */
export const PORTAL_WIDGET_ORDER: PortalWidgetKey[] = [
  "outages",
  "maintenance",
  "status",
  "active_tickets",
  "faq",
  "downloads",
];

export const PORTAL_WIDGET_LABELS: Record<PortalWidgetKey, string> = {
  outages: "Störungsmeldungen",
  maintenance: "Geplante Wartung",
  status: "Systemstatus",
  active_tickets: "Eigene offene Tickets",
  faq: "Selbsthilfe / FAQ",
  downloads: "Schnellzugriffe & Downloads",
};

const DEFAULT_WIDGET_TITLES: Record<PortalWidgetKey, string> = {
  outages: "Aktuelle Störungen",
  maintenance: "Geplante Wartung",
  status: "Systemstatus",
  active_tickets: "Meine offenen Tickets",
  faq: "Selbsthilfe",
  downloads: "Downloads",
};

const allWidgetsEnabled = () =>
  Object.fromEntries(PORTAL_WIDGET_ORDER.map((key) => [key, true])) as Record<
    PortalWidgetKey,
    boolean
  >;

export const PortalConfigSchema = z.object({
  /** Supports `{name}` — replaced with the signed-in user's first name. */
  hero_title: z.string().max(160).default("Guten Tag!"),
  hero_subtitle: z
    .string()
    .max(400)
    .default(
      "Willkommen im IT-Serviceportal. Meldungen, Selbsthilfe und der Stand Ihrer Tickets an einem Ort.",
    ),
  ticket_button_label: z.string().min(1).max(80).default("Zum Ticketsystem"),
  /*
   * `partialRecord`, not `record`: with an enum key, Zod 4's `record` is
   * exhaustive and rejects an object that is missing a single key. That would
   * defeat the whole per-field fallback — one absent widget key would fail the
   * parse and drop the admin's order and toggles along with it. The transforms
   * below are what actually fill the gaps.
   */
  enabled_widgets: z
    .partialRecord(PortalWidgetKey, z.boolean())
    .default(allWidgetsEnabled)
    .transform((value) => ({ ...allWidgetsEnabled(), ...value })),
  widget_titles: z
    .partialRecord(PortalWidgetKey, z.string().max(120))
    .default(() => DEFAULT_WIDGET_TITLES)
    // A blank title would render an unlabelled block, so it falls back per key
    // rather than per object.
    .transform((value) => {
      const merged = { ...DEFAULT_WIDGET_TITLES };
      for (const key of PORTAL_WIDGET_ORDER) {
        const title = value[key]?.trim();
        if (title) merged[key] = title;
      }
      return merged;
    }),
  /**
   * Normalised on read: unknown keys are dropped, duplicates collapsed, missing
   * ones appended. A widget added in a later release would otherwise be
   * invisible on every instance whose stored order predates it.
   *
   * Typed `z.array(z.string())` rather than `z.array(PortalWidgetKey)` for the
   * same reason `partialRecord` is used above: the strict version *rejects* an
   * unknown entry instead of letting the transform drop it, and a rejected parse
   * discards the whole config — order, toggles and titles with it. A widget key
   * removed in a future release would take the admin's entire layout down.
   */
  widget_order: z
    .array(z.string())
    .default(() => PORTAL_WIDGET_ORDER)
    .transform((value) => {
      const seen = new Set<PortalWidgetKey>();
      const order = value.filter((key): key is PortalWidgetKey => {
        const known = PortalWidgetKey.safeParse(key);
        if (!known.success || seen.has(known.data)) return false;
        seen.add(known.data);
        return true;
      });
      return [
        ...order,
        ...PORTAL_WIDGET_ORDER.filter((key) => !seen.has(key)),
      ];
    }),
});
export type PortalConfig = z.infer<typeof PortalConfigSchema>;

export const DEFAULT_PORTAL_CONFIG: PortalConfig = PortalConfigSchema.parse({});

/** Resolve `{name}` in an admin-authored portal text. */
export function fillPortalText(template: string, name: string): string {
  return template.replaceAll("{name}", name);
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

/**
 * A file published alongside a FAQ article.
 *
 * Same shape as `AttachmentMetaSchema` but with `fileId` and `url` required: a FAQ
 * attachment always comes from the upload endpoint, so there is no pre-storage era
 * to stay compatible with. `type` decides the presentation — raster images render
 * inline, everything else is listed as a download.
 */
export const FaqAttachmentSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1).max(200),
  size: z.number().int().nonnegative(),
  type: z.string().max(160).default(""),
});
export type FaqAttachment = z.infer<typeof FaqAttachmentSchema>;

/** Raster formats only — see the inline branch in the download route. */
const INLINE_FAQ_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
];

export const isImageAttachment = (attachment: FaqAttachment): boolean =>
  INLINE_FAQ_TYPES.includes(attachment.type);

/** `1,4 MB`, `312 KB`, `840 B` — sized for a card, not for a report. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export const PortalFaqSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(4000),
  /** Free-text grouping headline. Empty means "ungrouped". */
  category: z.string().max(120).default(""),
  order_index: z.number().int().nonnegative().default(0),
  /** Defaulted, so entries written before attachments existed still parse. */
  attachments: z.array(FaqAttachmentSchema).default([]),
});
export type PortalFaq = z.infer<typeof PortalFaqSchema>;

/**
 * Shown until an admin edits the list. Deliberately generic where a real answer
 * would depend on the site — the point is a populated, editable accordion rather
 * than authoritative content.
 */
export const DEFAULT_PORTAL_FAQS: PortalFaq[] = [
  {
    id: "faq-referenzbenutzer",
    question: "Wie beantrage ich einen neuen Benutzer per Referenzbenutzer?",
    answer:
      "Ticket im Service-Katalog unter „Benutzer-Onboarding“ anlegen und dort eine bestehende Person mit denselben Aufgaben als Referenz angeben. Die Rechte werden von diesem Konto übernommen, statt einzeln aufgelistet zu werden — das verkürzt die Einrichtung deutlich und vermeidet vergessene Freigaben.",
    category: "Konten & Rechte",
    order_index: 0,
    attachments: [],
  },
  {
    id: "faq-rechte",
    question: "Ich brauche zusätzliche Rechte oder einen Zugang zu einer Anwendung.",
    answer:
      "Bitte über den Service-Katalog anfragen und dabei benennen, welche Anwendung und welche Tätigkeit gemeint ist. Rechteänderungen brauchen die Freigabe der Führungskraft; nennen Sie sie im Ticket, dann holen wir die Zustimmung direkt ein.",
    category: "Konten & Rechte",
    order_index: 1,
    attachments: [],
  },
  {
    id: "faq-hardware",
    question: "Wie bestelle ich Hardware (Notebook, Monitor, Headset)?",
    answer:
      "Über den Service-Katalog, Eintrag „Hardware-Bestellung“. Kostenstelle und gewünschter Termin gehören dazu; bei Geräten außerhalb des Standards bitte kurz begründen, damit die Beschaffung nicht nachfragen muss.",
    category: "Arbeitsplatz",
    order_index: 2,
    attachments: [],
  },
  {
    id: "faq-netzlaufwerk",
    question: "Ein Netzlaufwerk ist nicht verbunden.",
    answer:
      "Zuerst ab- und neu anmelden — Laufwerke werden bei der Anmeldung verbunden, und nach einem VPN-Wechsel fehlt die Verbindung häufig nur in dieser Sitzung. Bleibt es leer, bitte ein Ticket mit dem Laufwerksbuchstaben und dem Pfad aufgeben.",
    category: "Netzwerk & Zugriff",
    order_index: 3,
    attachments: [],
  },
  {
    id: "faq-sgate",
    question: "S-GATE meldet einen Fehler oder reagiert nicht.",
    answer:
      "Bitte einen Screenshot der Meldung an das Ticket hängen und angeben, welcher Vorgang betroffen ist. Der KI-Assistent liest den Text aus dem Screenshot und ordnet die Meldung vor, das beschleunigt die Bearbeitung.",
    category: "Anwendungen",
    order_index: 4,
    attachments: [],
  },
  {
    id: "faq-xphone",
    question: "xPhone zeigt mich falsch an oder klingelt nicht.",
    answer:
      "Prüfen Sie zuerst den Status im Client und ob das richtige Endgerät ausgewählt ist. Wenn Anrufe gar nicht ankommen, bitte Ihre Durchwahl und die Uhrzeit eines Beispielanrufs ins Ticket schreiben — damit lässt sich der Weg im Protokoll nachvollziehen.",
    category: "Telefonie",
    order_index: 5,
    attachments: [],
  },
];

/* ── Service status and planned maintenance ─────────────────────────────── */

export const ServiceState = z.enum(["operational", "degraded", "down"]);
export type ServiceState = z.infer<typeof ServiceState>;

export const SERVICE_STATE_LABELS: Record<ServiceState, string> = {
  operational: "Betriebsbereit",
  degraded: "Eingeschränkt",
  down: "Gestört",
};

export const PortalServiceSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(120),
  state: ServiceState.default("operational"),
  note: z.string().max(300).default(""),
});
export type PortalService = z.infer<typeof PortalServiceSchema>;

export const PortalMaintenanceSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160),
  /** Free text on purpose: "Sa 02.08., 20:00–23:00" beats a date picker here. */
  window: z.string().max(160).default(""),
  note: z.string().max(2000).default(""),
  /** Off keeps the entry for a recurring window without showing it. */
  active: z.boolean().default(true),
});
export type PortalMaintenance = z.infer<typeof PortalMaintenanceSchema>;

/**
 * Whether a resource link may be rendered.
 *
 * Anything but http(s) or a same-site path is refused, which rules out
 * `javascript:` and `data:` targets. Protocol-relative `//host` is refused too,
 * since it silently leaves the site.
 */
export function isSafeResourceHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Ticket categories: a tree, two levels deep in practice.

   Distinct from `MITSFormSchema.category`, which is a free-text grouping
   headline on a form and stays what it is. This is the filing dimension the
   queue filters on and the triage rules write, so it needs ids: a ticket that
   referenced a category by name would move to a different bucket the day
   somebody fixed a typo in that name.

   Depth is not enforced in the schema. The filter shows two levels because that
   is what fits two dropdowns; nothing breaks on a third, it simply does not get
   its own control. Enforcing a maximum would mean a migration the day somebody
   wants "Hardware / Notebooks / Docking".
   ────────────────────────────────────────────────────────────────────────── */

export const MITSTicketCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  /**
   * Empty string for a root, never null.
   *
   * The storage layer explains why at length: a nullable parent makes the
   * sibling-uniqueness index useless for roots, because SQL counts NULLs as
   * distinct. The empty string is a value and collides with itself, so
   * "Hardware" cannot exist twice at the top level.
   */
  parent_id: z.string().default(""),
  /** Lucide icon name, resolved at render time. Only the roots draw one. */
  icon: z.string().max(60).default(""),
  order_index: z.number().int().nonnegative().default(0),
});
export type MITSTicketCategory = z.infer<typeof MITSTicketCategorySchema>;

/** A root with its children, which is the shape both the tree editor and the filter want. */
export interface MITSCategoryNode extends MITSTicketCategory {
  children: MITSTicketCategory[];
}

/** Root marker. A named constant because it appears in SQL, forms and URLs. */
export const CATEGORY_ROOT = "";

/**
 * `Hardware / Notebooks` — the reading a badge and a filter notice both need.
 *
 * Joined with a slash rather than `›`: the path shows up in the ticket header,
 * in the re-route dialog and in the filter notice, and a character that is not
 * on a keyboard makes it unsearchable in the very field that searches payloads.
 */
export function categoryPathLabel(parts: string[]): string {
  return parts.filter(Boolean).join(" / ");
}

/* ──────────────────────────────────────────────────────────────────────────
   Reminders: snooze a ticket to a point in time.

   Per user and per ticket, and the pair is deliberately not unique — "look at
   this after the call" and "chase this on Friday" are two reminders, and
   collapsing them into one row would silently discard the second.

   `due_at` is an ISO instant, not a local date-time string. The presets below
   compute it from a timezone once, at the moment somebody clicks; storing the
   local reading would make "morgen 09:00" mean something different after a
   DST switch, on exactly the tickets that were snoozed across one.
   ────────────────────────────────────────────────────────────────────────── */

export const MITSTicketReminderSchema = z.object({
  id: z.string().min(1),
  ticket_id: z.string().min(1),
  user_id: z.string().min(1),
  due_at: z.string().min(1),
  note: z.string().max(500).default(""),
  is_done: z.boolean().default(false),
  created_at: z.string().min(1),
});
export type MITSTicketReminder = z.infer<typeof MITSTicketReminderSchema>;

/**
 * The three one-click offsets, plus the free date-time field beside them.
 *
 * Fixed rather than admin-configurable. They are the answer to "not now" at
 * three different distances — later today, tomorrow morning, next week-ish —
 * and a settings page for them would be four numbers nobody has an opinion
 * about until they are wrong.
 */
export const REMINDER_PRESETS = [
  { value: "hours-2", label: "In 2 Stunden" },
  { value: "tomorrow-9", label: "Morgen 09:00 Uhr" },
  { value: "days-3", label: "In 3 Tagen" },
] as const;

export type ReminderPreset = (typeof REMINDER_PRESETS)[number]["value"];

export const REMINDER_PRESET_VALUES = REMINDER_PRESETS.map(
  (entry) => entry.value,
) as ReminderPreset[];

export function isReminderPreset(value: unknown): value is ReminderPreset {
  return (
    typeof value === "string" &&
    (REMINDER_PRESET_VALUES as string[]).includes(value)
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Triage rules: keywords in, category out.

   Deterministic, admin-authored, and evaluated in order. Not a model, and that
   is the decision rather than a limitation — a rule that files "Drucker" under
   Hardware/Drucker can be read, tested and explained to the person whose ticket
   it moved. `services/ai/routing.ts` keeps doing what it did: it suggests, in a
   tag, and never writes a category.

   The same rule also carries the FAQ entries and the catalogue forms worth
   offering while somebody is still typing the word. One list, because it is one
   statement about a word: if "Notebook" means Hardware/Notebooks, the articles
   and the form about notebooks are the ones to show — maintaining that in three
   places is how the three drift apart.
   ────────────────────────────────────────────────────────────────────────── */

export const TriageRuleSchema = z.object({
  id: z.string().min(1),
  /** What an admin calls this rule in the list. Never shown to a reporter. */
  title: z.string().min(1).max(120),
  /**
   * Words that trigger it, lower-cased on save.
   *
   * Matched as whole words against the ticket text, so "drucker" does not fire on
   * "druckereinstellungen"… except that in German it should, which is why
   * `matchesKeyword` also accepts a prefix of at least five characters. See there.
   */
  keywords: z.array(z.string().min(2).max(40)).max(40).default([]),
  /** Category id assigned on a hit. Empty means "only offer the articles". */
  category_id: z.string().max(64).default(""),
  /**
   * Raise the priority on a hit, or leave it alone.
   *
   * Only ever upward — `applyTriage` will not lower what a reporter or an agent
   * already set. A rule that quietly demoted a ticket somebody marked urgent
   * would be the worst kind of automation: invisible and contradicting a person.
   */
  priority: z.union([TicketPriority, z.literal("")]).default(""),
  /** FAQ ids offered in the intake while the words are being typed. */
  faq_ids: z.array(z.string().min(1)).max(10).default([]),
  /**
   * Catalogue forms offered beside the free-text field while the words are typed.
   *
   * The third answer about one set of words, and the same shape as `faq_ids`
   * above for the same reason: „Notebook" means the notebook articles *and* the
   * notebook request form, and splitting that across two settings masks is how
   * the two drift apart.
   *
   * `.default([])` is the entire migration. The rules are a JSON blob in
   * `mits_setting`, read whole and written whole, so a stored rule from before
   * this field still parses.
   */
  form_schema_ids: z.array(z.string().min(1)).max(10).default([]),
  order_index: z.number().int().nonnegative().default(0),
  enabled: z.boolean().default(true),
});
export type TriageRule = z.infer<typeof TriageRuleSchema>;
