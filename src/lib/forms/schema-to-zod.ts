import type { JSONSchema7, JSONSchema7Definition } from "json-schema";
import { z } from "zod";

import type {
  MITSFieldUIHint,
  MITSFieldWidget,
  MITSFormSchema,
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
    if (schema.format === "date" || schema.format === "date-time") return "date";
    // Long free text gets a textarea rather than a single-line input.
    if ((schema.maxLength ?? 0) > 180) return "textarea";
    return "text";
  }

  return "text";
}

/**
 * Flatten a MITSFormSchema into the ordered field list the renderer walks.
 * Order is `uiHints.order` when given, otherwise JSON Schema property order.
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

function zodForField(field: ResolvedField): z.ZodType {
  const { schema, widget, required } = field;

  switch (widget) {
    case "file": {
      const max = typeof schema.maxItems === "number" ? schema.maxItems : undefined;
      let list = z.array(fileLike);
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

    case "date":
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
export function schemaToZod(form: MITSFormSchema) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of resolveFields(form)) {
    shape[field.name] = zodForField(field);
  }
  return z.object(shape);
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
