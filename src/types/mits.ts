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

export const TicketStatus = z.enum(["open", "in_progress", "closed"]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const TicketPriority = z.enum(["low", "normal", "high", "urgent"]);
export type TicketPriority = z.infer<typeof TicketPriority>;

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
  status: true,
  created_at: true,
  created_by: true,
  created_by_email: true,
  assigned_to: true,
  title: true,
}).extend({
  priority: TicketPriority.default("normal"),
});
export type MITSTicketDraft = z.infer<typeof MITSTicketDraftSchema>;

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
  | "select"
  | "radio"
  | "multiselect"
  | "checkbox"
  | "switch"
  | "file";

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
  hidden?: boolean;
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

export const PortalFaqSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(4000),
  /** Free-text grouping headline. Empty means "ungrouped". */
  category: z.string().max(120).default(""),
  order_index: z.number().int().nonnegative().default(0),
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
  },
  {
    id: "faq-rechte",
    question: "Ich brauche zusätzliche Rechte oder einen Zugang zu einer Anwendung.",
    answer:
      "Bitte über den Service-Katalog anfragen und dabei benennen, welche Anwendung und welche Tätigkeit gemeint ist. Rechteänderungen brauchen die Freigabe der Führungskraft; nennen Sie sie im Ticket, dann holen wir die Zustimmung direkt ein.",
    category: "Konten & Rechte",
    order_index: 1,
  },
  {
    id: "faq-hardware",
    question: "Wie bestelle ich Hardware (Notebook, Monitor, Headset)?",
    answer:
      "Über den Service-Katalog, Eintrag „Hardware-Bestellung“. Kostenstelle und gewünschter Termin gehören dazu; bei Geräten außerhalb des Standards bitte kurz begründen, damit die Beschaffung nicht nachfragen muss.",
    category: "Arbeitsplatz",
    order_index: 2,
  },
  {
    id: "faq-netzlaufwerk",
    question: "Ein Netzlaufwerk ist nicht verbunden.",
    answer:
      "Zuerst ab- und neu anmelden — Laufwerke werden bei der Anmeldung verbunden, und nach einem VPN-Wechsel fehlt die Verbindung häufig nur in dieser Sitzung. Bleibt es leer, bitte ein Ticket mit dem Laufwerksbuchstaben und dem Pfad aufgeben.",
    category: "Netzwerk & Zugriff",
    order_index: 3,
  },
  {
    id: "faq-sgate",
    question: "S-GATE meldet einen Fehler oder reagiert nicht.",
    answer:
      "Bitte einen Screenshot der Meldung an das Ticket hängen und angeben, welcher Vorgang betroffen ist. Der KI-Assistent liest den Text aus dem Screenshot und ordnet die Meldung vor, das beschleunigt die Bearbeitung.",
    category: "Anwendungen",
    order_index: 4,
  },
  {
    id: "faq-xphone",
    question: "xPhone zeigt mich falsch an oder klingelt nicht.",
    answer:
      "Prüfen Sie zuerst den Status im Client und ob das richtige Endgerät ausgewählt ist. Wenn Anrufe gar nicht ankommen, bitte Ihre Durchwahl und die Uhrzeit eines Beispielanrufs ins Ticket schreiben — damit lässt sich der Weg im Protokoll nachvollziehen.",
    category: "Telefonie",
    order_index: 5,
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
