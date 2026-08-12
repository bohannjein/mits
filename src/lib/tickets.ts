import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { canViewBoard, toRole } from "@/lib/auth/roles";
import { db, nextTicketNumber } from "@/lib/db/sqlite";
import { invalidateAnalytics } from "@/lib/services/analytics-cache";
import { publish } from "@/lib/services/realtime";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields, schemaToZod } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { isFeatureEnabled } from "@/lib/features";
import { triage } from "@/lib/services/auto-triage";
import { openingFieldName } from "@/lib/ticket-opening";
import {
  categoryLabel,
  descendantCategoryIds,
  isFilableCategory,
} from "@/lib/ticket-categories";
import { listTriageRules } from "@/lib/triage-rules";
import { UploadError, linkUploadsToTicket } from "@/lib/storage";
import {
  DEFAULT_TICKET_SORT,
  orderByFor,
  type TicketSort,
} from "@/lib/ticket-sort";
import { TICKETS_PER_PAGE } from "@/lib/ticket-paging";
import { applyStatusChange } from "@/lib/ticket-workflow";
import { defaultPriorityFor } from "@/lib/role-visibility";
import { getUserOrganizationId, isOrgAdmin } from "@/lib/user-profile";
import {
  AttachmentMetaSchema,
  MITSTicketSchema,
  normalizeCcEmails,
  OPEN_TICKET_STATUSES,
  PRIORITY_RANK,
  type MITSTicket,
  type MITSTicketDraft,
  type TicketPriority,
  type TicketStatus,
} from "@/types/mits";

// Re-exported so `lib/agent-views.ts` builds its presets from one place.
export { OPEN_TICKET_STATUSES };
// …and the paging helpers alongside the store that honours them, so a page does
// not have to know that they live in a separate, server-free module.
export { TICKETS_PER_PAGE, pageCount, pageOffset, toPage } from "@/lib/ticket-paging";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket persistence and access rules.

   Ownership is decided here, once. Callers pass the session user; there is no
   code path that takes an owner id from the request body.
   ────────────────────────────────────────────────────────────────────────── */

interface TicketRow {
  id: string;
  ticket_number: number | null;
  location_id: string | null;
  category_id: string | null;
  created_by: string;
  created_by_email: string;
  source: string;
  form_schema_id: string | null;
  title: string;
  payload: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  tags?: string | null;
  cc_emails?: string | null;
  major_incident?: number | null;
  auto_close_off?: number | null;
  /** From the LEFT JOIN on `user`. Null when unassigned or the account is gone. */
  assigned_to_name?: string | null;
  /*
   * Only `searchTickets` produces these — it is the one read that knows *who* is
   * asking, and "unread" is meaningless without that. Everywhere else they are
   * absent and the schema defaults them, which is the honest answer: a detail page
   * that rendered `unread: false` from a query that never computed it would be
   * stating something it did not check.
   */
  last_activity_at?: string | null;
  unread?: number;
  pinned?: number;
  logged_minutes?: number | null;
  awaiting_reply?: number;
}

function rowToTicket(row: TicketRow): MITSTicket {
  return MITSTicketSchema.parse({
    id: row.id,
    // Zero for a row the backfill has not reached; renders as 0, which is
    // visibly broken rather than quietly plausible.
    ticket_number: row.ticket_number ?? 0,
    location_id: row.location_id,
    category_id: row.category_id,
    source: row.source,
    form_schema_id: row.form_schema_id ?? undefined,
    title: row.title,
    payload: JSON.parse(row.payload),
    status: row.status,
    priority: row.priority,
    created_by: row.created_by,
    created_by_email: row.created_by_email,
    assigned_to: row.assigned_to,
    assigned_to_name: row.assigned_to_name ?? null,
    // Defaulted rather than trusted: a row written before the column existed has
    // no JSON in it, and a hand-edited one may have something that is not an array.
    tags: safeTags(row.tags),
    // Same defensive read as the tags beside it, and for the same two reasons:
    // a row older than the column has no JSON, and a hand-edited one may hold
    // something that is not an array of strings.
    cc_emails: safeTags(row.cc_emails),
    major_incident: row.major_incident === 1,
    auto_close_off: row.auto_close_off === 1,
    // The empty string is the SQL "no activity for this reader" sentinel — see the
    // MAX(...) expression in `searchTickets`. Passing it to `z.coerce.date()` would
    // produce an Invalid Date, which renders as "NaN" rather than as nothing.
    last_activity_at: row.last_activity_at ? row.last_activity_at : null,
    unread: row.unread === 1,
    // Same shape as `unread`: absent everywhere except `searchTickets`, and the
    // schema's default is then the honest answer rather than a claim.
    pinned: row.pinned === 1,
    awaiting_reply: row.awaiting_reply === 1,
    logged_minutes: row.logged_minutes ?? 0,
    created_at: row.created_at,
  });
}

export class TicketValidationError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "TicketValidationError";
  }
}

/**
 * Persist a draft as the given user's ticket.
 *
 * The payload is re-validated against its declared form schema even though the
 * browser already validated it: the request body is attacker-controlled, and the
 * compiled schema is `strictObject`, so unknown properties are rejected rather
 * than stored.
 */
/**
 * Server-side ingest only. **Never** populated from a request.
 *
 * An inbound mail has no session, so the ticket is filed under a configured
 * fallback account while the human who wrote it is recorded as the reporter. That
 * needs `created_by` and `created_by_email` to disagree, which no other path is
 * allowed to do — rule 7 exists because a request that could name its own owner is
 * a request that can file tickets as somebody else.
 *
 * Split from `user` and named for its one caller so the exception is visible at
 * every call site rather than hidden in an options bag. `POST /api/tickets` does
 * not pass it, and there is nothing in the draft schema that could carry it.
 */
export interface MailIngestOrigin {
  /** The human who sent it. Replies route here; visibility does not. */
  reporterEmail: string;
}

