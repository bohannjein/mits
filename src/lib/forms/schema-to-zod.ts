import type { JSONSchema7, JSONSchema7Definition } from "json-schema";
import { z } from "zod";

import {
  AttachmentMetaSchema,
  type MITSFieldUIHint,
  type MITSFieldWidget,
  type MITSFormSchema,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   JSON Schema → zod, plus the field list the renderer iterates.

   This module is the only place that understands JSON Schema. Both the form
   engine and (from Phase 3) the AI extractor compile the same schema here, so a
   payload typed by hand and a payload produced by Ollama pass through identical
   validation.
   ────────────────────────────────────────────────────────────────────────── */

/** A single resolved field: everything the renderer needs, nothing it doesn't. */
export interface ResolvedField {
  /** JSON Schema property name — also the react-hook-form field name. */
  name: string;
  schema: JSONSchema7;
  hint: MITSFieldUIHint;
  widget: MITSFieldWidget;
  label: string;
  required: boolean;
  /** Choices for select / radio / multiselect, else undefined. */
  options?: { value: string; label: string }[];
  /** 1-based wizard step. Fields without a hint land on step 1. */
  step: number;
}

const isObjectSchema = (def: JSONSchema7Definition | undefined): def is JSONSchema7 =>
  typeof def === "object" && def !== null;

/**
 * The item schema of an array field. `items` may also be a tuple (one schema per
 * position); MITS fields are homogeneous lists, so the first entry is the one
 * that describes every element.
 */
function itemSchema(schema: JSONSchema7): JSONSchema7 | undefined {
  const { items } = schema;
  if (Array.isArray(items)) {
    return isObjectSchema(items[0]) ? items[0] : undefined;
  }
  return isObjectSchema(items) ? items : undefined;
}

/** JSON Schema allows `type: ["string", "null"]`; we only care about the first real type. */
function primaryType(schema: JSONSchema7): string | undefined {
  const { type } = schema;
  if (Array.isArray(type)) return type.find((t) => t !== "null");
  return type;
}

function enumValues(schema: JSONSchema7): string[] | undefined {
  if (Array.isArray(schema.enum)) {
    return schema.enum.filter((v): v is string => typeof v === "string");
  }
  // Array field whose items carry the choices, e.g. { type: "array", items: { enum: [...] } }
  const item = itemSchema(schema);
  if (item && Array.isArray(item.enum)) {
    return item.enum.filter((v): v is string => typeof v === "string");
  }
  return undefined;
}

/**
 * A file field has no native JSON Schema type. We follow the JSONForms
 * convention — `format: "data-url"` — so the schemas stay valid JSON Schema and
 * portable to other renderers.
 */
const isFileField = (schema: JSONSchema7): boolean =>
  schema.format === "data-url" || itemSchema(schema)?.format === "data-url";

/**
 * Decide which control renders a property. An explicit `uiHints.widget` always
 * wins; otherwise the JSON Schema itself decides, so a schema authored without
 * any UI metadata still renders sensibly.
 */
export function resolveWidget(
  schema: JSONSchema7,
  hint: MITSFieldUIHint = {},
): MITSFieldWidget {
  if (hint.widget) return hint.widget;
  // Checked before the type switch: a file field is an array or string in JSON
  // Schema terms, and would otherwise be mistaken for a multiselect or text.
  if (isFileField(schema)) return "file";

  const type = primaryType(schema);

  if (type === "boolean") return "checkbox";
  if (type === "integer" || type === "number") return "number";
  if (type === "array") return "multiselect";

  if (type === "string") {
    if (enumValues(schema)) return "select";
    if (schema.format === "email") return "email";
    // date-time carries a time; rendering it in a date-only input would drop half
    // the value the schema asked for.
    if (schema.format === "date-time") return "datetime";
    if (schema.format === "date") return "date";
    // Long free text gets a textarea rather than a single-line input.
    if ((schema.maxLength ?? 0) > 180) return "textarea";
    return "text";
  }

  return "text";
}

/* ──────────────────────────────────────────────────────────────────────────
   Conditional fields.

   Both halves are derived from the answers, never from a flag the client sends.
   That is the whole reason this lives here rather than in the form component: the
   browser hides a field and the server, given the same payload, reaches the same
   conclusion independently. A client claiming "that one was hidden" is not
   consulted.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Whether a controller's answer satisfies a condition.
 *
 * Compared as strings so one condition shape covers text, enums and booleans — a
 * checkbox condition reads `equals: ["true"]`. An array-valued controller matches
 * when any selected entry is listed.
 */
function valueMatches(value: unknown, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => allowed.includes(String(entry)));
  }
  if (value === undefined || value === null || value === "") return false;
  return allowed.includes(String(value));
}

