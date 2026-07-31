import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { canViewBoard, toRole } from "@/lib/auth/roles";
import { db, nextTicketNumber } from "@/lib/db/sqlite";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields, schemaToZod } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { UploadError, linkUploadsToTicket } from "@/lib/storage";
import {
  AttachmentMetaSchema,
  MITSTicketSchema,
  OPEN_TICKET_STATUSES,
  type MITSTicket,
  type MITSTicketDraft,
  type TicketPriority,
  type TicketStatus,
} from "@/types/mits";

// Re-exported so `lib/agent-views.ts` builds its presets from one place.
export { OPEN_TICKET_STATUSES };

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
export function createTicket(
  draft: MITSTicketDraft,
  user: SessionUser,
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

  const ticket: TicketRow = {
    id: randomUUID(),
    // Filled inside the transaction below, where the read cannot race an insert.
    ticket_number: null,
    location_id: draft.location_id,
    created_by: user.id,
    created_by_email: user.email,
    source: draft.source,
    form_schema_id: schema.id,
    title: deriveTitle(parsed.data, schema.title),
    payload: JSON.stringify(parsed.data),
    status: "open",
    priority: draft.priority,
    assigned_to: null,
    created_at: new Date().toISOString(),
  };

  const fileIds = collectFileIds(schema, parsed.data);

  const insert = db.prepare(
    `INSERT INTO mits_ticket
       (id, ticket_number, location_id, created_by, created_by_email, source,
        form_schema_id, title, payload, status, priority, assigned_to, created_at)
     VALUES
       (@id, @ticket_number, @location_id, @created_by, @created_by_email, @source,
        @form_schema_id, @title, @payload, @status, @priority, @assigned_to,
        @created_at)`,
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
const ALIVE = "deleted_at IS NULL";

const SELECT_TICKET = `
  SELECT id, ticket_number, location_id, created_by, created_by_email, source,
         form_schema_id, title, payload, status, priority, assigned_to, created_at
    FROM mits_ticket
`;

/** Tickets the user owns. The only listing a plain `user` role can reach. */
export function listOwnTickets(userId: string): MITSTicket[] {
  const rows = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND created_by = ? ORDER BY created_at DESC`)
    .all(userId) as TicketRow[];
  return rows.map(rowToTicket);
}

/** Every ticket — technician board and admin desk only. */
export function listAllTickets(): MITSTicket[] {
  const rows = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} ORDER BY created_at DESC`)
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
  const row = db.prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND id = ?`).get(id) as
    | TicketRow
    | undefined;
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
              SUM(CASE WHEN status IN (${OPEN_PLACEHOLDERS}) THEN 1 ELSE 0 END) AS open
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
  /** Narrow a technician's or admin's result set to their own tickets. */
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
export function searchTickets(
  filter: TicketFilter,
  user: SessionUser,
): MITSTicket[] {
  // Seeded, not appended: an empty filter would otherwise produce no WHERE at all
  // and return deleted tickets.
  const clauses: string[] = [ALIVE];
  const params: unknown[] = [];

  if (!canViewBoard(user.role) || filter.ownOnly) {
    clauses.push("created_by = ?");
    params.push(user.id);
  }

  const q = filter.q?.trim();
  if (q) {
    // LIKE with escaped wildcards: a query containing % or _ should match those
    // characters, not turn into a pattern.
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push(
      "(title LIKE ? ESCAPE '\\' OR created_by_email LIKE ? ESCAPE '\\')",
    );
    params.push(pattern, pattern);
  }

  if (filter.locationId) {
    clauses.push("location_id = ?");
    params.push(filter.locationId);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.priority) {
    clauses.push("priority = ?");
    params.push(filter.priority);
  }
  if (filter.assignedTo === UNASSIGNED_FILTER || filter.unassignedOnly) {
    clauses.push("assigned_to IS NULL");
  } else if (filter.assignedTo) {
    clauses.push("assigned_to = ?");
    params.push(filter.assignedTo);
  }

  // An empty array would render `IN ()`, which is a syntax error in SQLite — and
  // semantically it should match nothing, not everything, so it is skipped rather
  // than treated as "no filter".
  if (filter.statusIn && filter.statusIn.length > 0) {
    clauses.push(`status IN (${filter.statusIn.map(() => "?").join(", ")})`);
    params.push(...filter.statusIn);
  }
  if (filter.priorityIn && filter.priorityIn.length > 0) {
    clauses.push(`priority IN (${filter.priorityIn.map(() => "?").join(", ")})`);
    params.push(...filter.priorityIn);
  }
  // `created_at` is an ISO string, so a date prefix comparison sorts correctly.
  // `to` gets a time suffix rather than `<=` on the bare date, which would
  // exclude everything that happened during the chosen day.
  if (filter.from) {
    clauses.push("created_at >= ?");
    params.push(`${filter.from}T00:00:00.000Z`);
  }
  if (filter.to) {
    clauses.push("created_at <= ?");
    params.push(`${filter.to}T23:59:59.999Z`);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;

  const rows = db
    .prepare(`${SELECT_TICKET} ${where} ORDER BY created_at DESC LIMIT 500`)
    .all(...params) as TicketRow[];

  return rows.map(rowToTicket);
}

/** Look up by the human-readable number, for the search bar's direct jump. */
export function getTicketByNumberFor(
  ticketNumber: number,
  user: SessionUser,
): MITSTicket | null {
  const row = db
    .prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND ticket_number = ?`)
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
      `${SELECT_TICKET} WHERE ${ALIVE} AND assigned_to IS NULL
         AND status IN (${OPEN_PLACEHOLDERS})
         ORDER BY created_at ASC`,
    )
    .all(...OPEN_TICKET_STATUSES) as TicketRow[];
  return rows.map(rowToTicket);
}

/** Open tickets this agent has taken. */
export function listAssignedTickets(agentId: string): MITSTicket[] {
  const rows = db
    .prepare(
      `${SELECT_TICKET} WHERE ${ALIVE} AND assigned_to = ?
         AND status IN (${OPEN_PLACEHOLDERS})
         ORDER BY created_at ASC`,
    )
    .all(agentId, ...OPEN_TICKET_STATUSES) as TicketRow[];
  return rows.map(rowToTicket);
}

export class TicketUpdateError extends Error {}

/**
 * Assign a ticket, or clear the assignment with `null`.
 *
 * Staff only, checked by the caller's `requireRole`. The target has to be a
 * technician or admin: assigning to a plain user would put a ticket in a queue
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
        "Nur Technik und Administration können Tickets übernehmen.",
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
  }

  return requireTicket(ticketId);
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
  }

  return requireTicket(ticketId);
}

/** Read back after a write, so the caller always gets the persisted row. */
function requireTicket(ticketId: string): MITSTicket {
  const row = db.prepare(`${SELECT_TICKET} WHERE ${ALIVE} AND id = ?`).get(ticketId) as
    | TicketRow
    | undefined;
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
        WHERE ${ALIVE} AND substr(created_at, 1, 10) = ?`,
    )
    .get(today) as { count: number };

  const closed = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket
        WHERE ${ALIVE}
          AND status IN ('closed', 'resolved')
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
