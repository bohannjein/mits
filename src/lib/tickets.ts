import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
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
    // Zero for a row the backfill has not reached; renders as TICK-0, which is
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

  const parsed = schemaToZod(schema, { fileValue: "metadata" }).safeParse(
    draft.payload,
  );
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

const SELECT_TICKET = `
  SELECT id, ticket_number, location_id, created_by, created_by_email, source,
         form_schema_id, title, payload, status, priority, assigned_to, created_at
    FROM mits_ticket
`;

/** Tickets the user owns. The only listing a plain `user` role can reach. */
export function listOwnTickets(userId: string): MITSTicket[] {
  const rows = db
    .prepare(`${SELECT_TICKET} WHERE created_by = ? ORDER BY created_at DESC`)
    .all(userId) as TicketRow[];
  return rows.map(rowToTicket);
}

/** Every ticket — technician board and admin desk only. */
export function listAllTickets(): MITSTicket[] {
  const rows = db
    .prepare(`${SELECT_TICKET} ORDER BY created_at DESC`)
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
  const row = db.prepare(`${SELECT_TICKET} WHERE id = ?`).get(id) as
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
         FROM mits_ticket`,
    )
    .get(...OPEN_TICKET_STATUSES) as { total: number; open: number | null };
  return { total: row.total, open: row.open ?? 0 };
}

/** Look up by the human-readable number, for the search bar's direct jump. */
export function getTicketByNumberFor(
  ticketNumber: number,
  user: SessionUser,
): MITSTicket | null {
  const row = db
    .prepare(`${SELECT_TICKET} WHERE ticket_number = ?`)
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
      `${SELECT_TICKET} WHERE assigned_to IS NULL
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
      `${SELECT_TICKET} WHERE assigned_to = ?
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
export function assignTicket(
  ticketId: string,
  assigneeId: string | null,
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

  db.prepare("UPDATE mits_ticket SET assigned_to = ? WHERE id = ?").run(
    assigneeId,
    ticketId,
  );

  return requireTicket(ticketId);
}

export function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
): MITSTicket {
  db.prepare("UPDATE mits_ticket SET status = ? WHERE id = ?").run(
    status,
    ticketId,
  );
  return requireTicket(ticketId);
}

export function setTicketPriority(
  ticketId: string,
  priority: TicketPriority,
): MITSTicket {
  db.prepare("UPDATE mits_ticket SET priority = ? WHERE id = ?").run(
    priority,
    ticketId,
  );
  return requireTicket(ticketId);
}

/** Read back after a write, so the caller always gets the persisted row. */
function requireTicket(ticketId: string): MITSTicket {
  const row = db.prepare(`${SELECT_TICKET} WHERE id = ?`).get(ticketId) as
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
      "SELECT COUNT(*) AS count FROM mits_ticket WHERE substr(created_at, 1, 10) = ?",
    )
    .get(today) as { count: number };

  const closed = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket
        WHERE status IN ('closed', 'resolved')
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