/**
 * Which fields the given answers hide.
 *
 * Iterated to a fixpoint rather than resolved in one pass: a condition may point
 * at a field that is itself conditional, and a controller that is hidden must not
 * count as a match — otherwise a field could stay visible because of an answer to
 * a question that was never asked. Each pass only ever adds to the set, so the
 * field count bounds the loop; the iteration is also what makes the result
 * independent of property order, which a single pass is not.
 *
 * This is the *least* fixpoint: everything starts visible and is only ruled out
 * when an answer says so. A cycle whose conditions all happen to hold is therefore
 * stable with every member visible — consistent, but never what anyone meant, so
 * `conditionCycles` refuses such a schema at save time instead. Break the cycle at
 * any point and this converges on hiding the whole chain.
 */
export function hiddenFieldNames(
  form: MITSFormSchema,
  values: Record<string, unknown>,
): Set<string> {
  const hints = form.uiHints ?? {};
  const names = Object.keys(form.schema.properties ?? {});
  const hidden = new Set<string>();

  for (let pass = 0; pass <= names.length; pass += 1) {
    let changed = false;

    for (const name of names) {
      if (hidden.has(name)) continue;
      const condition = hints[name]?.visibleWhen;
      if (!condition) continue;

      const satisfied =
        !hidden.has(condition.field) &&
        valueMatches(values[condition.field], condition.equals);

      if (!satisfied) {
        hidden.add(name);
        changed = true;
      }
    }

    if (!changed) break;
  }

  return hidden;
}

/**
 * Conditions and cascades whose controlling field does not exist.
 *
 * Reported as `"field → missing"` per offender. Worth refusing a save over: a
 * dangling reference hides its field for good, and a required field that can never
 * appear makes the whole form unsubmittable with nothing visible to explain it.
 */
export function danglingConditions(form: MITSFormSchema): string[] {
  const known = new Set(Object.keys(form.schema.properties ?? {}));
  const problems: string[] = [];

  for (const [name, hint] of Object.entries(form.uiHints ?? {})) {
    // A hint for a property that was removed is harmless — nothing renders it —
    // so only the reference itself is checked.
    for (const reference of [hint.visibleWhen?.field, hint.optionsFrom?.field]) {
      if (reference !== undefined && !known.has(reference)) {
        problems.push(`${name} → ${reference}`);
      }
    }
  }

  return problems;
}

/**
 * Fields whose visibility conditions form a cycle, as `"a → b → a"` chains.
 *
 * A cycle is always an authoring mistake, and it has no sensible runtime answer:
 * with every condition satisfied the whole ring stays visible, with any one unmet
 * the whole ring disappears — so the same form behaves in two entirely different
 * ways depending on values nobody can reach in the first place. Refused at save
 * time rather than rendered.
 *
 * Only `visibleWhen` is walked. A cascade cycle cannot lock anyone out: a field
 * with no permitted choices is visibly empty, which is its own explanation.
 */