export function createTicket(
  draft: MITSTicketDraft,
  user: SessionUser,
  origin?: MailIngestOrigin,
): MITSTicket {
  const schema = getFormSchema(draft.form_schema_id);
  if (!schema) {
    throw new TicketValidationError("Unbekanntes Formular-Schema.");
  }

  /*
   * `values` is the received payload, not a client claim about it. Conditional
   * fields are re-derived here from the same answers the browser used, so a field
   * the conditions ruled out is neither required nor accepted — and a client that
   * asserts "that one was hidden" is never consulted. Without this a required field
   * behind a condition would be demanded on every submission and the form would be
   * impossible to send.
   */
  const parsed = schemaToZod(schema, {
    fileValue: "metadata",
    values: draft.payload,
  }).safeParse(draft.payload);
  if (!parsed.success) {
    throw new TicketValidationError(
      "Payload passt nicht zum Schema.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  // A location the reporter names has to exist and be usable; a stale id from a
  // cached form must not silently attach the ticket to nothing.
  if (draft.location_id && !getLocation(draft.location_id)) {
    throw new TicketValidationError("Der gewählte Standort ist unbekannt.");
  }

  /*
   * Priority is an agent's call, so a reporter's draft cannot set it.
   *
   * Enforced here rather than by leaving the control out of the intake form: the
   * form is one client of `POST /api/tickets`, and "the UI does not offer it" is
   * not a rule — anybody can post JSON. Clamped rather than rejected, because a
   * stale cached form legitimately still submits the field and a 422 for it would
   * block a ticket over a value the reporter never chose.
   *
   * Staff keep whatever they *state*: an agent filing on somebody's behalf has
   * already made the judgement this rule exists to protect. What they do not state
   * falls to the same per-role value — which is why `priority` on the draft schema
   * is optional rather than defaulted. With a default, "said medium" and "said
   * nothing" would be one value, and the configured start priority would be
   * invisible to every client that simply omits the field.
   *
   * The role is whoever files. For the mail ingest and `/api/v1/tickets` that is
   * the fallback account, so a mailed ticket starts at the priority configured for
   * *its* role — arbitrary but harmless, and an agent overrides it in one click.
   */
  const roleDefault = defaultPriorityFor(user.role);
  const priority = canViewBoard(user.role)
    ? (draft.priority ?? roleDefault)
    : roleDefault;

  /*
   * `email` is the ingest's to claim, nobody else's.
   *
   * It is not decoration: the detail page skips synthesising an opening bubble for
   * a mailed ticket, because the ingest already stored the sender's message as a
   * real first comment. A reporter who posted `source: "email"` from the portal
   * would therefore lose their own opening message out of the thread — a form
   * submission that quietly drops the thing it submitted.
   */
  const source =
    draft.source === "email" && !origin ? "legacy" : draft.source;

  /*
   * Filing: what the reporter said, and what the rules make of it.
   *
   * The reporter's choice wins. The intent tiles are exactly this — somebody
   * saying „das ist ein Notebook-Problem" — and a rule that overrode it would be
   * a machine contradicting a person who was looking at the answer. The rules
   * only fill a gap: a free-text ticket, a mailed one, a wizard form that carries
   * no category.
   *
   * `isFilableCategory` is not a formality. A cached form or a hand-built request
   * can name a category that has since been deleted, and storing that id would be
   * a ticket permanently invisible to every category filter — worse than
   * uncategorised, because the queue would show it as filed.
   */
  const triaged = triageForDraft(draft, parsed.data, schema.title);

  const categoryId =
    draft.category_id && isFilableCategory(draft.category_id)
      ? draft.category_id
      : triaged.categoryId && isFilableCategory(triaged.categoryId)
        ? triaged.categoryId
        : null;

  /*
   * A rule may raise the priority, never lower it.
   *
   * `rankOf` decides, not the enum's declaration order by accident — and the
   * comparison is against the priority computed above, which for a reporter is
   * already clamped to the default. So a rule can escalate „Server down" out of
   * `medium`, and cannot quietly demote what an agent set on the way in.
   */
  const finalPriority =
    triaged.priority && priorityRank(triaged.priority) > priorityRank(priority)
      ? triaged.priority
      : priority;

  const ticket: TicketRow = {
    id: randomUUID(),
    // Filled inside the transaction below, where the read cannot race an insert.
    ticket_number: null,
    location_id: draft.location_id,
    category_id: categoryId,
    // Ownership is always the account. Only the *display and reply* address can
    // differ, and only for the mail ingest — see `MailIngestOrigin`.
    created_by: user.id,
    created_by_email: origin?.reporterEmail.trim() || user.email,
    source,
    form_schema_id: schema.id,
    title: deriveTitle(parsed.data, schema.title),
    payload: JSON.stringify(parsed.data),
    status: "open",
    priority: finalPriority,
    assigned_to: null,
    created_at: new Date().toISOString(),
  };

  const fileIds = collectFileIds(schema, parsed.data);

  /*
   * Every key of the bound object appears here, and that is not style.
   * better-sqlite3 refuses an object with a key the statement does not name —
   * "Too many parameter values were provided" — rather than ignoring it, so
   * adding `category_id` to `TicketRow` without adding it to this list turns
   * **every** ticket creation into a 500. Two places, one change; `test:db`
   * exists because a type checker cannot see the contract between them.
   */
  const insert = db.prepare(
    `INSERT INTO mits_ticket
       (id, ticket_number, location_id, category_id, created_by, created_by_email,
        source, form_schema_id, title, payload, status, priority, assigned_to,
        created_at, tags, major_incident)
     VALUES
       (@id, @ticket_number, @location_id, @category_id, @created_by,
        @created_by_email, @source, @form_schema_id, @title, @payload, @status,
        @priority, @assigned_to, @created_at, '[]', 0)`,
  );

  // One transaction: a payload referencing a foreign or already-used attachment
  // must not leave a half-created ticket behind, and the number is allocated in
  // the same unit of work so two tickets cannot claim the same one.
  try {
    db.transaction(() => {
      ticket.ticket_number = nextTicketNumber();
      insert.run(ticket);
      linkUploadsToTicket(fileIds, ticket.id, user);
    })();
  } catch (error) {
    if (error instanceof UploadError) {
      throw new TicketValidationError(error.message);
    }
    throw error;
  }

  /*
   * A new ticket announces itself. It did not, which was a hole rather than a
   * decision: the queue only learned about it on the next fallback poll, so the
   * one event the desk most wants to see immediately was the slowest to arrive.
   *
   * `notify` as well as `queue`: "Neues Ticket im Pool" is a notification channel,
   * and without the signal its watcher waited out its own interval. Both carry no
   * content — `listNotifications` still decides who is told anything.
   *
   * After the transaction, like every other publish: a signal sent from inside one
   * would reach a browser that then refetches a ticket a rollback removed.
   */
  publish({ type: "queue", audience: "staff", actorId: user.id });
  publish({ type: "notify", audience: "staff", actorId: user.id });
  invalidateAnalytics();

  return rowToTicket(ticket);
}

/** Ordering for the „never lower it" comparison. See `PRIORITY_RANK`. */
function priorityRank(priority: TicketPriority): number {
  return PRIORITY_RANK[priority];
}

/**
 * What the triage rules make of a draft, or nothing at all.
 *
 * Off by default and returns an inert answer when the module is off, so the
 * create path has no branch for it — the alternative is a conditional around two
 * separate assignments, and the version of that which forgets one of them looks
 * like working code.
 *
 * The text is title plus the reporter's own words, which is the same pair
 * `services/ai/routing.ts` sends to the model. Not the whole payload: a form's
 * dropdown labels and its site name are vocabulary nobody wrote, and matching
 * keywords against them files tickets by the shape of the form rather than by
 * what the person said.
 */
function triageForDraft(
  draft: MITSTicketDraft,
  payload: Record<string, unknown>,
  fallbackTitle: string,
): { categoryId: string; priority: TicketPriority | "" } {
  if (!isFeatureEnabled("feature_smart_routing")) {
    return { categoryId: "", priority: "" };
  }

  const field = openingFieldName(payload);
  const body = field ? String(payload[field] ?? "") : "";
  const text = `${deriveTitle(payload, fallbackTitle)}\n${body}`;

  const outcome = triage(text, listTriageRules());
  return { categoryId: outcome.categoryId, priority: outcome.priority };
}

/**
 * File ids referenced by the payload's attachment fields.
 *
 * Only fields the schema declares as file fields are inspected, so a string that
 * merely looks like an id in some other field is never treated as an attachment.
 */
function collectFileIds(
  schema: Parameters<typeof resolveFields>[0],
  payload: Record<string, unknown>,
): string[] {
  const ids: string[] = [];

  for (const field of resolveFields(schema)) {
    if (field.widget !== "file") continue;
    const value = payload[field.name];
    if (!Array.isArray(value)) continue;

    for (const entry of value) {
      const attachment = AttachmentMetaSchema.safeParse(entry);
      if (attachment.success && attachment.data.fileId) {
        ids.push(attachment.data.fileId);
      }
    }
  }

  return ids;
}

/**
 * Soft-deleted rows are invisible to every read.
 *
 * Named and appended by hand at each site rather than baked into SELECT_TICKET,
 * because each caller adds its own WHERE and SQLite has no way to merge two. The
 * upside is that `grep ALIVE src/lib/tickets.ts` audits the whole file: a read path
 * without it is a deletion that appears not to have worked.
 */
const ALIVE = "mits_ticket.deleted_at IS NULL";

/**
 * Every read joins the assignee.
 *
 * A LEFT JOIN rather than a per-row lookup: the queue needs the owner's display
 * name in a column *and* has to sort by it, and sorting by a name that only exists
 * in JavaScript would mean sorting after `LIMIT 500` — the wrong five hundred rows.
 * LEFT, so an unassigned ticket and one whose assignee's account was deleted both
 * still come back.
 *
 * The alias is `owner`, not `user`: `lib/ticket-sort.ts` builds `ORDER BY` against
 * it, and `user` is also the table name.
 */
const TICKET_COLUMNS = `
  mits_ticket.id, mits_ticket.ticket_number, mits_ticket.location_id,
  mits_ticket.category_id,
  mits_ticket.created_by, mits_ticket.created_by_email, mits_ticket.source,
  mits_ticket.form_schema_id, mits_ticket.title, mits_ticket.payload,
  mits_ticket.status, mits_ticket.priority, mits_ticket.assigned_to,
  mits_ticket.created_at, mits_ticket.tags, mits_ticket.major_incident,
  mits_ticket.auto_close_off, mits_ticket.cc_emails,
  COALESCE(NULLIF(owner.name, ''), owner.email) AS assigned_to_name
`;

const TICKET_FROM = `
  FROM mits_ticket
  LEFT JOIN user AS owner ON owner.id = mits_ticket.assigned_to
`;

/**
 * Split into columns and source so `searchTickets` can append its own per-user
 * expressions between them. Composing two named halves beats rewriting this string
 * with a regex — the regex version worked and was one whitespace change away from
 * silently producing a statement without the extra columns.
 */
const SELECT_TICKET = `SELECT ${TICKET_COLUMNS} ${TICKET_FROM}`;

/** Tickets the user owns. The only listing a plain `user` role can reach. */
export function listOwnTickets(userId: string): MITSTicket[] {
  const rows = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.created_by = ?
       ORDER BY mits_ticket.created_at DESC`)
    .all(userId) as TicketRow[];
  return rows.map(rowToTicket);
}

/** Every ticket — agent board and admin desk only. */
export function listAllTickets(): MITSTicket[] {
  const rows = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} ORDER BY mits_ticket.created_at DESC`)
    .all() as TicketRow[];
  return rows.map(rowToTicket);
}

/**
 * The listing this user is allowed to see. Role decides scope; the caller cannot
 * ask for a wider one.
 */
export function listTicketsFor(user: SessionUser): MITSTicket[] {
  return canViewBoard(user.role) ? listAllTickets() : listOwnTickets(user.id);
}

/**
 * Whether this user may read this row.
 *
 * One function, because the answer has to be the same at every door: the detail
 * page, the jump-by-number, the activity fingerprint and the links panel all
 * ask it, and a rule that lives at four call sites is a rule that will differ at
 * one of them.
 *
 * Three cases, in cost order:
 *
 *   1. Staff see everything.
 *   2. The reporter sees their own.
 *   3. A flagged org admin sees what their company reported.
 *
 * The third does the profile reads only when the first two have failed — it is
 * the rare case, and putting it first would mean two extra queries on every
 * ticket anyone opens. A viewer without a company matches nothing: `null` is
 * "not assigned", and treating two unassigned people as colleagues would hand a
 * fresh account somebody else's tickets.
 */
function mayReadTicket(row: TicketRow, user: SessionUser): boolean {
  if (canViewBoard(user.role)) return true;
  if (row.created_by === user.id) return true;
  if (!isOrgAdmin(user.id)) return false;

  const viewerOrg = getUserOrganizationId(user.id);
  if (!viewerOrg) return false;

  return getUserOrganizationId(row.created_by) === viewerOrg;
}

/**
 * A single ticket, or null when it does not exist **or** the user may not see it.
 * Returning the same answer for both cases keeps ticket ids from leaking through
 * a 403-versus-404 difference.
 */
export function getTicketFor(id: string, user: SessionUser): MITSTicket | null {
  const row = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.id = ?`)
    .get(id) as TicketRow | undefined;
  if (!row) return null;
  if (!mayReadTicket(row, user)) return null;
  return rowToTicket(row);
}

/** Placeholders for an `IN (…)` list built from a fixed-length constant. */
const OPEN_PLACEHOLDERS = OPEN_TICKET_STATUSES.map(() => "?").join(", ");

export function countTickets(): { total: number; open: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN mits_ticket.status IN (${OPEN_PLACEHOLDERS}) THEN 1 ELSE 0 END) AS open
         FROM mits_ticket
        WHERE ${ALIVE}`,
    )
    .get(...OPEN_TICKET_STATUSES) as { total: number; open: number | null };
  return { total: row.total, open: row.open ?? 0 };
}

