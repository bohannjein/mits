import { resolveFields } from "@/lib/forms/schema-to-zod";
import type { MITSFormSchema, MITSTicket, TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The reporter's opening message, as a bubble.

   A conversation that starts with the agent's first reply reads as though nobody
   asked anything. What the reporter actually wrote sat in a metadata panel beside
   the thread, which is the wrong place for the one message the whole ticket is
   about.

   **Derived, never stored.** The text is already in `payload`, and writing it a
   second time as a comment would give the ticket two copies of its own opening —
   one searchable, one displayed, drifting apart the first time somebody corrects
   an answer. This builds a `TicketComment`-shaped value at render time instead;
   nothing persists it and no id in the database matches it.

   **Except for mail.** A mailed-in ticket already carries the sender's message as
   a real first comment, in sanitised HTML so its formatting survives. Synthesising
   on top of that would show the same message twice, once flattened. `source` is
   what distinguishes the two, which is why `createTicket` will not let a client
   claim `email`.

   No `server-only`: the shape is pure and the boundaries are worth checking in the
   offline suite. A wrong field pick here shows the reporter a bubble containing
   their cost centre instead of their problem.
   ────────────────────────────────────────────────────────────────────────── */

/** The id prefix. Deliberately not a UUID — nothing should look up this comment. */
const SYNTHETIC_PREFIX = "opening:";

export const isSyntheticOpening = (commentId: string): boolean =>
  commentId.startsWith(SYNTHETIC_PREFIX);

/**
 * Property names that are the message rather than an answer about it.
 *
 * Ordered by preference. Every built-in schema uses one of these for its free-text
 * field, and a schema that uses none falls through to the heuristic below.
 */
const MESSAGE_FIELDS = ["description", "detail", "message", "body", "note"];

/** Below this a value is a label or a code, not somebody describing a problem. */
const MIN_MESSAGE_CHARS = 20;

/**
 * Which payload property holds the reporter's own words.
 *
 * Three passes, narrowing to widening. The known names first, because they are
 * unambiguous; then any field the schema renders as a textarea; then the longest
 * string as a last resort. The last one is a guess and is bounded by
 * `MIN_MESSAGE_CHARS` so it cannot pick a serial number.
 *
 * Returns null rather than guessing badly — a ticket whose opening bubble would be
 * a room number is better off with no opening bubble.
 */
export function openingFieldName(
  payload: Record<string, unknown>,
  schema?: MITSFormSchema,
): string | null {
  const text = (name: string): string => {
    const value = payload[name];
    return typeof value === "string" ? value.trim() : "";
  };

  for (const name of MESSAGE_FIELDS) {
    if (text(name).length >= MIN_MESSAGE_CHARS) return name;
  }

  if (schema) {
    for (const field of resolveFields(schema)) {
      if (field.widget !== "textarea") continue;
      if (text(field.name).length >= MIN_MESSAGE_CHARS) return field.name;
    }
  }

  let longest: { name: string; length: number } | null = null;
  for (const [name, value] of Object.entries(payload)) {
    if (typeof value !== "string") continue;
    const length = value.trim().length;
    if (length < MIN_MESSAGE_CHARS) continue;
    if (!longest || length > longest.length) longest = { name, length };
  }

  return longest?.name ?? null;
}

/**
 * The opening bubble for this ticket, or null when there is nothing to show.
 *
 * `reporterName` is resolved by the caller — the ticket row only carries an
 * address, and a bubble headed by an email is colder than one headed by a name.
 */
export function openingMessageFor(
  ticket: MITSTicket,
  schema: MITSFormSchema | undefined,
  reporterName: string,
): TicketComment | null {
  // The mail ingest already wrote one. See the note at the top.
  if (ticket.source === "email") return null;

  const name = openingFieldName(ticket.payload, schema);
  if (!name) return null;

  const body = String(ticket.payload[name] ?? "").trim();
  if (!body) return null;

  return {
    id: `${SYNTHETIC_PREFIX}${ticket.id}`,
    ticket_id: ticket.id,
    author_id: ticket.created_by,
    author_email: ticket.created_by_email,
    author_name: reporterName || ticket.created_by_email,
    // Always the customer surface. The opening message is the reporter's, even on
    // a ticket an agent filed for somebody else — the bubble says who spoke, and
    // `created_by_email` is who that was.
    author_is_agent: false,
    visibility: "public",
    body,
    // Plain text: the payload holds what a form field collected, never markup.
    // Handing it to the HTML branch would render a literal `<b>` as formatting.
    body_format: "text",
    created_at: ticket.created_at,
    /*
     * Never edited, because there is nothing here to edit.
     *
     * This bubble is derived from the payload at render time, so "changing" it
     * would mean rewriting a form answer — and that answer is also what the ticket
     * is searched and reported on. `isSyntheticOpening` is what the message
     * actions check to leave it alone.
     */
    edited_at: null,
  };
}

/**
 * The structured answers minus the one now shown as the opening bubble.
 *
 * Without this the detail page states the reporter's problem twice, once as a
 * message and once as a labelled field directly beside it.
 */
export function fieldsBesidesOpening<T extends { name: string }>(
  fields: T[],
  openingName: string | null,
): T[] {
  return openingName === null
    ? fields
    : fields.filter((field) => field.name !== openingName);
}

/** One answer, ready to render: what it was called and what it says. */
export interface PayloadField {
  name: string;
  label: string;
  text: string;
}

/**
 * One payload value as a line of text.
 *
 * Was a private copy in each of the two ticket pages, which is two places for the
 * same answer to start reading differently — and they are shown side by side to a
 * reporter and an agent talking to each other.
 *
 * An object that is not an array yields nothing: the only ones in a payload are
 * attachment descriptors, and those belong to the file list rather than to a
 * labelled line saying `[object Object]`.
 */
export function formatPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    return value
      .map((entry) =>
        entry && typeof entry === "object" && "name" in entry
          ? String((entry as { name: unknown }).name)
          : String(entry),
      )
      .join(", ");
  }
  if (typeof value === "object") return "";
  return String(value).trim();
}

/**
 * The answers worth showing, labelled, in payload order.
 *
 * Empty values drop out — a schema with optional fields would otherwise render a
 * column of labels with nothing beside them, which reads as data that failed to
 * load rather than as a question nobody answered.
 *
 * `openingName` is the field that became the bubble, or null when none did. A
 * mailed ticket passes null on purpose: its opening message is a stored comment,
 * so nothing was removed from the list.
 */
export function payloadFields(
  payload: Record<string, unknown>,
  labels: Map<string, string>,
  openingName: string | null,
): PayloadField[] {
  return fieldsBesidesOpening(
    Object.entries(payload).map(([name, value]) => ({
      name,
      label: labels.get(name) ?? name,
      text: formatPayloadValue(value),
    })),
    openingName,
  ).filter((field) => field.text !== "");
}
