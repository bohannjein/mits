import type { NotificationKind } from "@/lib/notifications";

/* ──────────────────────────────────────────────────────────────────────────
   "Das ist passiert, während du weg warst" — the arithmetic half.

   No `server-only`. Three callers: the digest route, the AI wrapper that falls
   back to it, and the offline suite in `scripts/verify-forms.mts`. Same reason
   as `lib/csv.ts` and `lib/services/ai/tags.ts`.

   **This is the answer, and the model only rewrites it.** Counting three replies
   and one assignment is not something a language model is needed for, and making
   the digest depend on one would mean an instance with no model configured gets
   twelve toasts instead of a summary — which is the situation the feature exists
   to fix. The model is switched on to make the sentence read better, not to make
   the feature work.
   ────────────────────────────────────────────────────────────────────────── */

export interface DigestEvent {
  kind: NotificationKind;
  title: string;
  description: string;
}

export interface NotificationDigest {
  /** One line, shown as the toast title. */
  headline: string;
  /** Two or three lines under it. Empty is allowed and renders as nothing. */
  summary: string;
  /** How many events it stands for, so the toast can say so. */
  count: number;
}

const KIND_NOUN: Record<NotificationKind, [singular: string, plural: string]> = {
  reply: ["neue Antwort", "neue Antworten"],
  ticket: ["neues Ticket im Pool", "neue Tickets im Pool"],
  assigned: ["Ticket dir zugewiesen", "Tickets dir zugewiesen"],
  reminder: ["fällige Erinnerung", "fällige Erinnerungen"],
};

/** German enumeration: "a, b und c". */
function joinParts(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}`;
}

/**
 * Count by kind and say so.
 *
 * Deterministic, and that is a feature rather than a limitation: this text is
 * also what a reader sees when the model is unreachable, so it has to be correct
 * and complete on its own. It counts what is there and claims nothing else.
 */
export function deterministicDigest(events: DigestEvent[]): NotificationDigest {
  const counts = new Map<NotificationKind, number>();
  for (const event of events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }

  // Fixed order rather than insertion order, so the same set of events always
  // produces the same sentence — otherwise two polls a second apart read as two
  // different things having happened.
  const parts: string[] = [];
  for (const kind of ["reply", "ticket", "assigned"] as const) {
    const count = counts.get(kind);
    if (!count) continue;
    const [singular, plural] = KIND_NOUN[kind];
    parts.push(`${count} ${count === 1 ? singular : plural}`);
  }

  /*
   * Up to three examples, and only the ticket titles.
   *
   * A digest that lists nothing is a number somebody has to click to act on; one
   * that lists everything is the stack it replaced. Three is enough to recognise
   * "ah, that outage" without the toast growing a scrollbar.
   */
  const examples = events
    .slice(0, 3)
    .map((event) => event.description.split(" — ")[0].trim())
    .filter((line) => line !== "");

  return {
    headline: `Während deiner Abwesenheit: ${joinParts(parts)}`,
    /*
     * One per line, not joined with a middle dot.
     *
     * The dot was the first version and it is ambiguous here: a pool
     * notification's own description already contains one, between the ticket
     * number and the title, so three examples read as five things separated by
     * the same character. A newline cannot collide with the content.
     */
    summary: examples.join("\n"),
    count: events.length,
  };
}