export function conditionCycles(form: MITSFormSchema): string[] {
  const hints = form.uiHints ?? {};
  const controllerOf = (name: string) => hints[name]?.visibleWhen?.field;

  const cycles: string[] = [];
  const settled = new Set<string>();

  for (const start of Object.keys(form.schema.properties ?? {})) {
    if (settled.has(start)) continue;

    // Each field has at most one controller, so the walk is a simple chain — it
    // ends at a field without a condition or re-enters somewhere already seen.
    const path: string[] = [];
    const onPath = new Map<string, number>();

    let current: string | undefined = start;
    while (current !== undefined && !settled.has(current)) {
      const seenAt = onPath.get(current);
      if (seenAt !== undefined) {
        cycles.push([...path.slice(seenAt), current].join(" → "));
        break;
      }
      onPath.set(current, path.length);
      path.push(current);
      current = controllerOf(current);
    }

    for (const name of path) settled.add(name);
  }

  return cycles;
}

/**
 * The choices a cascading field currently offers, or undefined when it does not
 * cascade. An unanswered or unmapped parent yields an empty list — an empty
 * dropdown is the honest rendering of "pick the other one first".
 */
export function cascadedValues(
  hint: MITSFieldUIHint,
  values: Record<string, unknown>,
): string[] | undefined {
  const cascade = hint.optionsFrom;
  if (!cascade) return undefined;

  const parent = values[cascade.field];
  if (parent === undefined || parent === null || parent === "") return [];
  return cascade.map[String(parent)] ?? [];
}

/**
 * Flatten a MITSFormSchema into the ordered field list the renderer walks.
 * Order is `uiHints.order` when given, otherwise JSON Schema property order.
 *
 * No answers in play, so every conditional field counts as visible and cascading
 * fields keep their declared enum. That is what label lookups and the admin-side
 * schema check want; the form and `createTicket` use `resolveFieldsFor` instead.
 */
export function resolveFields(form: MITSFormSchema): ResolvedField[] {
  const properties = form.schema.properties ?? {};
  const required = new Set(form.schema.required ?? []);

  return Object.entries(properties)
    .filter(([, def]) => isObjectSchema(def))
    .map(([name, def], index) => {
      const schema = def as JSONSchema7;
      const hint = form.uiHints?.[name] ?? {};
      return {
        name,
        schema,
        hint,
        widget: resolveWidget(schema, hint),
        label: schema.title ?? name,
        required: required.has(name),
        options: enumValues(schema)?.map((value) => ({
          value,
          label: hint.optionLabels?.[value] ?? value,
        })),
        step: hint.step ?? 1,
        order: hint.order ?? index,
      };
    })
    .filter((field) => !field.hint.hidden)
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...field }) => field);
}

/**
 * The fields that apply to a specific set of answers.
 *
 * Conditionally hidden fields are dropped and cascading fields get the choices
 * their parent currently permits. Without `values` this is exactly
 * `resolveFields` — no answers means nothing has been ruled out yet.
 */
export function resolveFieldsFor(
  form: MITSFormSchema,
  values?: Record<string, unknown>,
): ResolvedField[] {
  const fields = resolveFields(form);
  if (!values) return fields;

  const hidden = hiddenFieldNames(form, values);

  return fields
    .filter((field) => !hidden.has(field.name))
    .map((field) => {
      const allowed = cascadedValues(field.hint, values);
      if (!allowed) return field;

      const labels = field.hint.optionLabels ?? {};
      return {
        ...field,
        options: allowed.map((value) => ({
          value,
          label: labels[value] ?? value,
        })),
      };
    });
}

/** Text-ish fields default to "" in the form, so an untouched optional field must accept "". */
function optionalText(inner: z.ZodType): z.ZodType {
  return z.union([z.literal(""), inner]).optional();
}

function stringConstraints(schema: JSONSchema7, base: z.ZodString): z.ZodString {
  let out = base;
  if (typeof schema.minLength === "number") {
    out = out.min(schema.minLength, `Mindestens ${schema.minLength} Zeichen.`);
  }
  if (typeof schema.maxLength === "number") {
    out = out.max(schema.maxLength, `Maximal ${schema.maxLength} Zeichen.`);
  }
  if (typeof schema.pattern === "string") {
    out = out.regex(new RegExp(schema.pattern), "Ungültiges Format.");
  }
  return out;
}