/* ──────────────────────────────────────────────────────────────────────────
   Search and filters.
   ────────────────────────────────────────────────────────────────────────── */

export interface TicketFilter {
  /** Free text over title and reporter address. */
  q?: string;
  locationId?: string;
  /**
   * Category id. Matches the category **and everything under it**.
   *
   * One field for both dropdowns, because a subcategory already implies its
   * parent: the cascading control sends the deepest thing chosen, so
   * `?category=hardware&subCategory=notebooks` narrows to notebooks and
   * `?category=hardware` alone to all of Hardware. Two filter fields would be two
   * clauses that can contradict each other — a subcategory from a different root.
   */
  categoryId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  /** Agent id, or the literal "unassigned". */
  assignedTo?: string;
  /** Inclusive ISO dates, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Narrow a agent's or admin's result set to their own tickets. */
  ownOnly?: boolean;

  /**
   * Everything reported by members of one company.
   *
   * The one filter that *widens* a plain reporter's scope, which is why it is
   * never parsed from the query string. `parseTicketQuery` does not know about
   * it; the customer page sets it only after checking `is_org_admin` and only
   * to that user's own company. Setting it from a URL parameter would be a
   * reporter reading a competitor's tickets by editing an id.
   *
   * Wins over the own-tickets clause rather than combining with it — the two
   * together would be "my tickets that are also mine".
   */
  organizationId?: string;

  /*
   * Set by the queue-view presets (`lib/agent-views.ts`) rather than by the
   * filter form. They combine with the single-value filters above with AND, so a
   * tab plus a deep filter narrows twice — which is what an agent expects when
   * they filter inside a tab.
   */
  statusIn?: TicketStatus[];
  priorityIn?: TicketPriority[];
  unassignedOnly?: boolean;

  /*
   * The two halves of the queue's pinned block, as a user id.
   *
   * They are complements over the *same* filter: the block above the table asks
   * for `pinnedOnlyFor`, the table below for `excludePinnedFor`, and together
   * they partition exactly what the filter alone would have returned. That is
   * what keeps a pinned ticket from appearing twice on one screen, and it is
   * also what keeps the pager honest — the total is counted with the same
   * exclusion the list uses.
   *
   * Both narrow, like everything else here. Neither is ever parsed from the
   * query string: they carry a user id, and an id from a URL would be one
   * reader looking at another reader's pins.
   */
  pinnedOnlyFor?: string;
  excludePinnedFor?: string;

  /**
   * Column and direction. Defaults to newest first.
   *
   * Part of the filter rather than a second argument so the queue can hand one
   * object to `searchTickets` — a sort that travelled separately would be easy to
   * forget at one of the call sites and the list would silently come back in a
   * different order than the header claims.
   */
  sort?: TicketSort;

  /**
   * Paging. Defaults to the first page of `TICKETS_PER_PAGE`.
   *
   * Set through `pageOffset` rather than by hand at the call sites: the page
   * number arrives from a query string, and an offset computed from an unclamped
   * one is either a negative `OFFSET` — a SQLite error — or a jump past the end
   * that renders as an empty list with no explanation.
   */
  limit?: number;
  offset?: number;
}

/** Sentinel the filter form uses; a real id can never collide with it. */
export const UNASSIGNED_FILTER = "__unassigned";

