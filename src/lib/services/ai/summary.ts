import "server-only";

import { z } from "zod";

import { getAISettings } from "@/lib/ai-settings";
import { completeJson } from "@/lib/services/ai/provider";
import { isAIFeatureOn, type TicketComment, type MITSTicket } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Summarising a long ticket for whoever picks it up next.

   Three questions, always the same three: what is broken, what has been tried,
   what is it waiting on. A free-form summary of a support thread reads like the
   thread, only shorter — the value is in the *structure*, because an agent taking
   over at 08:00 is scanning for exactly those three answers.

   **Never stored.** Generated on demand, shown, forgotten. A stored summary is
   stale the moment the next reply arrives, and a stale summary is worse than none:
   it is confidently wrong about the current state, which is the one thing the
   agent is reading it for.

   **The thread goes out as text.** Internal notes included, because the point is
   to brief a colleague and the notes are half of what has been tried — the caller
   is an agent-only route. Worth knowing before switching this on with a cloud
   provider: it is the one feature that sends the full conversation.
   ────────────────────────────────────────────────────────────────────────── */

/** Below this a thread is faster to read than to summarise. */
export const SUMMARY_MIN_MESSAGES = 4;

/** Characters of conversation sent. Roughly the last hour of a busy ticket. */
const MAX_CONTEXT_CHARS = 12_000;

export const TicketSummarySchema = z.object({
  /** What the customer's problem actually is, in one or two sentences. */
  problem: z.string().max(600),
  /** What has been tried already. Empty when nothing has. */
  steps: z.array(z.string().max(300)).max(8),
  /** Who or what the ticket is waiting on right now. */
  waitingOn: z.string().max(300),
});
export type TicketSummary = z.infer<typeof TicketSummarySchema>;

export class SummaryError extends Error {}

/** Markup out, whitespace collapsed — the model gets text, not a document. */
function plain(comment: TicketComment): string {
  const body =
    comment.body_format === "html"
      ? comment.body.replace(/<[^>]+>/g, " ")
      : comment.body;
  return body.replace(/\s+/g, " ").trim();
}

/**
 * Summarise a conversation.
 *
 * Throws rather than returning null on a provider failure: this runs because
 * somebody pressed a button, and a button that silently does nothing is the worst
 * of the available outcomes.
 */
export async function summariseTicket(
  ticket: MITSTicket,
  comments: TicketComment[],
): Promise<TicketSummary> {
  const settings = getAISettings();
  if (!isAIFeatureOn(settings, "summary")) {
    throw new SummaryError("Die Zusammenfassung ist nicht aktiviert.");
  }
  if (comments.length < SUMMARY_MIN_MESSAGES) {
    throw new SummaryError("Der Verlauf ist zu kurz für eine Zusammenfassung.");
  }

  /*
   * Newest first while filling the budget, then reversed.
   *
   * Truncating from the front would drop the current state — which is what
   * `waitingOn` is asking about — in favour of an opening message the summary can
   * mostly infer. Dropping the oldest middle instead keeps both ends.
   */
  const picked: string[] = [];
  let budget = MAX_CONTEXT_CHARS;

  for (const comment of [...comments].reverse()) {
    const role = comment.visibility === "internal"
      ? "Interne Notiz"
      : comment.author_is_agent
        ? "Agent"
        : "Kunde";
    const line = `${role} (${comment.author_name}): ${plain(comment)}`;
    if (line.length > budget) break;
    budget -= line.length;
    picked.push(line);
  }

  const transcript = picked.reverse().join("\n\n");

  const answer = await completeJson(settings, {
    system:
      "Du fasst IT-Support-Verläufe für Agenten zusammen. Antworte auf Deutsch, sachlich, ohne Höflichkeitsfloskeln. Erfinde nichts: was im Verlauf nicht steht, lässt du weg.",
    prompt: [
      `Ticket: ${ticket.title}`,
      "",
      "Verlauf:",
      transcript,
      "",
      "Fasse zusammen: Was ist das Problem? Was wurde bereits versucht? Worauf oder auf wen wird gerade gewartet?",
    ].join("\n"),
    schemaName: "mits_ticket_summary",
    schema: {
      type: "object",
      properties: {
        problem: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        waitingOn: { type: "string" },
      },
      // All three required, and `additionalProperties: false`: OpenAI's strict
      // mode rejects a schema with optional keys, and a model that may omit a
      // field will omit the one it found hardest — usually `waitingOn`.
      required: ["problem", "steps", "waitingOn"],
      additionalProperties: false,
    },
  });

  const parsed = TicketSummarySchema.safeParse(answer);
  if (!parsed.success) {
    throw new SummaryError(
      "Die Antwort des Modells hatte nicht die erwartete Struktur.",
    );
  }

  return parsed.data;
}
