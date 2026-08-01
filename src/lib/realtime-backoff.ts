/* ──────────────────────────────────────────────────────────────────────────
   Reconnect timing.

   No `server-only` and no React: two callers — the provider and the offline suite
   in `scripts/verify-forms.mts`. Same reason as `lib/csv.ts`.

   Worth testing rather than eyeballing, because both failure modes are invisible
   in development. Too aggressive and a restarting server is met with a
   reconnection storm from every open tab at the exact moment it has least to
   spare; too timid and somebody's laptop waking from sleep sits disconnected for
   a minute with a green dot's worth of confidence.
   ────────────────────────────────────────────────────────────────────────── */

/** First retry. Short enough that a server restart is invisible. */
const BASE_MS = 1000;

/** Ceiling. A tab left open overnight retries once a minute, not once an hour. */
const MAX_MS = 30_000;

/**
 * Exponential backoff with jitter, in milliseconds.
 *
 * The jitter is the part that matters and the part that gets left out: without
 * it, forty tabs disconnected by one restart all come back at 1 s, then all at
 * 2 s, then all at 4 s — a thundering herd that keeps knocking the server over in
 * the rhythm it is trying to recover in. Spreading each retry across the second
 * half of its window turns that into a smear.
 *
 * `attempt` is zero-based: 0 is the first retry after a drop.
 */
export function reconnectDelay(attempt: number, random = Math.random): number {
  const exponential = Math.min(BASE_MS * 2 ** Math.max(0, attempt), MAX_MS);
  // Between 50 % and 100 % of the window, so a delay is never shorter than half
  // the intended one — full jitter would occasionally retry almost immediately.
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export const RECONNECT_BASE_MS = BASE_MS;
export const RECONNECT_MAX_MS = MAX_MS;