/**
 * Search within what this user is allowed to see.
 *
 * The scope clause is built from the role first and cannot be widened by any
 * filter — a plain `user` always gets `created_by = <self>` appended, whatever the
 * query string says. `ownOnly` only ever narrows, mirroring `?scope=own` on the
 * ticket API.
 *
 * The free-text part deliberately covers `title` and `created_by_email` and **not**
 * `payload`. The payload holds whatever people typed into a form; letting a
 * reporter substring-search it would be fine for their own tickets and a data
 * leak across foreign ones, and the scope clause is not the right place to carry
 * that distinction.
 */
/**
 * The WHERE clause and its parameters for a filter.
 *
 * Extracted so `searchTickets` and `countSearchTickets` cannot disagree. That is
 * not tidiness: the first clause this builds is the **scope** clause, and two
 * copies of it would be two places for "a reporter sees only their own tickets"
 * to drift. A pager whose total counted rows the list refuses to show would be a
 * disclosure — the number alone tells you how many foreign tickets exist.
 */
function ticketWhere(
  filter: TicketFilter,
  user: SessionUser,
): { where: string; params: unknown[] } {
  const staff = canViewBoard(user.role);

  // Seeded, not appended: an empty filter would otherwise produce no WHERE at all
  // and return deleted tickets.
  const clauses: string[] = [ALIVE];
  const whereParams: unknown[] = [];

  /*
   * Scope, and the order matters. The company clause replaces the own-tickets
   * clause instead of joining it, because it is the caller saying "this reader
   * has been granted their department" — a decision `setOrgAdmin` records and
   * the page re-checks. Everything after this point can only narrow further.
   *
   * A subselect rather than a JOIN: membership lives on the profile row, a JOIN
   * would drop every ticket whose reporter has no profile yet, and this clause
   * is the one that must not quietly lose rows.
   */
  if (filter.organizationId) {
    clauses.push(
      `mits_ticket.created_by IN (
         SELECT user_id FROM mits_user_profile WHERE organization_id = ?
       )`,
    );
    whereParams.push(filter.organizationId);
  } else if (!staff || filter.ownOnly) {
    clauses.push("mits_ticket.created_by = ?");
    whereParams.push(user.id);
  }

  const q = filter.q?.trim();
  if (q) {
    /*
     * Free text, over everything the reader is allowed to see.
     *
     * It used to be title and reporter address only, and the note here said the
     * payload was left out because substring-searching it would leak across
     * foreign tickets. That reasoning does not survive the clause above: scope
     * is the *first* thing in this WHERE and everything here is ANDed onto it,
     * so a reporter searching their own three tickets cannot reach a fourth.
     * What the narrow version actually produced was a search box that fails to
     * find a name the customer typed into the form — which is most of what
     * anybody searches for.
     *
     * Slow by construction, and deliberately so. Every one of these is a
     * `LIKE '%…%'`, which no index can serve; on a large instance this is a
     * table scan plus a scan of the comments per row. That is the trade the
     * search box is here to make — an answer that takes a moment beats a fast
     * "nichts gefunden" about a ticket that exists.
     *
     * Every whitespace-separated word has to match *somewhere*, not all in the
     * same column: "felix drucker" finds the ticket Felix filed about a
     * printer. A single character is a legitimate query and is not filtered
     * out — it just matches a lot.
     */
    const columns = [
      "mits_ticket.title",
      "mits_ticket.created_by_email",
      // The answers to the form, as stored. JSON with its keys, so a field name
      // matches too; that is noise a human reads past, and the alternative is
      // not finding the answer at all.
      "mits_ticket.payload",
      "mits_ticket.tags",
      // The counter, so a pasted "1042" finds ticket 1042 even when the
      // number-jump did not fire — that one only triggers on a bare number.
      "CAST(mits_ticket.ticket_number AS TEXT)",
    ];

    /*
     * Names, through correlated subqueries rather than the `owner` join.
     * `countSearchTickets` builds its statement as `FROM mits_ticket <where>`
     * with no joins at all, and a clause that referenced an alias would make
     * the total a SQL error while the list itself worked.
     */
    const exists = [
      `EXISTS (SELECT 1 FROM user u
                WHERE u.id = mits_ticket.created_by
                  AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\'))`,
      `EXISTS (SELECT 1 FROM user a
                WHERE a.id = mits_ticket.assigned_to
                  AND (a.name LIKE ? ESCAPE '\\' OR a.email LIKE ? ESCAPE '\\'))`,
      /*
       * The conversation. Restricted to what this reader may see, and that is
       * not cosmetic: without the visibility clause a reporter would learn that
       * some internal note mentions a word, which is the same side channel the
       * activity fingerprint is careful not to open.
       *
       * `body` is stored HTML for rich replies, so a query like "div" matches
       * markup. Left as is — stripping tags in SQL is not possible, and a
       * search for an HTML tag name is not a search anybody performs twice.
       */
      `EXISTS (SELECT 1 FROM mits_ticket_comment c
                WHERE c.ticket_id = mits_ticket.id
                  AND c.deleted_at IS NULL
                  ${staff ? "" : "AND c.visibility = 'public'"}
                  AND (c.body LIKE ? ESCAPE '\\' OR c.author_name LIKE ? ESCAPE '\\'))`,
    ];

    for (const word of q.split(/\s+/).filter(Boolean)) {
      /*
       * LIKE with escaped wildcards: a query containing % or _ should match
       * those characters rather than turning into a pattern.
       *
       * Both halves of this were wrong once, and both in the same way — a
       * backslash that JavaScript ate before SQLite ever saw it:
       *
       *   - The replacement was a template literal `` `\${c}` ``, where `\$`
       *     escapes the dollar. That is not an interpolation at all; every `%`
       *     was replaced by the four literal characters `${c}`.
       *   - `ESCAPE '\'` inside a double-quoted string is `ESCAPE ''` by the
       *     time it reaches SQLite, which answers "ESCAPE expression must be a
       *     single character" and throws.
       *
       * So **every free-text search was a 500**, from the header dialog on any
       * page and from the reporter's own list. Nothing caught it: the query is
       * a string, and neither typecheck nor build executes one.
       *
       * The backslash itself is escaped first, or a query containing one would
       * produce a dangling escape at the end of the pattern.
       */
      const pattern = `%${word.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      const tests = [
        ...columns.map((column) => `${column} LIKE ? ESCAPE '\\'`),
        ...exists,
      ];

      clauses.push(`(${tests.join(" OR ")})`);
      // One per placeholder, in the order the tests were assembled: the columns
      // take one each, every EXISTS takes two.
      for (let index = 0; index < columns.length + exists.length * 2; index += 1) {
        whereParams.push(pattern);
      }
    }
  }

  if (filter.locationId) {
    clauses.push("mits_ticket.location_id = ?");
    whereParams.push(filter.locationId);
  }
  /*
   * Category, and everything filed under it.
   *
   * `IN (…)` over the subtree rather than `= ?`, because a root that only matched
   * tickets filed *directly* on it would find almost nothing: the point of
   * subcategories is that tickets live in the leaves. Picking „Hardware" has to
   * mean „Hardware und alles darunter", which is what the dropdown says it does.
   *
   * The subtree is expanded in JavaScript, not in a recursive CTE. It comes from a
   * table with tens of rows that is read on every queue render anyway, and the
   * expansion is also where the cycle guard lives — a hand-edited parent loop
   * hangs a recursive CTE and truncates here.
   *
   * An unknown id yields the id itself, so the clause matches nothing rather than
   * everything. That direction matters: a stale bookmark should show an empty
   * queue, not silently drop the filter and look like a complete one.
   */
  if (filter.categoryId) {
    const ids = descendantCategoryIds(filter.categoryId);
    clauses.push(
      `mits_ticket.category_id IN (${ids.map(() => "?").join(", ")})`,
    );
    whereParams.push(...ids);
  }
  if (filter.status) {
    clauses.push("mits_ticket.status = ?");
    whereParams.push(filter.status);
  }
  if (filter.priority) {
    clauses.push("mits_ticket.priority = ?");
    whereParams.push(filter.priority);
  }
  if (filter.assignedTo === UNASSIGNED_FILTER || filter.unassignedOnly) {
    clauses.push("mits_ticket.assigned_to IS NULL");
  } else if (filter.assignedTo) {
    clauses.push("mits_ticket.assigned_to = ?");
    whereParams.push(filter.assignedTo);
  }

  // An empty array would render `IN ()`, which is a syntax error in SQLite — and
  // semantically it should match nothing, not everything, so it is skipped rather
  // than treated as "no filter".
  if (filter.statusIn && filter.statusIn.length > 0) {
    clauses.push(
      `mits_ticket.status IN (${filter.statusIn.map(() => "?").join(", ")})`,
    );
    whereParams.push(...filter.statusIn);
  }
  if (filter.priorityIn && filter.priorityIn.length > 0) {
    clauses.push(
      `mits_ticket.priority IN (${filter.priorityIn.map(() => "?").join(", ")})`,
    );
    whereParams.push(...filter.priorityIn);
  }
  /*
   * The pinned split. Two clauses that are each other's negation, so a caller
   * that sets both gets an empty list — which is the correct answer to "pinned
   * and not pinned" and better than one of them silently winning.
   *
   * `EXISTS` rather than a JOIN: a join against a per-user table would multiply
   * rows if the key ever stopped being unique, and `countSearchTickets` builds
   * its statement with no joins at all.
   */
  if (filter.pinnedOnlyFor) {
    clauses.push(
      `EXISTS (SELECT 1 FROM mits_ticket_pin p
                WHERE p.ticket_id = mits_ticket.id AND p.user_id = ?)`,
    );
    whereParams.push(filter.pinnedOnlyFor);
  }
  if (filter.excludePinnedFor) {
    clauses.push(
      `NOT EXISTS (SELECT 1 FROM mits_ticket_pin p
                    WHERE p.ticket_id = mits_ticket.id AND p.user_id = ?)`,
    );
    whereParams.push(filter.excludePinnedFor);
  }

  // `created_at` is an ISO string, so a date prefix comparison sorts correctly.
  // `to` gets a time suffix rather than `<=` on the bare date, which would
  // exclude everything that happened during the chosen day.
  if (filter.from) {
    clauses.push("mits_ticket.created_at >= ?");
    whereParams.push(`${filter.from}T00:00:00.000Z`);
  }
  if (filter.to) {
    clauses.push("mits_ticket.created_at <= ?");
    whereParams.push(`${filter.to}T23:59:59.999Z`);
  }

  return { where: `WHERE ${clauses.join(" AND ")}`, params: whereParams };
}

/**
 * How many rows this filter matches, for the pager.
 *
 * A second query rather than a window function beside the rows: SQLite would
 * happily compute `COUNT(*) OVER ()`, and it would then be attached to a row —
 * which does not exist on an empty page. A pager on page four of a list that just
 * shrank to two pages has to be able to say so.
 *
 * No `LIMIT`, and no read-state expressions: the count needs the same WHERE and
 * none of the per-user columns.
 */
export function countSearchTickets(
  filter: TicketFilter,
  user: SessionUser,
): number {
  const { where, params } = ticketWhere(filter, user);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM mits_ticket ${where}`)
    .get(...params) as { n: number };
  return row.n;
}

export function searchTickets(
  filter: TicketFilter,
  user: SessionUser,
): MITSTicket[] {
  const staff = canViewBoard(user.role);

  /*
   * Two parameter lists, concatenated at the end.
   *
   * better-sqlite3 binds positionally and refuses a mix of named and positional
   * placeholders, so the `?` in the read-state expressions — which sit in the
   * SELECT list, *before* the WHERE — have to be bound first. Keeping them in a
   * separate array is what makes that order impossible to get wrong when a filter
   * is added later.
   */
  const selectParams: unknown[] = [];

  /*
   * The newest event on this ticket that this reader did not cause.
   *
   * Both exclusions matter. Without `created_by <> me` every ticket a reporter
   * files is immediately unread *to them*, and without `author_id <> me` an agent's
   * own reply marks their own ticket unread the moment they send it — the badge
   * would then say "new" on precisely the rows where nothing new happened.
   *
   * A reporter's version additionally ignores internal notes: they cannot see one,
   * so being told something changed and finding nothing is worse than no badge.
   *
   * The empty string is the "nothing to report" sentinel. It compares below every
   * ISO timestamp, so the unread test below fails for it without a special case,
   * and `rowToTicket` maps it back to null.
   */
  const activity = `
    MAX(
      CASE WHEN mits_ticket.created_by = ? THEN '' ELSE mits_ticket.created_at END,
      COALESCE((
        SELECT MAX(c.created_at)
          FROM mits_ticket_comment c
         WHERE c.ticket_id = mits_ticket.id
           AND c.deleted_at IS NULL
           AND c.author_id <> ?
           ${staff ? "" : "AND c.visibility = 'public'"}
      ), '')
    )`;
  selectParams.push(user.id, user.id);

  const readAt = `(
    SELECT r.seen_at FROM mits_ticket_read r
     WHERE r.ticket_id = mits_ticket.id AND r.user_id = ?
  )`;
  selectParams.push(user.id);

  const logged = `COALESCE((
    SELECT SUM(w.minutes) FROM mits_ticket_worklog w
     WHERE w.ticket_id = mits_ticket.id
  ), 0)`;

  /*
   * Whether this reader has the row pinned. Read as a column rather than looked
   * up per row, for the reason every other per-user expression here is: the table
   * draws fifty of these, and fifty round trips to answer a yes/no would cost more
   * than the query returning them.
   *
   * **Last in the list, and its parameter is last in the bind array.** Everything
   * in this SELECT binds positionally, so an expression inserted in the middle
   * shifts every parameter after it — and the result is valid SQL that answers a
   * different question. That is the failure `npm run test:db` exists for; the
   * partition test there is what catches it.
   */
  const pinned = `EXISTS (
    SELECT 1 FROM mits_ticket_pin p
     WHERE p.ticket_id = mits_ticket.id AND p.user_id = ?
  )`;

  /*
   * Der Melder hat nachgelegt — und das ist **geteilt**, nicht persönlich.
   *
   * `unread` daneben antwortet je Leser: zwei Agenten sehen zwei verschiedene
   * Queues, und keiner von beiden sieht, ob der Kunde am Zug war. Genau das ist die
   * Lücke, die dieser Ausdruck füllt, und deshalb kommt in ihm kein `?` vor.
   *
   * **Schärfer als „der Melder ist am Zug".** Das sagt der Status schon: seit dem
   * Ballbesitz-Umbau heißt `open` „das Team ist am Zug". Ein Marker für dieselbe
   * Aussage wäre ein zweites Signal für eine Frage. Was der Status *nicht* sagen
   * kann, ist der Fall hier: ein Ticket, das von `waiting_user` auf `open`
   * zurückgesprungen ist, sieht danach aus wie jedes andere offene — obwohl dort
   * ein Kunde wartet, der schon einmal eine Antwort bekommen hatte.
   *
   * Deshalb die zweite Bedingung: es muss eine öffentliche Team-Antwort *geben*.
   * Auf einem unberührten Ticket leuchtet nichts; dort sagen der Status und der
   * persönliche Punkt schon alles.
   *
   * **Interne Notizen zählen nicht als Antwort.** „Das Team hat geantwortet" heißt,
   * der Melder hat etwas bekommen; eine Notiz ist Werkstattgespräch. Ohne das
   * `visibility = 'public'` leuchtete der Marker auf einem Ticket, auf das nie
   * jemand geantwortet hat.
   *
   * `author_is_agent` und nicht die Rolle des Kontos: der Mail-Ingest erzwingt dort
   * `0`, eine per Mail eingegangene Kundenantwort zählt also mit — der häufigste
   * Fall überhaupt.
   */
  const lastStaffReply = `(
    SELECT MAX(cs.created_at) FROM mits_ticket_comment cs
     WHERE cs.ticket_id = mits_ticket.id
       AND cs.deleted_at IS NULL
       AND cs.author_is_agent = 1
       AND cs.visibility = 'public'
  )`;

  const lastReporterMessage = `(
    SELECT MAX(cr.created_at) FROM mits_ticket_comment cr
     WHERE cr.ticket_id = mits_ticket.id
       AND cr.deleted_at IS NULL
       AND cr.author_is_agent = 0
  )`;

  /*
   * Reihenfolge in dieser Liste ist Bindungsreihenfolge — siehe die Warnung an
   * `pinned` darüber. `awaiting_reply` ist parameterlos und könnte deshalb
   * überall stehen; es steht trotzdem hinten, damit die Warnung weiter für die
   * ganze Liste gilt und niemand die Ausnahme zur Regel liest.
   */
  const extraColumns = `,
         ${activity} AS last_activity_at,
         CASE
           WHEN ${activity} = '' THEN 0
           WHEN ${readAt} IS NULL THEN 1
           WHEN ${readAt} < ${activity} THEN 1
           ELSE 0
         END AS unread,
         ${logged} AS logged_minutes,
         ${pinned} AS pinned,
         CASE
           WHEN ${lastStaffReply} IS NULL THEN 0
           WHEN ${lastReporterMessage} > ${lastStaffReply} THEN 1
           ELSE 0
         END AS awaiting_reply`;

  // `activity` and `readAt` are each interpolated more than once above, so their
  // placeholders repeat in the same order. Bound by repeating the values rather
  // than by rewriting the SQL into a subselect: SQLite has no way to name a scalar
  // expression for reuse inside the same SELECT list.
  const boundSelectParams = [
    ...selectParams.slice(0, 2), // activity, in last_activity_at
    ...selectParams.slice(0, 2), // activity, in the CASE's first branch
    selectParams[2], // readAt, second branch
    selectParams[2], // readAt, third branch
    ...selectParams.slice(0, 2), // activity, third branch
    user.id, // pinned, last column in the list
  ];

  const { where, params: whereParams } = ticketWhere(filter, user);
  // Never interpolated from the request: `orderByFor` only accepts a key that
  // `parseTicketSort` validated against a fixed list. `ORDER BY` cannot be bound
  // as a parameter, so the whitelist is the whole defence.
  const orderBy = orderByFor(filter.sort ?? DEFAULT_TICKET_SORT);

  /*
   * One page at a time.
   *
   * `LIMIT`/`OFFSET` rather than the old flat `LIMIT 500`, which silently hid
   * everything past the five hundredth row — a queue that looked complete and was
   * not. Both are interpolated as integers rather than bound: they come from
   * `pageOffset`, which clamps them, and mixing them into the parameter list would
   * put two more positional binds after the WHERE for no benefit.
   */
  const limit = Math.max(1, Math.trunc(filter.limit ?? TICKETS_PER_PAGE));
  const offset = Math.max(0, Math.trunc(filter.offset ?? 0));

  const rows = db
    .prepare(
      `SELECT ${TICKET_COLUMNS} ${extraColumns} ${TICKET_FROM} ${where}
        ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
    )
    .all(...boundSelectParams, ...whereParams) as TicketRow[];

  return rows.map(rowToTicket);
}

/**
 * Record that this user has seen this ticket as it stands now.
 *
 * An UPSERT of a single timestamp, called from the detail page's render. A write
 * during a GET is deliberate and bounded: it is idempotent, it is invisible to
 * everybody except the caller, and the alternative — a client component that POSTs
 * on mount — costs a round-trip per ticket opened to record something the server
 * already knew at render time.
 *
 * Not gated on role. A reporter opening their own ticket has read it too, and the
 * unread computation in `searchTickets` is per-user either way.
 */
export function markTicketRead(ticketId: string, userId: string): void {
  db.prepare(
    `INSERT INTO mits_ticket_read (user_id, ticket_id, seen_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, ticket_id) DO UPDATE SET seen_at = excluded.seen_at`,
  ).run(userId, ticketId, new Date().toISOString());
}

/**
 * When this user last saw this ticket — or `null` if they never have.
 *
 * The bookmark before it is moved, which is what draws the "new since your last
 * visit" line in the conversation. **Has to be read before `markTicketRead`**,
 * and the detail pages do exactly that: the two calls are one line apart and in
 * that order, because the second one overwrites the answer to the first.
 *
 * That ordering is the whole reason this is a separate function rather than
 * something `markTicketRead` returns. A single call that both reports and
 * advances reads as harmless at the call site, and the day somebody moves it
 * below the render the marker quietly stops appearing — with nothing on screen
 * to say so.
 */
export function getTicketSeenAt(ticketId: string, userId: string): string | null {
  const row = db
    .prepare(
      "SELECT seen_at FROM mits_ticket_read WHERE user_id = ? AND ticket_id = ?",
    )
    .get(userId, ticketId) as { seen_at: string } | undefined;

  return row?.seen_at ?? null;
}

/** Look up by the human-readable number, for the search bar's direct jump. */
export function getTicketByNumberFor(
  ticketNumber: number,
  user: SessionUser,
): MITSTicket | null {
  const row = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.ticket_number = ?`)
    .get(ticketNumber) as TicketRow | undefined;
  if (!row) return null;
  // Same rule as getTicketFor: a foreign ticket answers null, not 403, so the
  // number space cannot be probed for which tickets exist.
  if (!mayReadTicket(row, user)) return null;
  return rowToTicket(row);
}

/** Unassigned and not yet finished — the agent inbox. */
export function listUnassignedTickets(): MITSTicket[] {
  const rows = db
    .prepare(
      `${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.assigned_to IS NULL
         AND mits_ticket.status IN (${OPEN_PLACEHOLDERS})
         ORDER BY mits_ticket.created_at ASC`,
    )
    .all(...OPEN_TICKET_STATUSES) as TicketRow[];
  return rows.map(rowToTicket);
}

/**
 * Das nächste herrenlose Ticket im Eingang, außer diesem.
 *
 * Triage war: Queue öffnen, Ticket anklicken, antworten, zurück zur Queue, die
 * nächste Zeile suchen. Vier Schritte, von denen zwei Navigation sind — und die
 * Queue hat sich zwischenzeitlich neu sortiert, also sucht man die Stelle, an der
 * man war.
 *
 * `LIMIT 1` und nicht `listUnassignedTickets()[0]`: die Liste kann auf einer
 * belebten Instanz dreistellig sein, und gebraucht wird eine Zeile. Ältestes
 * zuerst, dieselbe Reihenfolge wie der Eingang selbst — sonst führte der Knopf an
 * eine andere Stelle als der Tab, aus dem man kommt.
 *
 * `null`, wenn der Eingang leer ist. Der Aufrufer zeigt dann keinen Knopf: einer,
 * der nirgends hinführt, ist die schlechtere Antwort als keiner.
 */
export function nextInboxTicket(
  exceptId: string,
): { id: string; ticket_number: number | null } | null {
  const row = db
    .prepare(
      `SELECT id, ticket_number FROM mits_ticket
        WHERE ${ALIVE}
          AND assigned_to IS NULL
          AND id <> ?
          AND status IN (${OPEN_PLACEHOLDERS})
        ORDER BY created_at ASC
        LIMIT 1`,
    )
    .get(exceptId, ...OPEN_TICKET_STATUSES) as
    | { id: string; ticket_number: number | null }
    | undefined;

  return row ?? null;
}

/** Open tickets this agent has taken. */
export function listAssignedTickets(agentId: string): MITSTicket[] {
  const rows = db
    .prepare(
      `${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.assigned_to = ?
         AND mits_ticket.status IN (${OPEN_PLACEHOLDERS})
         ORDER BY mits_ticket.created_at ASC`,
    )
    .all(agentId, ...OPEN_TICKET_STATUSES) as TicketRow[];
  return rows.map(rowToTicket);
}

export class TicketUpdateError extends Error {}

/**
 * Assign a ticket, or clear the assignment with `null`.
 *
 * Staff only, checked by the caller's `requireRole`. The target has to be a
 * agent or admin: assigning to a plain user would put a ticket in a queue
 * that person cannot open.
 */
/*
 * The three mutators below take the acting user as a required parameter, not an
 * optional one, so that recording *who* changed something cannot be skipped by a new
 * call site. The audit row is written next to the UPDATE rather than in the action
 * layer for the same reason: one door, and it is not optional.
 *
 * The old value is read before the write. Reading it afterwards would log the new value
 * twice, which looks like a change from nothing and is the kind of wrong that only
 * shows up when somebody actually needs the history.
 */
export function assignTicket(
  ticketId: string,
  assigneeId: string | null,
  actor: SessionUser,
): MITSTicket {
  if (assigneeId) {
    const target = db
      .prepare("SELECT role FROM user WHERE id = ?")
      .get(assigneeId) as { role: string | null } | undefined;

    if (!target) throw new TicketUpdateError("Benutzer nicht gefunden.");
    if (!canViewBoard(toRole(target.role))) {
      throw new TicketUpdateError(
        "Nur Agenten und Administration können Tickets übernehmen.",
      );
    }
  }

  const before = requireTicket(ticketId);

  db.prepare("UPDATE mits_ticket SET assigned_to = ? WHERE id = ?").run(
    assigneeId,
    ticketId,
  );

  if (before.assigned_to !== assigneeId) {
    recordAudit(ticketId, actor, assigneeId ? "assigned" : "unassigned", {
      field: "assigned_to",
      from: nameOf(before.assigned_to),
      to: nameOf(assigneeId),
    });
    announce(ticketId, actor.id);
    // The one state change that does produce a notification — "dir zugewiesen"
    // — so the recipient's watcher is woken rather than left on its interval.
    publish({ type: "notify", audience: "staff", actorId: actor.id });
  }

  return requireTicket(ticketId);
}

/**
 * Replace the list of addresses that take part in this ticket by mail.
 *
 * Whole list, not add/remove: the mask posts every chip it is showing, so a
 * partial update would need a second decision about what an absent address
 * means. Normalised here as well as in the browser — the pure function is
 * shared, but "the form already did it" is not a rule.
 *
 * **An agent, or the reporter on their own ticket.** The rule started as
 * agents-only, and the case it got wrong is the common one: somebody files a
 * ticket on a colleague's behalf and wants that colleague on the thread from
 * the first answer. Who else belongs in that conversation is knowledge the
 * reporter has and the desk does not.
 *
 * What that grants is bounded, and the bound is the reason it is safe: a listed
 * address receives copies and may answer *this* ticket by mail. It gets no
 * account, no portal access, and no way to reach any other ticket — the same
 * thing the reporter could achieve by forwarding the mail, minus the part where
 * the answer is then lost outside MITS.
 *
 * A foreign reporter — a mailed-in ticket filed under the fallback account —
 * cannot reach this path at all: they have no session.
 */
export function setTicketCc(
  ticketId: string,
  emails: string[],
  actor: SessionUser,
): MITSTicket {
  const before = requireTicket(ticketId);

  if (!canViewBoard(actor.role) && before.created_by !== actor.id) {
    throw new TicketValidationError(
      "Beteiligte kann nur ändern, wer das Ticket gemeldet hat, oder ein Agent.",
    );
  }

  const next = normalizeCcEmails(emails);

  db.prepare("UPDATE mits_ticket SET cc_emails = ? WHERE id = ?").run(
    JSON.stringify(next),
    ticketId,
  );

  // Compared as joined strings so a reorder is not recorded as a change: the
  // list has no order anybody chose, and an audit row per drag would bury the
  // ones that mean something.
  if (before.cc_emails.join(",") !== next.join(",")) {
    recordAudit(ticketId, actor, "cc_changed", {
      field: "cc_emails",
      from: before.cc_emails.join(", "),
      to: next.join(", "),
    });
    announce(ticketId, actor.id);
  }

  return requireTicket(ticketId);
}

/**
 * A short string that changes whenever this user's queue would look different.
 *
 * The ETag behind `/api/tickets/check-updates`. Four indexed aggregates rather
 * than the ticket rows themselves — the question is "is my list stale", and
 * answering it by sending the list is the thing the endpoint exists to avoid.
 *
 * **Not `mits_ticket.updated_at`.** That column is written at insert and never
 * touched again, so a status change would not move it — and a fingerprint that
 * misses a status change is a queue that quietly shows the wrong badges. The
 * audit log is the honest source: every mutator already writes there, and one
 * that forgot would be a missing history entry too, which is a bug somebody
 * notices. The comment maximum is in it because an unread dot depends on it.
 *
 * Scoped exactly like the listing. A reporter's fingerprint must not move when
 * somebody else's ticket changes: it would cost them a refetch that returns the
 * same rows, and repeated, it is a clock showing how busy the rest of the system
 * is.
 */
export function queueFingerprint(user: SessionUser): string {
  const staff = canViewBoard(user.role);

  const row = staff
    ? (db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM mits_ticket WHERE deleted_at IS NULL) AS tickets,
             (SELECT MAX(created_at) FROM mits_ticket) AS newest,
             (SELECT MAX(created_at) FROM mits_audit_log) AS changed,
             (SELECT MAX(created_at) FROM mits_ticket_comment) AS said`,
        )
        .get() as FingerprintRow)
    : (db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM mits_ticket
               WHERE deleted_at IS NULL AND created_by = @user) AS tickets,
             (SELECT MAX(created_at) FROM mits_ticket
               WHERE created_by = @user) AS newest,
             (SELECT MAX(a.created_at) FROM mits_audit_log a
                JOIN mits_ticket t ON t.id = a.ticket_id
               WHERE t.created_by = @user) AS changed,
             (SELECT MAX(c.created_at) FROM mits_ticket_comment c
                JOIN mits_ticket t ON t.id = c.ticket_id
               WHERE t.created_by = @user AND c.visibility = 'public') AS said`,
        )
        .get({ user: user.id }) as FingerprintRow);

  return [
    row.tickets,
    row.newest ?? "",
    row.changed ?? "",
    row.said ?? "",
  ].join("|");
}

