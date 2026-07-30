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
