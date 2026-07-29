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
 * What survives of an attachment once the payload is JSON.
 *
 * The browser holds real `File` objects; the API receives only this metadata.
 * Blob storage is not part of this phase — the record exists so a ticket does not
 * silently lose the fact that something was attached.
 */
export const AttachmentMetaSchema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  type: z.string().default(""),
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