interface FingerprintRow {
  tickets: number;
  newest: string | null;
  changed: string | null;
  said: string | null;
}

/**
 * Tell every open page that this ticket moved.
 *
 * Two signals, because two different sets of people are looking: whoever has the
 * ticket open, and whoever is watching the queue it sits in. `notify` is left to
 * the paths that actually produce a notification — a priority change is not
 * something anybody gets told about, and firing it here would wake every
 * connected browser to fetch an empty feed.
 *
 * `actorId` keeps the signal away from the page that caused it: that one has
 * already re-rendered from its own action.
 */
function announce(ticketId: string, actorId: string): void {
  publish({ type: "ticket", ticketId, audience: "all", actorId });
  publish({ type: "queue", audience: "staff", actorId });

  /*
   * The statistics are cached for thirty seconds, and a status change is exactly
   * the write somebody then goes to look at.
   *
   * "I closed a ticket and it is not in the statistics" was that half minute.
   * The figure was correct and the cache was doing its job; the trouble is that
   * the one moment a person checks the number is straight after changing it, so
   * the only staleness they ever see is the staleness that looks like a bug.
   *
   * Cleared here rather than on every write: a comment moves the first-response
   * figure too, but nobody closes a ticket and then checks the median response
   * time. Status changes and new tickets are what the panel is watched for, and
   * they are rare enough that clearing on them does not defeat the cache.
   */
  invalidateAnalytics();
}

