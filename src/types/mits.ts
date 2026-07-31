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

/** How the ticket entered the system. */
export const TicketSource = z.enum(["legacy", "wizard", "ai_chat"]);
export type TicketSource = z.infer<typeof TicketSource>;

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
  "resolved",
  "closed",
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting_user: "Wartet auf Anwender",
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
 * Human-readable ticket number, e.g. TICK-1001.
 *
 * Stored as an integer and formatted on the way out, so sorting and the
 * search-by-number path work on a number rather than on a string.
 */
export const TICKET_NUMBER_PREFIX = "TICK";
export const TICKET_NUMBER_START = 1001;

export const formatTicketNumber = (n: number): string =>
  `${TICKET_NUMBER_PREFIX}-${n}`;

/**
 * Pull a ticket number out of whatever a user typed: `1001`, `TICK-1001`,
 * `tick 1001`, `#1001`. Returns null when there is no plausible number, so the
 * caller can fall back to a text search instead of jumping.
 */
export function parseTicketNumber(input: string): number | null {
  const match = input
    .trim()
    .replace(/^#/, "")
    .match(/^(?:tick[\s-]*)?(\d{1,12})$/i);
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
   * existed still parses — `formatTicketNumber` renders that as TICK-0, which is
   * visibly wrong rather than silently plausible.
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
  /** Technician the ticket is assigned to, if any. */
  assigned_to: z.string().nullable().default(null),
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
}).extend({
  priority: TicketPriority.default("medium"),
  /** The reporter may state their site; everything else about them comes from the session. */
  location_id: z.string().nullable().default(null),
});
export type MITSTicketDraft = z.infer<typeof MITSTicketDraftSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   Agent workflow: replies and internal notes.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * `internal` is the security-relevant half of this type. An internal note is
 * only ever returned to a technician or admin, and it never triggers a mail —
 * see `listCommentsFor` in `lib/ticket-comments.ts`.
 */
export const CommentVisibility = z.enum(["public", "internal"]);
export type CommentVisibility = z.infer<typeof CommentVisibility>;

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
  created_at: z.coerce.date(),
});
export type TicketComment = z.infer<typeof TicketCommentSchema>;

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
 * Fill the placeholders a canned response may carry.
 *
 * Same shape as `fillPortalText`: literal `{token}` replacement, no expression
 * language. A template that could compute would be a template that could leak.
 */
export function fillCannedResponse(
  body: string,
  values: {
    ticket_number: string;
    reporter_name: string;
    agent_name: string;
  },
): string {
  return body
    .replaceAll("{ticket_number}", values.ticket_number)
    .replaceAll("{reporter_name}", values.reporter_name)
    .replaceAll("{agent_name}", values.agent_name);
}

export const CANNED_PLACEHOLDERS = [
  "{ticket_number}",
  "{reporter_name}",
  "{agent_name}",
] as const;

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
   Technician presence.
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
  feature_typing_indicator: z.boolean().default(false),
  feature_stats_heatmap: z.boolean().default(true),
  feature_sla_countdown: z.boolean().default(false),
  feature_auto_merge_suggestions: z.boolean().default(false),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type FeatureFlagKey = keyof FeatureFlags;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = FeatureFlagsSchema.parse({});

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
    label: "Techniker-Präsenz",
    description:
      "Zeigt an, welche Technikerinnen und Techniker gerade angemeldet sind.",
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
  feature_canned_responses: {
    label: "Textbausteine",
    description:
      "Vorformulierte Antworten, die im Antwortfeld eingesetzt werden. Gepflegt unter /admin/canned-responses.",
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

export const MITSRoleSchema = z.enum(["user", "technician", "admin"]);

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

export const AISettingsSchema = z.object({
  /** Where Ollama listens. Empty falls back to the environment default. */
  ollamaBaseUrl: z.string().max(300),
  textModel: z.string().max(120),
  visionModel: z.string().max(120),
});
export type AISettings = z.infer<typeof AISettingsSchema>;

export const DEFAULT_AI_SETTINGS: AISettings = {
  ollamaBaseUrl: "http://host.docker.internal:11434",
  textModel: "llama3.1",
  visionModel: "llava",
};

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
