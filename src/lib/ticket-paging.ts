/* ──────────────────────────────────────────────────────────────────────────
   Paging arithmetic for the ticket lists.

   Small, and every mistake in it is quiet: an unclamped page produces an empty
   table that reads as "no tickets match", and a negative offset is a SQLite error
   on a URL somebody bookmarked.

   Its own file, with no `server-only`, for the same reason `ticket-sort.ts` has
   none — three callers: the pages, the pager component, and the offline suite.
   `lib/tickets.ts` is server-only and would put all of this out of reach of the
   one place that can check the boundaries.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Rows per page.
 *
 * Fifty because that is roughly one screen worth scrolling once, and because the
 * alternative — the flat `LIMIT 500` this replaced — silently hid everything past
 * the five hundredth ticket. A truncated list that says nothing about being
 * truncated is the failure a pager exists to remove.
 */
export const TICKETS_PER_PAGE = 50;

/**
 * A page number out of a query string, clamped to something usable.
 *
 * Zero, negatives, fractions and prose all become page one. Each of them would
 * otherwise reach `OFFSET` as a negative or a `NaN`.
 */
export function toPage(value: unknown): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/** How many pages a total needs. At least one, so an empty list still has page 1. */
export const pageCount = (total: number, perPage = TICKETS_PER_PAGE): number =>
  Math.max(1, Math.ceil(total / perPage));

/**
 * The offset for a page, clamped to the last page that exists.
 *
 * Clamping rather than returning an out-of-range offset matters after a filter
 * narrows the result: an agent on page four whose list just shrank to two pages
 * would otherwise get an empty table, which reads as "no tickets match" rather
 * than as "you are past the end".
 */
export function pageOffset(
  page: number,
  total: number,
  perPage = TICKETS_PER_PAGE,
): number {
  const last = pageCount(total, perPage);
  return (Math.min(Math.max(1, page), last) - 1) * perPage;
}

/** Numbered links either side of the current page before the list collapses. */
const WINDOW = 2;

/**
 * Which page numbers to render. `null` is an ellipsis.
 *
 * The first and last page are always present, so jumping to the end never needs
 * two clicks. Everything else is a window around the current page — a hundred
 * numbered links is not navigation.
 */
export function pagesToShow(page: number, pageCount: number): (number | null)[] {
  const wanted = new Set<number>([1, pageCount]);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= pageCount) wanted.add(candidate);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];

  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1];
    // A single missing page renders as itself: an ellipsis hiding exactly one
    // number is longer than the number.
    if (previous !== undefined && value - previous === 2) out.push(previous + 1);
    else if (previous !== undefined && value - previous > 2) out.push(null);
    out.push(value);
  }

  return out;
}