/** A display name for the log — an opaque id in a history nobody can read is noise. */
function nameOf(userId: string | null): string {
  if (!userId) return "";
  const row = db
    .prepare("SELECT name, email FROM user WHERE id = ?")
    .get(userId) as { name: string | null; email: string } | undefined;
  return row ? (row.name?.trim() || row.email) : userId;
}

export function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
  actor: SessionUser,
): MITSTicket {
  const before = requireTicket(ticketId);

  /*
   * Durch `applyStatusChange` und nicht mit eigenem UPDATE.
   *
   * Dort hängen zwei Uhren an dem Schreibvorgang — `status_changed_at` und das
   * Leeren von `waiting_reminder_at` —, und ein zweiter Schreiber daneben ließe
   * sie stehen. Das Fehlerbild wäre ein Ticket, das nie oder sofort verfällt:
   * ein halbes Jahr alter Zeitstempel an einem Status von heute.
   *
   * Es prüft selbst auf eine echte Änderung und schreibt auch die Historienzeile
   * — ein Dropdown, das auf seinen eigenen Wert zurückgesetzt wird, füllt den
   * Verlauf sonst mit Einträgen, die nichts sagen.
   */
  applyStatusChange(ticketId, before.status, status, actor);

  if (before.status !== status) {
    // Only on a real change, for the same reason the audit entry is: a signal
    // that fires when nothing happened teaches every listener to distrust it.
    announce(ticketId, actor.id);
  }

  return requireTicket(ticketId);
}

