import {
  PRIORITY_RANK,
  STATUS_RANK,
  TicketPriorityValues,
  TicketStatus,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Column sorting for the ticket tables.

   Two decisions worth stating.

   **The sort lives in the URL, not in component state.** A clicked header
   produces a link, the page re-renders on the server, and the result is
   shareable, bookmarkable and survives the back button — the same reasoning that
   kept the search a `method="get"` form instead of an API route. It also keeps
   `TicketTable` a server component, which is what lets the relative age be
   computed once during the render instead of after hydration.

   **The SQL comes from a whitelist here, never from the query string.** `ORDER BY`
   cannot be parameterised in SQLite, so a key that reached the statement
   unvalidated would be string-concatenated SQL injection. `SORT_SQL` is the only
   place an expression exists, and `parseTicketSort` can only ever return one of
   its keys.

   No `server-only`: the table builds hrefs from these and the offline suite checks
   the expressions. Nothing here touches the database.
   ────────────────────────────────────────────────────────────────────────── */

export const TICKET_SORT_KEYS = [
  "number",
  "title",
  "reporter",
  "owner",
  "status",
  "priority",
  "age",
] as const;
export type TicketSortKey = (typeof TICKET_SORT_KEYS)[number];

export type SortDirection = "asc" | "desc";

export interface TicketSort {
  key: TicketSortKey;
  dir: SortDirection;
}

/**
 * Newest first.
 *
 * `age` descending means "largest `created_at`", which is the most recent ticket —
 * the queue's default, and the one an agent wants when they arrive.
 */
export const DEFAULT_TICKET_SORT: TicketSort = { key: "age", dir: "desc" };

/** Build a `CASE … END` that maps stored values to a rank. */
function rankCase(column: string, ranks: Record<string, number>): string {
  const branches = Object.entries(ranks)
    .map(([value, rank]) => `WHEN '${value}' THEN ${rank}`)
    .join(" ");
  // Unknown values sort last rather than first: a row carrying a value this build
  // does not know is the odd one out, and burying it at the top of every list
  // would make it look like the most urgent thing in the queue.
  return `CASE ${column} ${branches} ELSE 99 END`;
}

/**
 * The expression each key sorts on. Table-qualified, because `searchTickets`
 * joins `user` for the owner name and both tables have a `name` column.
 *
 * `owner` sorts on the resolved display name and puts unassigned rows last in
 * either direction — "nobody" is not a name, and a block of empty cells at the top
 * of a list sorted by owner reads as a broken query.
 */
export const SORT_SQL: Record<TicketSortKey, string> = {
  number: "mits_ticket.ticket_number",
  // NOCASE, or every lowercase title lands after every uppercase one.
  title: "mits_ticket.title COLLATE NOCASE",
  reporter: "mits_ticket.created_by_email COLLATE NOCASE",
  owner:
    "mits_ticket.assigned_to IS NULL, COALESCE(NULLIF(owner.name, ''), owner.email) COLLATE NOCASE",
  status: rankCase("mits_ticket.status", STATUS_RANK),
  priority: rankCase("mits_ticket.priority", PRIORITY_RANK),
  age: "mits_ticket.created_at",
};

export function isTicketSortKey(value: unknown): value is TicketSortKey {
  return (
    typeof value === "string" &&
    (TICKET_SORT_KEYS as readonly string[]).includes(value)
  );
}

/**
 * The sort a request asks for, or the default.
 *
 * Anything unrecognised falls back rather than erroring, matching how
 * `parseTicketQuery` treats a bad filter: a stale bookmark should show a list, not
 * a stack trace.
 */
export function parseTicketSort(
  sort: string | string[] | undefined,
  dir: string | string[] | undefined,
): TicketSort {
  const key = Array.isArray(sort) ? sort[0] : sort;
  const direction = Array.isArray(dir) ? dir[0] : dir;

  return {
    key: isTicketSortKey(key) ? key : DEFAULT_TICKET_SORT.key,
    dir: direction === "asc" ? "asc" : direction === "desc" ? "desc" : DEFAULT_TICKET_SORT.dir,
  };
}

/**
 * `ORDER BY` for a sort, with a tiebreaker.
 *
 * The second term is not decoration: sorting by status alone leaves rows within one
 * status in whatever order SQLite happens to return, and that order can differ
 * between two renders of the same page — a list that reshuffles when nothing
 * changed. `id` is the final tiebreaker because it is unique and `created_at` is
 * not (two tickets filed in the same millisecond are rare, not impossible).
 */
export function orderByFor(sort: TicketSort): string {
  const direction = sort.dir === "asc" ? "ASC" : "DESC";
  const primary = SORT_SQL[sort.key]
    .split(", ")
    .map((term) => `${term} ${direction}`)
    .join(", ");

  if (sort.key === "age") return `${primary}, mits_ticket.id ${direction}`;
  return `${primary}, mits_ticket.created_at DESC, mits_ticket.id DESC`;
}

/**
 * Which direction a header click should ask for next.
 *
 * Clicking the active column flips it. Clicking a different one starts at the
 * direction that reads as "most interesting first" for that column rather than
 * always ascending: newest tickets, highest priority and earliest lifecycle stage
 * are what somebody clicking those headers is looking for, and making them click
 * twice for it is a worse default than picking correctly the first time.
 */
const FIRST_CLICK: Record<TicketSortKey, SortDirection> = {
  number: "desc",
  title: "asc",
  reporter: "asc",
  owner: "asc",
  status: "asc",
  priority: "desc",
  age: "desc",
};

export function nextDirection(
  current: TicketSort,
  key: TicketSortKey,
): SortDirection {
  if (current.key !== key) return FIRST_CLICK[key];
  return current.dir === "asc" ? "desc" : "asc";
}

/**
 * The href a header links to: the current query with `sort` and `dir` replaced.
 *
 * Every other parameter is carried through, so sorting inside a filtered queue
 * keeps the filter and the tab. Rebuilt from the incoming params rather than from
 * a known list of keys — a filter added later would silently be dropped by the
 * latter, and a sort click that quietly widens the result set is the failure this
 * whole module is trying to avoid.
 */
export function sortHref(
  basePath: string,
  params: Record<string, string | string[] | undefined>,
  current: TicketSort,
  key: TicketSortKey,
): string {
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(params)) {
    if (name === "sort" || name === "dir") continue;
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    for (const entry of values) {
      if (entry !== "") query.append(name, entry);
    }
  }

  query.set("sort", key);
  query.set("dir", nextDirection(current, key));

  return `${basePath}?${query.toString()}`;
}

export const TICKET_SORT_LABELS: Record<TicketSortKey, string> = {
  number: "Nummer",
  title: "Titel",
  reporter: "Melder",
  owner: "Besitzer",
  status: "Status",
  priority: "Priorität",
  age: "Alter",
};

/** Guards the CASE builders above against a value that has no rank. */
export const SORTABLE_ENUM_COVERAGE = {
  status: TicketStatus.options,
  priority: TicketPriorityValues,
} as const;
