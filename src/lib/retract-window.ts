/* ──────────────────────────────────────────────────────────────────────────
   How long a message can be taken back.

   No `server-only`: three callers — `lib/ticket-comments.ts`, which enforces it,
   the countdown in `MessageActions`, which displays it, and the offline suite.
   Same arrangement as `lib/csv.ts` and `lib/services/ai/tags.ts`.

   One number in one place, because the two sides have to agree. A button that
   offers three more seconds than the server allows produces a refusal that reads
   as a bug in the button.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Fifteen seconds.
 *
 * Long enough to notice the wrong ticket, the wrong tone or the missing word;
 * short enough that nobody can be replying to it yet. Deliberately not
 * configurable — an admin who set it to ten minutes would be offering to delete a
 * message somebody has already acted on, and the promise only means anything if
 * every reader can assume the same one.
 */
export const RETRACT_WINDOW_SECONDS = 15;

export const RETRACT_WINDOW_MS = RETRACT_WINDOW_SECONDS * 1000;

/** Whether a message written at `createdAt` may still be taken back. */
export function withinRetractWindow(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() < RETRACT_WINDOW_MS;
}
