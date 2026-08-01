import "server-only";

import { z } from "zod";

import { getAISettings } from "@/lib/ai-settings";
import {
  deterministicDigest,
  type DigestEvent,
  type NotificationDigest,
} from "@/lib/notification-digest";
import { completeJson } from "@/lib/services/ai/provider";
import { isAIFeatureOn } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The model's pass over "what happened while you were away".

   **The counting already happened.** `deterministicDigest` produced a correct
   answer before this file was reached, and everything here is an attempt to say
   the same thing better. Every failure path returns that answer — a disabled
   feature, an unreachable provider, a malformed response, a timeout. There is no
   branch in which switching this on can leave somebody with less than they had.

   That is the shape the opt-in rule asks for, and it is also the honest one: a
   digest is read in the two seconds before it disappears, and a toast that says
   "Zusammenfassung nicht verfügbar" has spent those two seconds on an apology.

   What goes out is the titles and one-line previews the notification feed already
   built — the same text that would otherwise have been shown as individual
   toasts. Not the ticket bodies: this fires on a schedule rather than on a
   button, and a feature that quietly ships conversations to a cloud provider
   every time somebody comes back from lunch is not one an admin can reason about.
   ────────────────────────────────────────────────────────────────────────── */

const DigestAnswerSchema = z.object({
  headline: z.string().min(1).max(160),
  summary: z.string().max(400),
});

/** Bounded so a backlog cannot turn one toast into a large prompt. */
const MAX_EVENTS_SENT = 12;

export async function summariseNotifications(
  events: DigestEvent[],
): Promise<NotificationDigest> {
  const fallback = deterministicDigest(events);

  const settings = getAISettings();
  if (!isAIFeatureOn(settings, "digest")) return fallback;

  const lines = events
    .slice(0, MAX_EVENTS_SENT)
    .map((event) => `- ${event.title}: ${event.description}`)
    .join("\n");

  try {
    const answer = await completeJson(settings, {
      system:
        "Du fasst Benachrichtigungen eines IT-Ticketsystems für eine Person zusammen, die gerade zurück an den Platz kommt. Antworte auf Deutsch, sachlich, ohne Begrüßung und ohne Höflichkeitsfloskeln. Erfinde nichts: nenne nur, was in der Liste steht.",
      prompt: [
        `Es sind ${events.length} Benachrichtigungen aufgelaufen:`,
        "",
        lines,
        "",
        "Schreibe eine Überschrift von höchstens zehn Wörtern, die sagt, was insgesamt passiert ist, und darunter zwei bis drei knappe Sätze mit dem Wesentlichen. Nenne Zahlen, wo sie helfen.",
      ].join("\n"),
      schemaName: "mits_notification_digest",
      schema: {
        type: "object",
        properties: {
          headline: { type: "string" },
          summary: { type: "string" },
        },
        // Both required and no extra keys — OpenAI's strict mode rejects optional
        // properties, and a model given the choice drops whichever it found harder.
        required: ["headline", "summary"],
        additionalProperties: false,
      },
    });

    const parsed = DigestAnswerSchema.safeParse(answer);
    if (!parsed.success) return fallback;

    return {
      headline: parsed.data.headline,
      summary: parsed.data.summary,
      // Never the model's count. It is arithmetic we already did, and a headline
      // that says "drei Antworten" over four events is the kind of small wrongness
      // that costs the whole feature its credibility.
      count: events.length,
    };
  } catch {
    return fallback;
  }
}
