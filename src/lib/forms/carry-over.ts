import { resolveFields } from "@/lib/forms/schema-to-zod";
import type { MITSFormSchema } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Moving a half-written free-text ticket into a catalogue form.

   The intake suggests a form while somebody is typing („Drucker" → „Störung
   Drucker"), and clicking that suggestion opens the form. Without this file it
   would open *empty*, and the suggestion would be a punishment for taking it:
   two sentences and a screenshot gone, and the next person learns not to click.

   So the text moves. Nothing is dropped and nothing is guessed at: the mapping is
   three questions about the target form, answered from `resolveFields` — the same
   ordered field list the renderer walks, so the widget resolution, the `order`
   hints and the hidden-field filter are the ones actually in effect rather than a
   second reading of the JSON Schema.

   No `server-only`: this runs in the browser, at the click. Pure, and covered by
   `npm run test:forms`.
   ────────────────────────────────────────────────────────────────────────── */

/** What the free-text composer holds at the moment somebody takes a suggestion. */
export interface CarryText {
  title: string;
  description: string;
  files: File[];
}

/**
 * Prefill values for `SchemaForm`, derived from the free-text composer.
 *
 * | Target                                   | Gets            |
 * |------------------------------------------|-----------------|
 * | first `textarea` field                   | the description |
 * | first plain `text` field                 | the title       |
 * | first `file` field                       | the attachments |
 *
 * `resolveWidget` is what decides those three, which is why there is no length or
 * `format` arithmetic here — a `maxLength` over 180 already resolves to
 * `textarea`, and `format: "data-url"` to `file`.
 *
 * **A form with only one free-text field gets both halves**, title first, blank
 * line, then the description. Losing the title because the target happens to be a
 * single-textarea form is exactly the silent loss this file exists to prevent.
 *
 * Every returned key is a field the schema declares. `SchemaForm` spreads this
 * over `defaultValuesFor`, so a stray key would sit in the form state and travel
 * as far as the `strictObject` on the server.
 */
export function carryIntoSchema(
  schema: MITSFormSchema,
  text: CarryText,
): Record<string, unknown> {
  const title = text.title.trim();
  const description = text.description.trim();

  const fields = resolveFields(schema);
  const longText = fields.filter((field) => field.widget === "textarea");
  const shortText = fields.filter((field) => field.widget === "text");
  const fileField = fields.find((field) => field.widget === "file");

  const out: Record<string, unknown> = {};

  if (longText.length > 0) {
    const target = longText[0];
    const short = shortText[0];

    if (short) {
      if (title !== "") out[short.name] = clamp(title, short.schema.maxLength);
      if (description !== "") out[target.name] = description;
    } else {
      // No short field to put the title in — so it goes above the description
      // rather than nowhere.
      const joined = [title, description].filter(Boolean).join("\n\n");
      if (joined !== "") out[target.name] = joined;
    }
  } else if (shortText.length > 0) {
    /*
     * No long field at all. The first short one carries everything it can hold,
     * clamped to its own `maxLength` — over-filling it would show a form that is
     * invalid before the reporter has touched it.
     */
    const joined = [title, description].filter(Boolean).join(" — ");
    if (joined !== "") {
      out[shortText[0].name] = clamp(joined, shortText[0].schema.maxLength);
    }
  }

  if (fileField && text.files.length > 0) {
    const limit = fileField.schema.maxItems;
    out[fileField.name] =
      typeof limit === "number" ? text.files.slice(0, limit) : text.files;
  }

  return out;
}

/** Nothing is truncated silently to *nothing*: an absent limit means no limit. */
function clamp(value: string, max: number | undefined): string {
  if (typeof max !== "number" || max <= 0) return value;
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Whether taking a suggestion would carry anything at all.
 *
 * The alert above the prefilled form claims values were carried over; on a form
 * with no free-text field and no attachment field that claim would be false, and
 * a notice about something that did not happen is worse than no notice.
 */
export function carriesAnything(
  schema: MITSFormSchema,
  text: CarryText,
): boolean {
  return Object.keys(carryIntoSchema(schema, text)).length > 0;
}
