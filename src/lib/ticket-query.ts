import "server-only";

import { redirect } from "next/navigation";

import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import {
  UNASSIGNED_FILTER,
  getTicketByNumberFor,
  type TicketFilter,
} from "@/lib/tickets";
import { TicketPriority, TicketStatus, parseTicketNumber } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Turn a query string into a ticket filter.

   Shared by /tickets and /board so both interpret `?status=` identically — two
   copies of this would drift, and a filter that means something different on two
   pages is worse than no filter.

   Everything is validated against its enum rather than passed through. An unknown
   value becomes "no filter" instead of an empty result set, because a typo in a
   bookmarked URL should not look like "there are no tickets".
   ────────────────────────────────────────────────────────────────────────── */

/** Sentinel the filter form sends for "any"; must not reach the query. */
const ANY = "__any";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === ANY) return undefined;
  return trimmed;
}

/** `YYYY-MM-DD` only — anything else is dropped rather than fed into a comparison. */
function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export interface ParsedTicketQuery {
  filter: TicketFilter;
  /** Echoed back into the form controls. */
  values: {
    q?: string;
    locationId?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    from?: string;
    to?: string;
  };
  /** How many filters are narrowing the list — the free-text term is not one. */
  activeCount: number;
}

export function parseTicketQuery(
  params: RawSearchParams,
  options: { ownOnly?: boolean } = {},
): ParsedTicketQuery {
  const q = one(params.q);
  const locationId = one(params.locationId);
  const status = TicketStatus.safeParse(one(params.status)).data;
  const priority = TicketPriority.safeParse(one(params.priority)).data;

  const rawAssignee = one(params.assignedTo);
  const assignedTo =
    rawAssignee === UNASSIGNED_FILTER ? UNASSIGNED_FILTER : rawAssignee;

  const from = isoDate(one(params.from));
  const to = isoDate(one(params.to));

  const activeCount = [locationId, status, priority, assignedTo, from, to].filter(
    Boolean,
  ).length;

  /*
   * Undefined keys are omitted, not set to undefined.
   *
   * The queue merges a view preset with these filters as
   * `{ ...preset, ...filter }`. An explicit `status: undefined` in the second
   * object overwrites the preset's status and silently widens the query — the
   * "waiting" tab then shows every ticket, which reads as a working queue
   * containing the wrong rows rather than as an error.
   */
  const filter: TicketFilter = { ...(options.ownOnly ? { ownOnly: true } : {}) };
  if (q) filter.q = q;
  if (locationId) filter.locationId = locationId;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (from) filter.from = from;
  if (to) filter.to = to;

  return {
    filter,
    values: { q, locationId, status, priority, assignedTo, from, to },
    activeCount,
  };
}

/**
 * If the search term is a ticket number and that ticket is visible, go there.
 *
 * The access check happens before the redirect, and a number the caller may not
 * see falls through to the text search rather than answering 403 — otherwise the
 * number space could be probed for which tickets exist. Someone searching a
 * foreign number simply gets an empty list.
 *
 * The target world is derived from the role, not passed in: a agent jumps
 * into the agent view with its workflow panel, a reporter into their own lean
 * view. Deriving it here means a caller cannot accidentally send a reporter to
 * `/mits`, where the guard would bounce them straight back.
 *
 * Called from a page, so `redirect` throws and never returns.
 */
export function jumpToTicketNumber(term: string | undefined, user: SessionUser): void {
  if (!term) return;
  if (!isFeatureEnabled("feature_ticket_search")) return;

  const number = parseTicketNumber(term);
  if (number === null) return;

  const ticket = getTicketByNumberFor(number, user);
  if (!ticket) return;

  const base = canViewBoard(user.role) ? "/mits/tickets" : "/customer/tickets";
  redirect(`${base}/${ticket.id}`);
}