/** Files never round-trip through JSON, so validate the browser object directly. */
const fileLike = z.custom<File>(
  (value) => typeof File !== "undefined" && value instanceof File,
  { message: "Ungültige Datei." },
);

/**
 * How file fields are represented in the value being validated.
 *
 * - `file`: real `File` objects — what the form holds in the browser.
 * - `metadata`: `{ name, size, type }` — what survives JSON, so this is what the
 *   API validates. Without this distinction the server would reject every
 *   attachment it receives, since `File` does not exist in the request body.
 */
export type FileValueMode = "file" | "metadata";

export interface CompileOptions {
  fileValue?: FileValueMode;
  /**
   * The answers being validated. Given these, conditionally hidden fields are
   * left out of the compiled shape and cascading fields are narrowed to the
   * choices their parent permits.
   *
   * Passing the payload here is what lets the server enforce conditions without
   * believing the client: it recomputes visibility from the same data. Omit it and
   * every field applies, which is the right default for a schema check that has no
   * answers to go on.
   */
  values?: Record<string, unknown>;
}

function zodForField(
  field: ResolvedField,
  options: CompileOptions = {},
): z.ZodType {
  const { schema, widget, required } = field;

  switch (widget) {
    case "file": {
      const max = typeof schema.maxItems === "number" ? schema.maxItems : undefined;
      const item: z.ZodType =
        options.fileValue === "metadata" ? AttachmentMetaSchema : fileLike;
      let list = z.array(item);
      if (required) list = list.min(1, "Bitte eine Datei anhängen.");
      if (max) list = list.max(max, `Maximal ${max} Dateien.`);
      return required ? list : list.optional();
    }

    case "checkbox":
    case "switch": {
      // A required boolean only has to be *true* when the schema pins it there
      // (consent-style fields); otherwise false is a legitimate answer.
      if (required && schema.const === true) {
        return z.literal(true, { error: "Bitte bestätigen." });
      }
      return required ? z.boolean() : z.boolean().optional();
    }

    case "number": {
      let num = z.coerce.number({ error: "Bitte eine Zahl eingeben." });
      if (typeof schema.minimum === "number") {
        num = num.min(schema.minimum, `Mindestens ${schema.minimum}.`);
      }
      if (typeof schema.maximum === "number") {
        num = num.max(schema.maximum, `Höchstens ${schema.maximum}.`);
      }
      if (primaryType(schema) === "integer") {
        num = num.int("Nur ganze Zahlen.");
      }
      // An empty input is "" — treat it as absent rather than coercing it to 0.
      return z.preprocess(
        (value) => (value === "" || value === null ? undefined : value),
        required ? num : num.optional(),
      );
    }

    case "multiselect": {
      const values = field.options?.map((o) => o.value) ?? [];
      const item = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
      let list = z.array(item);
      if (typeof schema.minItems === "number") {
        list = list.min(schema.minItems, `Mindestens ${schema.minItems} auswählen.`);
      }
      if (typeof schema.maxItems === "number") {
        list = list.max(schema.maxItems, `Höchstens ${schema.maxItems} auswählen.`);
      }
      if (required) list = list.min(Math.max(schema.minItems ?? 1, 1), "Pflichtfeld.");
      return required ? list : list.optional();
    }

    case "select":
    case "radio": {
      const values = field.options?.map((o) => o.value) ?? [];
      if (values.length === 0) {
        return required
          ? z.string().min(1, "Pflichtfeld.")
          : optionalText(z.string());
      }
      const choice = z.enum(values as [string, ...string[]], {
        error: "Bitte eine Option wählen.",
      });
      return required ? choice : optionalText(choice);
    }

    case "email": {
      const mail = z.email("Bitte eine gültige E-Mail-Adresse angeben.");
      return required ? mail : optionalText(mail);
    }

    /*
     * Pickers whose choices are read live from `mits_location` and the user list,
     * so there is no enum to validate against — a stored id would otherwise stop
     * validating the moment a site is renamed or a colleague leaves, taking every
     * existing ticket's payload down with it. These are descriptive answers, not
     * foreign keys; the ticket's own `location_id` column is the validated one.
     */
    case "location":
    case "user": {
      return required
        ? z.string().min(1, "Pflichtfeld.")
        : optionalText(z.string());
    }

    case "date":
    case "datetime":
    case "text":
    case "textarea":
    default: {
      const text = stringConstraints(schema, z.string());
      return required
        ? stringConstraints(schema, z.string().min(1, "Pflichtfeld."))
        : optionalText(text);
    }
  }
}