/**
 * Die Verfallsautomatik für dieses Ticket ein- oder ausschalten.
 *
 * `enabled` ist, was der Schalter sagt („automatisch schließen"); gespeichert
 * wird das Gegenteil. Die Umkehrung steckt in der Spalte und nicht in der Maske,
 * weil der Default `0` dann „Automatik gilt" heißt — eine Spalte namens
 * `auto_close_on` mit Default `0` hätte jedes bestehende Ticket beim Update
 * ausgenommen und die erste eingeschaltete Frist wirkungslos gemacht.
 *
 * Protokolliert wie jede andere Workflow-Entscheidung: dass ein Ticket seit
 * Wochen offen steht, *weil* jemand das so wollte, ist genau die Auskunft, die
 * hinterher fehlt.
 */
export function setTicketAutoClose(
  ticketId: string,
  enabled: boolean,
  actor: SessionUser,
): MITSTicket {
  const before = requireTicket(ticketId);
  const wasEnabled = !before.auto_close_off;

  db.prepare("UPDATE mits_ticket SET auto_close_off = ? WHERE id = ?").run(
    enabled ? 0 : 1,
    ticketId,
  );

  // Nur eine echte Änderung, wie überall sonst: ein Schalter, der auf seinen
  // eigenen Wert gesetzt wird, füllt die Historie mit Zeilen ohne Aussage.
  if (wasEnabled !== enabled) {
    recordAudit(ticketId, actor, "auto_close_changed", {
      field: "Automatisches Schließen",
      from: wasEnabled ? "an" : "aus",
      to: enabled ? "an" : "aus",
    });
  }

  return requireTicket(ticketId);
}

