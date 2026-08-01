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
  legacy: "Schnellmeldung",
  wizard: "Service-Katalog",
  ai_chat: "KI-Assistent",
  email: "E-Mail",
};

/**
 * Ticket lifecycle.
 *
 * `waiting_user` and `resolved` were added for the agent workflow; the column is
 * plain TEXT with no constraint, so older rows carrying only the original three
 * keep parsing. Order matters — it is the order the board and the status pickers
 * offer, and `OPEN_TICKET_STATUSES` derives from it.
 */
export const TicketStatus = z.enum([
  "open",
  "in_progress",
  "waiting_user",
  "waiting_major",
  "resolved",
  "closed",
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting_user: "Wartet auf Anwender",
  waiting_major: "Wartet auf Hauptstörung",
  resolved: "Gelöst",
  closed: "Geschlossen",
};

/**
 * Still someone's problem. `resolved` counts as open on purpose: the agent is
 * done but the reporter has not confirmed, and a resolved ticket that vanishes
 * from every list is a ticket nobody notices was never actually fixed.
 */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "waiting_user",
  // A ticket parked behind a major incident is still somebody's problem — the
  // major one. Counting it as closed would make an outage look like it shrank the
  // queue instead of consuming it.
  "waiting_major",
  "resolved",
];

export const isOpenStatus = (status: TicketStatus): boolean =>
  OPEN_TICKET_STATUSES.includes(status);

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
  in_progress: 1,
  waiting_user: 2,
  waiting_major: 3,
  resolved: 4,
  closed: 5,
};

/**
 * Human-readable ticket number: sixteen digits, zero-padded, counted from 1.
 *
 * `0000000000000001`. Stored as an integer and padded on the way out, so sorting and the
 * search-by-number path still work on a number — and a padded string sorts correctly as
 * text too, which is what makes it usable in a mail subject or a spreadsheet column.
 *
 * Sixteen digits is beyond what JavaScript can represent exactly: `Number.MAX_SAFE_INTEGER`
 * is about 9.007e15, a full sixteen-nine number is 9.999e15. The padding is therefore a
 * display width, not a capacity — the counter would lose precision long before it filled
 * the field, at roughly nine quadrillion tickets. Recorded rather than left as a surprise.
 *
 * `TICKET_NUMBER_START` only affects a fresh instance. An existing one keeps counting from
 * its own highest number: renumbering would invalidate every reference in every mail
 * already sent.
 */
export const TICKET_NUMBER_START = 1;

/** Display width. Not a capacity — see above. */
export const TICKET_NUMBER_DIGITS = 16;

/** Retired from display, kept because the parser still recognises it. */
export const LEGACY_TICKET_PREFIX = "TICK";

export const formatTicketNumber = (n: number): string =>
  String(n).padStart(TICKET_NUMBER_DIGITS, "0");

/**
 * Pull a ticket number out of whatever a user typed: `1001`, `TICK-1001`,
 * `tick 1001`, `#1001`. Returns null when there is no plausible number, so the
 * caller can fall back to a text search instead of jumping.
 *
 * The `TICK-` forms are deliberately still accepted although nothing produces them any
 * more. They are in sent mail and in whatever people wrote on a sticky note, and the
 * cost of tolerating them is one optional group in a regex.
 */
export function parseTicketNumber(input: string): number | null {
  const match = input
    .trim()
    .replace(/^#/, "")
    .match(/^(?:tick[\s-]*)?(\d{1,16})$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

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
   * This ticket *is* the outage, not one of its reports.
   *
   * A column rather than "has children", because the two are different claims: a
   * major incident is declared, and it stays one for the whole time it is being
   * worked even if its last child gets unlinked.
   */
  major_incident: z.boolean().default(false),
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
   * The four read-time fields. Omitted rather than made optional for the same
   * reason `created_by` is: a client that sends `unread: false` or its own
   * `logged_minutes` should be ignored, and a schema that accepts the key invites
   * exactly one future call site to trust it.
   */
  assigned_to_name: true,
  last_activity_at: true,
  unread: true,
  logged_minutes: true,
  // Written by the routing service after the ticket exists, and declared by an
  // agent respectively. Neither is a client's to state.
  tags: true,
  major_incident: true,
}).extend({
  priority: TicketPriority.default(DEFAULT_TICKET_PRIORITY),
  /** The reporter may state their site; everything else about them comes from the session. */
  location_id: z.string().nullable().default(null),
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
  order_index: z.number().int().nonnegative().default(0),
});
export type CannedResponse = z.infer<typeof CannedResponseSchema>;

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
};

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
  /** Inventory number as the organization writes it. Free text, unique per instance. */
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
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type FeatureFlagKey = keyof FeatureFlags;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = FeatureFlagsSchema.parse({});

/* ──────────────────────────────────────────────────────────────────────────
   Notification channels.

   Modelled on the notification settings a phone has, because that is the mental
   model people already carry: a small number of named channels, each with its
   own switch and its own urgency, plus a few properties of the presentation
   itself. It is not a free-form editor — the channels are the three things MITS
   can tell somebody about, and inventing a fourth means writing the query that
   finds it.

   **`feature_toast_notifications` stays the master switch.** These settings shape
   what is shown, they do not decide *whether*. Two places that can silence
   notifications is one place too many to look when they are missing.
   ────────────────────────────────────────────────────────────────────────── */

export const NOTIFICATION_CHANNELS = ["reply", "ticket", "assigned"] as const;
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

  assigned_enabled: z.boolean().default(true),
  assigned_tone: ToastTone.default("success"),
  /** On by default: a ticket handed to you is the one that must not scroll past. */
  assigned_sticky: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings =
  NotificationSettingsSchema.parse({});

/** The three per-channel keys, so the form and the client read them the same way. */
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
  feature_auto_merge_suggestions: {
    label: "Zusammenführungs-Vorschläge",
    description:
      "Schlägt Tickets vor, die Duplikate sein könnten. Experimentell.",
  },
};

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
  submitLabel?: string;
  /**
   * Free-text description of when this form applies. Phase 3 puts this in the
   * routing prompt so the model can pick a schema from a plain-language request.
   */
  aiHint?: string;
}

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
export const AuthSettingsSchema = z.object({
  registrationEnabled: z.boolean().default(true),
  allowedEmailDomains: z.array(z.string()).default([]),
});
export type AuthSettings = z.infer<typeof AuthSettingsSchema>;

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  registrationEnabled: true,
  allowedEmailDomains: [],
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
