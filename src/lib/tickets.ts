import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { canViewBoard, toRole } from "@/lib/auth/roles";
import { db, nextTicketNumber } from "@/lib/db/sqlite";
import { publish } from "@/lib/services/realtime";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields, schemaToZod } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { UploadError, linkUploadsToTicket } from "@/lib/storage";
import {
  DEFAULT_TICKET_SORT,
  orderByFor,
  type TicketSort,
} from "@/lib/ticket-sort";
import { TICKETS_PER_PAGE } from "@/lib/ticket-paging";
import {
  AttachmentMetaSchema,
  DEFAULT_TICKET_PRIORITY,
  MITSTicketSchema,
  OPEN_TICKET_STATUSES,
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
  major_incident?: number | null;
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
  logged_minutes?: number | null;
}

function rowToTicket(row: TicketRow): MITSTicket {
  return MITSTicketSchema.parse({
    id: row.id,
    // Zero for a row the backfill has not reached; renders as 0, which is
    // visibly broken rather than quietly plausible.
    ticket_number: row.ticket_number ?? 0,
    location_id: row.location_id,
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
    major_incident: row.major_incident === 1,
    // The empty string is the SQL "no activity for this reader" sentinel — see the
    // MAX(...) expression in `searchTickets`. Passing it to `z.coerce.date()` would
    // produce an Invalid Date, which renders as "NaN" rather than as nothing.
    last_activity_at: row.last_activity_at ? row.last_activity_at : null,
    unread: row.unread === 1,
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
   * form is one client of `POST /api/tickets`, the draft schema has a `priority`
   * field with a default, and "the UI does not offer it" is not a rule — anybody
   * can post JSON. Clamped rather than rejected, because a stale cached form
   * legitimately still submits the field and a 422 for it would block a ticket
   * over a value the reporter never chose.
   *
   * Staff keep whatever they set: an agent filing on somebody's behalf has already
   * made the judgement this rule exists to protect.
   */
  const priority = canViewBoard(user.role)
    ? draft.priority
    : DEFAULT_TICKET_PRIORITY;

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

  const ticket: TicketRow = {
    id: randomUUID(),
    // Filled inside the transaction below, where the read cannot race an insert.
    ticket_number: null,
    location_id: draft.location_id,
    // Ownership is always the account. Only the *display and reply* address can
    // differ, and only for the mail ingest — see `MailIngestOrigin`.
    created_by: user.id,
    created_by_email: origin?.reporterEmail.trim() || user.email,
    source,
    form_schema_id: schema.id,
    title: deriveTitle(parsed.data, schema.title),
    payload: JSON.stringify(parsed.data),
    status: "open",
    priority,
    assigned_to: null,
    created_at: new Date().toISOString(),
  };

  const fileIds = collectFileIds(schema, parsed.data);

  const insert = db.prepare(
    `INSERT INTO mits_ticket
       (id, ticket_number, location_id, created_by, created_by_email, source,
        form_schema_id, title, payload, status, priority, assigned_to, created_at,
        tags, major_incident)
     VALUES
       (@id, @ticket_number, @location_id, @created_by, @created_by_email, @source,
        @form_schema_id, @title, @payload, @status, @priority, @assigned_to,
        @created_at, '[]', 0)`,
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

  return rowToTicket(ticket);
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
  mits_ticket.created_by, mits_ticket.created_by_email, mits_ticket.source,
  mits_ticket.form_schema_id, mits_ticket.title, mits_ticket.payload,
  mits_ticket.status, mits_ticket.priority, mits_ticket.assigned_to,
  mits_ticket.created_at, mits_ticket.tags, mits_ticket.major_incident,
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
 * A single ticket, or null when it does not exist **or** the user may not see it.
 * Returning the same answer for both cases keeps ticket ids from leaking through
 * a 403-versus-404 difference.
 */
export function getTicketFor(id: string, user: SessionUser): MITSTicket | null {
  const row = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND mits_ticket.id = ?`)
    .get(id) as TicketRow | undefined;
  if (!row) return null;
  if (!canViewBoard(user.role) && row.created_by !== user.id) return null;
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
  status?: TicketStatus;
  priority?: TicketPriority;
  /** Agent id, or the literal "unassigned". */
  assignedTo?: string;
  /** Inclusive ISO dates, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Narrow a agent's or admin's result set to their own tickets. */
  ownOnly?: boolean;

  /*
   * Set by the queue-view presets (`lib/agent-views.ts`) rather than by the
   * filter form. They combine with the single-value filters above with AND, so a
   * tab plus a deep filter narrows twice — which is what an agent expects when
   * they filter inside a tab.
   */
  statusIn?: TicketStatus[];
  priorityIn?: TicketPriority[];
  unassignedOnly?: boolean;

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

  if (!staff || filter.ownOnly) {
    clauses.push("mits_ticket.created_by = ?");
    whereParams.push(user.id);
  }

  const q = filter.q?.trim();
  if (q) {
    // LIKE with escaped wildcards: a query containing % or _ should match those
    // characters, not turn into a pattern.
    const pattern = `%${q.replace(/[\%_]/g, (c) => `\${c}`)}%`;
    clauses.push(
      "(mits_ticket.title LIKE ? ESCAPE '\' OR mits_ticket.created_by_email LIKE ? ESCAPE '\')",
    );
    whereParams.push(pattern, pattern);
  }

  if (filter.locationId) {
    clauses.push("mits_ticket.location_id = ?");
    whereParams.push(filter.locationId);
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

  const extraColumns = `,
         ${activity} AS last_activity_at,
         CASE
           WHEN ${activity} = '' THEN 0
           WHEN ${readAt} IS NULL THEN 1
           WHEN ${readAt} < ${activity} THEN 1
           ELSE 0
         END AS unread,
         ${logged} AS logged_minutes`;

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
  if (!canViewBoard(user.role) && row.created_by !== user.id) return null;
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

  db.prepare("UPDATE mits_ticket SET status = ? WHERE id = ?").run(
    status,
    ticketId,
  );

  // Only a real change is logged. A dropdown re-set to its current value would
  // otherwise fill the history with entries that say nothing happened.
  if (before.status !== status) {
    recordAudit(ticketId, actor, "status_changed", {
      field: "status",
      from: before.status,
      to: status,
    });
    // Only on a real change, for the same reason the audit entry is: a signal
    // that fires when nothing happened teaches every listener to distrust it.
    announce(ticketId, actor.id);
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
