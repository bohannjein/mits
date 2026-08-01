import "server-only";

import { z } from "zod";

import { getAISettings } from "@/lib/ai-settings";
import { db } from "@/lib/db/sqlite";
import { AIProviderError, completeJson } from "@/lib/services/ai/provider";
import {
  MAX_TAGS,
  ROUTING_TAG_PREFIX,
  normaliseTags,
} from "@/lib/services/ai/tags";
import { openingFieldName } from "@/lib/ticket-opening";
import {
  isAIFeatureOn,
  type MITSFormSchema,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Labelling a new ticket, and saying when it went to the wrong place.

   Two outputs from one call, because they come from the same reading of the same
   text and two calls would double the latency of filing a ticket for no gain.

   **It runs after the ticket exists and never blocks it.** A reporter pressing
   "Absenden" must not wait on a model, and a model that is down must not stop a
   ticket being filed. `tagTicketInBackground` therefore returns immediately and
   swallows everything — the worst outcome is a ticket without labels, which is
   what every ticket looked like before this existed.

   **The routing hint is a suggestion, never an action.** It is stored as a tag
   the agent can read, not as a re-categorisation. A model that silently moved
   tickets between queues would be moving them wrongly some of the time, and
   nobody would know which ones.
   ────────────────────────────────────────────────────────────────────────── */

/** Characters of the reporter's text sent for labelling. */
const MAX_CONTEXT_CHARS = 2000;

const RoutingSchema = z.object({
  tags: z.array(z.string().min(2).max(24)).max(8),
  /** Id of a better-fitting form schema, or the empty string. */
  suggestedSchemaId: z.string().max(64),
});

/** The reporter's own words out of a payload, bounded. */
function ticketText(ticket: MITSTicket): string {
  const field = openingFieldName(ticket.payload);
  const body = field ? String(ticket.payload[field] ?? "") : "";
  return `${ticket.title}\n\n${body}`.slice(0, MAX_CONTEXT_CHARS);
}

/**
 * Label a ticket and note a better category, if the model sees one.
 *
 * Writes directly rather than going through a mutator: tags are not an audited
 * decision by a person, and an audit row per ticket saying "a model added three
 * words" would bury the history that matters.
 */
export async function tagTicket(
  ticket: MITSTicket,
  catalog: MITSFormSchema[],
): Promise<string[]> {
  const settings = getAISettings();
  if (!isAIFeatureOn(settings, "routing")) return [];

  const answer = await completeJson(settings, {
    system:
      "Du verschlagwortest IT-Support-Tickets. Antworte auf Deutsch. Vergib ein bis drei kurze Schlagworte, jeweils ein Wort, die das Thema benennen — kein Ausdruck von Dringlichkeit, keine Höflichkeit.",
    prompt: [
      ticketText(ticket),
      "",
      "Verfügbare Formulare:",
      ...catalog.map((entry) => `- ${entry.id}: ${entry.title} (${entry.category})`),
      "",
      `Aktuell gewählt: ${ticket.form_schema_id ?? "keines"}.`,
      "Wenn ein anderes Formular klar besser passt, nenne dessen id in suggestedSchemaId, sonst einen leeren String.",
    ].join("\n"),
    schemaName: "mits_ticket_routing",
    schema: {
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
        suggestedSchemaId: { type: "string" },
      },
      required: ["tags", "suggestedSchemaId"],
      additionalProperties: false,
    },
  });

  const parsed = RoutingSchema.safeParse(answer);
  if (!parsed.success) return [];

  const tags = normaliseTags(parsed.data.tags);

  /*
   * A suggested id has to be one MITS actually offers, and not the one already
   * chosen. Checked against the catalogue rather than trusted: a hallucinated id
   * would render as a suggestion to switch to a form that does not exist, and an
   * agent would go looking for it.
   */
  const suggestion = parsed.data.suggestedSchemaId.trim();
  const better =
    suggestion !== "" &&
    suggestion !== ticket.form_schema_id &&
    catalog.find((entry) => entry.id === suggestion);

  const finalTags = better
    ? [...tags, `${ROUTING_TAG_PREFIX}${better.id}`].slice(0, MAX_TAGS + 1)
    : tags;

  db.prepare("UPDATE mits_ticket SET tags = ? WHERE id = ?").run(
    JSON.stringify(finalTags),
    ticket.id,
  );

  return finalTags;
}

/**
 * Fire and forget, for the ticket-creation path.
 *
 * Deliberately not awaited by the caller and deliberately silent. Filing a ticket
 * is the operation; labelling it is a nicety, and a nicety must not add its
 * latency or its failure modes to the operation.
 *
 * The trade-off is stated rather than hidden: on a serverless host the process can
 * be frozen when the response is returned, and the update would then never land.
 * MITS is a long-running Node container, so the write completes — and if it does
 * not, the ticket simply has no tags.
 */
export function tagTicketInBackground(
  ticket: MITSTicket,
  catalog: MITSFormSchema[],
): void {
  void tagTicket(ticket, catalog).catch((error) => {
    if (error instanceof AIProviderError) {
      console.info("[MITS] Verschlagwortung übersprungen:", error.message);
      return;
    }
    console.error("[MITS] Verschlagwortung fehlgeschlagen:", error);
  });
}

