/* ──────────────────────────────────────────────────────────────────────────
   Tag shapes.

   Split out of `routing.ts` because that module is `server-only` — it talks to a
   provider — and these three are needed in two other places: the ticket header
   renders them, and the offline suite checks them.

   Normalisation is the part worth testing. A model produces `VPN`, `vpn` and
   `VPN-Zugang` across three tickets about the same thing, and three spellings of
   one label group nothing at all — which is the entire value of having labels.
   ────────────────────────────────────────────────────────────────────────── */

/** How many labels a ticket may collect. Three is a glance; ten is a tag cloud. */
export const MAX_TAGS = 3;

/** `passt-eher:<id>` is a routing hint, not a topic. Rendered differently. */
export const ROUTING_TAG_PREFIX = "passt-eher:";

export const isRoutingHint = (tag: string): boolean =>
  tag.startsWith(ROUTING_TAG_PREFIX);

/**
 * Clean a model's labels into something a badge row can hold.
 *
 * Lowercased, spaces hyphenated, punctuation removed, duplicates collapsed. The
 * cap is applied last so a list of eight suggestions yields the first three
 * *distinct* ones rather than three that might be the same word twice.
 */
export function normaliseTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of raw) {
    const tag = entry
      .trim()
      .replace(/^#/, "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "");

    if (tag.length < 2 || tag.length > 24 || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }

  return out;
}