export function setTicketPriority(
  ticketId: string,
  priority: TicketPriority,
  actor: SessionUser,
): MITSTicket {
  const before = requireTicket(ticketId);

  db.prepare("UPDATE mits_ticket SET priority = ? WHERE id = ?").run(
    priority,
    ticketId,
  );

  if (before.priority !== priority) {
    recordAudit(ticketId, actor, "priority_changed", {
      field: "priority",
      from: before.priority,
      to: priority,
    });
    announce(ticketId, actor.id);
  }

  return requireTicket(ticketId);
}

/**
 * Re-file a ticket under a different category.
 *
 * The queue correction an agent makes when a ticket landed in the wrong place —
 * whether a person or a triage rule put it there.
 *
 * Audited with the readable path rather than with the ids. „von Hardware /
 * Drucker auf Software / M365" is a history entry somebody can act on; two UUIDs
 * are a row that proves a change happened and says nothing about what it was.
 * The label is resolved *before* the write for the old value and after it for the
 * new one, which is the only order that survives a category being renamed in
 * between.
 *
 * `null` clears it. That is a legitimate correction: a ticket wrongly filed is
 * worse than one honestly unfiled, because only the second one shows up when
 * somebody looks for what still needs sorting.
 */
export function setTicketCategory(
  ticketId: string,
  categoryId: string | null,
  actor: SessionUser,
): MITSTicket {
  const before = requireTicket(ticketId);

  // Rejected rather than silently dropped to null, unlike on the create path: a
  // re-route is somebody at the desk choosing from a list that was rendered from
  // this same table, so an unknown id means the list is stale and saying so is
  // more useful than filing the ticket nowhere.
  if (categoryId && !isFilableCategory(categoryId)) {
    throw new TicketUpdateError("Die gewählte Kategorie ist unbekannt.");
  }

  if (before.category_id === categoryId) return before;

  const fromLabel = categoryLabel(before.category_id);

  db.prepare("UPDATE mits_ticket SET category_id = ? WHERE id = ?").run(
    categoryId,
    ticketId,
  );

  recordAudit(ticketId, actor, "category_changed", {
    field: "category",
    from: fromLabel,
    to: categoryLabel(categoryId),
  });
  announce(ticketId, actor.id);

  return requireTicket(ticketId);
}

/**
 * Parse the stored tag array, defensively.
 *
 * The column holds JSON written by the routing service. Anything that is not an
 * array of strings comes back empty rather than throwing — a malformed value in
 * one row must not take down the listing that contains it.
 */
function safeTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

/** Read back after a write, so the caller always gets the persisted row. */
function requireTicket(ticketId: string): MITSTicket {
  const row = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.id = ?`)
    .get(ticketId) as TicketRow | undefined;
  if (!row) throw new TicketUpdateError("Ticket nicht gefunden.");
  return rowToTicket(row);
}

/**
 * Ein Ticket ohne Sichtbarkeitsprüfung.
 *
 * **Nicht für einen Request.** Die einzige Aufrufstelle ist der Verfalls-Sweeper
 * (`lib/ticket-sweeper.ts`), der aus einem Cron kommt und keine Sitzung hat — die
 * Frage, die `getTicketFor` beantwortet, lautet „darf *diese Person* das sehen",
 * und es gibt hier keine Person. Der Name sagt das an der Aufrufstelle, damit
 * niemand ihn als bequemere Variante von `getTicketFor` liest.
 *
 * Gelöschte Tickets bleiben ausgeschlossen: `ALIVE` gilt weiter. Ein Sweeper,
 * der Papierkorb-Tickets anfasst, schriebe Historie an etwas, das niemand mehr
 * sieht.
 */
export function getTicketUnchecked(ticketId: string): MITSTicket | null {
  const row = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.id = ?`)
    .get(ticketId) as TicketRow | undefined;
  return row ? rowToTicket(row) : null;
}

/**
 * Opened and closed today, for the stats widget.
 *
 * Compared on the ISO date prefix: `created_at` is stored as an ISO string in
 * UTC, so this is "today in UTC". Good enough for a counter, and it avoids
 * pulling a timezone library in for one tile.
 */
export function todayCounts(): { opened: number; closed: number } {
  const today = new Date().toISOString().slice(0, 10);

  const opened = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket
        WHERE ${ALIVE} AND substr(mits_ticket.created_at, 1, 10) = ?`,
    )
    .get(today) as { count: number };

  const closed = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket
        WHERE ${ALIVE}
          AND mits_ticket.status IN ('closed', 'resolved')
          AND substr(created_at, 1, 10) = ?`,
    )
    .get(today) as { count: number };

  return { opened: opened.count, closed: closed.count };
}

/** First non-empty text answer, so a list row says something useful. */
function deriveTitle(payload: Record<string, unknown>, fallback: string): string {
  const candidate = payload.title ?? payload.subject;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim().slice(0, 160);
  }
  return fallback;
}