/**
 * Compile a MITSFormSchema into the zod object react-hook-form validates against.
 * Phase 3 reuses this to check an Ollama-produced payload before it is offered
 * to the user for confirmation.
 */
export function schemaToZod(form: MITSFormSchema, options: CompileOptions = {}) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of resolveFieldsFor(form, options.values)) {
    shape[field.name] = zodForField(field, options);
  }
  // strict(): a payload carrying properties the schema never declared is
  // rejected rather than stored. Matters on the server, where the body is
  // attacker-controlled. With `values` in play this also rejects an answer to a
  // field the conditions ruled out — the form strips those before submitting, so
  // one arriving means the payload did not come from the form.
  return z.strictObject(shape);
}

/**
 * Empty-but-defined values for every field. Without these, react-hook-form
 * starts the inputs uncontrolled and React warns on the first keystroke.
 */
export function defaultValuesFor(form: MITSFormSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of resolveFields(form)) {
    if (field.schema.default !== undefined) {
      values[field.name] = field.schema.default;
      continue;
    }
    switch (field.widget) {
      case "checkbox":
      case "switch":
        values[field.name] = false;
        break;
      case "multiselect":
      case "file":
        values[field.name] = [];
        break;
      case "number":
        values[field.name] = "";
        break;
      default:
        values[field.name] = "";
    }
  }
  return values;
}

/** Highest step number in the schema — 1 when the form is a single page. */
export function stepCount(form: MITSFormSchema): number {
  return resolveFields(form).reduce((max, f) => Math.max(max, f.step), 1);
}

/**
 * Reduce an untrusted payload to values this form can actually hold.
 *
 * Used for AI-extracted answers before they pre-fill the form. A model may return
 * fields that do not exist, an option outside an enum, or a number where the
 * input expects a string — all of which would either be dropped by `strictObject`
 * on submit or make React switch an input to uncontrolled. Filtering here means
 * the user sees a form they can actually correct, and anything unusable is simply
 * left blank rather than silently invented.
 */
export function pickSchemaFields(
  form: MITSFormSchema,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};

  for (const field of resolveFields(form)) {
    const value = payload[field.name];
    if (value === undefined || value === null) continue;

    switch (field.widget) {
      case "file":
        // Attachments come from the file picker, never from the model.
        break;

      case "multiselect": {
        if (!Array.isArray(value)) break;
        const allowed = field.options?.map((option) => option.value);
        const entries = value.filter(
          (entry): entry is string =>
            typeof entry === "string" && (!allowed || allowed.includes(entry)),
        );
        if (entries.length > 0) picked[field.name] = entries;
        break;
      }

      case "checkbox":
      case "switch":
        if (typeof value === "boolean") picked[field.name] = value;
        break;

      case "number":
        // The input holds a string; zod coerces it back on submit.
        if (typeof value === "number" && Number.isFinite(value)) {
          picked[field.name] = String(value);
        } else if (typeof value === "string" && value.trim() !== "") {
          picked[field.name] = value.trim();
        }
        break;

      case "select":
      case "radio": {
        if (typeof value !== "string") break;
        const allowed = field.options?.map((option) => option.value);
        if (!allowed || allowed.includes(value)) picked[field.name] = value;
        break;
      }

      default:
        if (typeof value === "string") picked[field.name] = value;
    }
  }

  return picked;
}
