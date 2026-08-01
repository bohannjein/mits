import "server-only";

/* ──────────────────────────────────────────────────────────────────────────
   One computation per interval, however many agents are watching.

   `collectAnalytics` is nine aggregations over the ticket table, the comments and
   the audit log — the most expensive thing MITS asks SQLite to do. The panel
   auto-refreshes, and the interval is per person: six agents on a five-second
   setting is seventy-two full passes a minute over the same rows, producing the
   same numbers.

   This makes it one per interval. The cache key is the resolved range, so two
   agents looking at "last 30 days, daily" share a result and the one who switched
   to "today" gets their own.

   **Keyed on the range, not on the user.** Deliberate, and it is only safe
   because these figures are not scoped: `/api/analytics` is agent-gated as a
   whole, and every caller who gets past that guard sees the same numbers. If a
   per-reporter view of this panel is ever added, the key has to grow a user id —
   sharing an entry across scopes would be a disclosure rather than a stale
   reading.

   **In-process, not Redis.** MITS is a two-container stack with a SQLite file;
   adding a cache server to protect a database that lives on the same disk would
   be more moving parts than the problem has. The cost of several workers each
   holding their own copy is several computations per interval instead of one —
   still bounded, and still a fraction of one per request.
   ────────────────────────────────────────────────────────────────────────── */

interface Entry {
  value: unknown;
  /** Epoch millis after which it is no longer served. */
  expires: number;
}

/*
 * On `globalThis` for the same reason the realtime bus is: the dev server
 * re-evaluates modules on edit, and a plain module-level Map would be silently
 * replaced by an empty one on every save — which looks like the cache never
 * working and is impossible to tell apart from a bug in the TTL.
 */
const globalRef = globalThis as typeof globalThis & {
  __mitsAnalyticsCache?: Map<string, Entry>;
};

const store = (globalRef.__mitsAnalyticsCache ??= new Map<string, Entry>());

/**
 * How long a result is served before it is recomputed.
 *
 * Thirty seconds is chosen against the panel's own fastest refresh, which is five:
 * an agent watching a live dashboard sees numbers that are at most half a minute
 * behind, and the database is asked at most twice a minute. Going shorter buys
 * accuracy nobody is reading a ticket count to that precision for; going longer
 * makes the manual refresh button the only way to see a change one just caused.
 */
const TTL_MS = 30_000;

/**
 * A hard cap on distinct entries.
 *
 * The key includes a custom date range, which a URL can carry arbitrarily many
 * of — without a cap, a script hitting `/api/analytics?from=…` in a loop would
 * grow this map until the process died. Evicting the oldest is enough: the
 * working set is a handful of presets.
 */
const MAX_ENTRIES = 64;

/**
 * Serve from the cache, or compute and remember.
 *
 * `compute` is synchronous because `collectAnalytics` is — better-sqlite3 is a
 * blocking driver. That also removes the question of what two concurrent misses
 * should do: they cannot happen, because nothing yields between the miss and the
 * write.
 */
export function cachedAnalytics<T>(key: string, compute: () => T): T {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expires > now) return hit.value as T;

  const value = compute();

  if (store.size >= MAX_ENTRIES) {
    // Insertion order — the oldest key is the first one out.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: now + TTL_MS });

  return value;
}

/**
 * Throw the whole cache away.
 *
 * What the panel's refresh button does. **Everything, not just the key being
 * asked for**: somebody pressing refresh has just changed something and wants to
 * see it, and they are as likely to switch the range straight afterwards as not.
 * Clearing one entry would leave the next tab over on a stale number that the
 * button appeared to have fixed.
 *
 * Cheap enough not to think about — the map holds at most sixty-four results.
 */
export function invalidateAnalytics(): void {
  store.clear();
}

/** For the cache key. Stable field order, so two equal ranges hash the same. */
export function analyticsCacheKey(parts: {
  from: string;
  to: string;
  granularity: string;
  widgets: string;
}): string {
  return `${parts.from}|${parts.to}|${parts.granularity}|${parts.widgets}`;
}

/** Entry count, for the admin health card. */
export function analyticsCacheSize(): number {
  return store.size;
}

export const ANALYTICS_CACHE_TTL_MS = TTL_MS;
