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

export const MITSTicketSchema = z.object({
  id: z.string(),
  source: TicketSource,
  /** Which MITSFormSchema produced `payload`. Absent for free-text legacy tickets. */
  form_schema_id: z.string().optional(),
  /** Answers, keyed by the JSON-Schema property name. Validated per form schema. */
  payload: z.record(z.string(), z.unknown()),
  status: TicketStatus,
  priority: TicketPriority,
  /** Coerced: the API and Ollama both hand us ISO strings, not Date objects. */
  created_at: z.coerce.date(),
});
export type MITSTicket = z.infer<typeof MITSTicketSchema>;

/**
 * A ticket that has not been persisted yet — no id, no status, no timestamp.
 * This is what the form engine submits and what the Phase 3 extractor has to
 * produce from free text or an image.
 */
export const MITSTicketDraftSchema = MITSTicketSchema.omit({
  id: true,
  status: true,
  created_at: true,
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
  | "checkbox"
  | "switch"
  | "file";

export interface MITSFieldUIHint {
  widget?: MITSFieldWidget;
  placeholder?: string;
  /** Helper text under the control. */
  help?: string;
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
