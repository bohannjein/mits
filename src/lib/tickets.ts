import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
import { canViewBoard } from "@/lib/auth/roles";
import { db } from "@/lib/db/sqlite";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields, schemaToZod } from "@/lib/forms/schema-to-zod";
import { UploadError, linkUploadsToTicket } from "@/lib/storage";
import {
  AttachmentMetaSchema,
  MITSTicketSchema,
  type MITSTicket,
  type MITSTicketDraft,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket persistence and access rules.

   Ownership is decided here, once. Callers pass the session user; there is no
   code path that takes an owner id from the request body.
   ────────────────────────────────────────────────────────────────────────── */

interface TicketRow {
  id: string;
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

  const ticket: TicketRow = {
    id: randomUUID(),
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
       (id, created_by, created_by_email, source, form_schema_id, title,
        payload, status, priority, assigned_to, created_at)
     VALUES
       (@id, @created_by, @created_by_email, @source, @form_schema_id, @title,
        @payload, @status, @priority, @assigned_to, @created_at)`,
  );

  // One transaction: a payload referencing a foreign or already-used attachment
  // must not leave a half-created ticket behind.
  try {
    db.transaction(() => {
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
  SELECT id, created_by, created_by_email, source, form_schema_id, title,
         payload, status, priority, assigned_to, created_at
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

export function countTickets(): { total: number; open: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
         FROM mits_ticket`,
    )
    .get() as { total: number; open: number | null };
  return { total: row.total, open: row.open ?? 0 };
}

/** First non-empty text answer, so a list row says something useful. */
function deriveTitle(payload: Record<string, unknown>, fallback: string): string {
  const candidate = payload.title ?? payload.subject;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim().slice(0, 160);
  }
  return fallback;
}
