import "server-only";

import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/sqlite";
import { getTicketFor } from "@/lib/tickets";
import {
  TICKET_LINK_INVERSE_LABELS,
  TICKET_LINK_LABELS,
  TicketLinkKind,
  formatTicketNumber,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket relations.

   One row per pair, in the direction it was stated. The other side reads the
   inverse label — storing both directions would be storing one fact twice, and
   the two copies can drift.

   The access rule is the interesting part: a link list is a window into other
   tickets, so every target is re-checked with `getTicketFor`. A ticket the caller
   may not see is omitted entirely rather than shown as locked — "there is a
   ticket here you cannot open" is still information about which tickets exist.
   ────────────────────────────────────────────────────────────────────────── */

export class TicketLinkError extends Error {}

interface LinkRow {
  id: string;
  from_ticket: string;
  to_ticket: string;
  kind: string;
  created_by: string;
  created_at: string;
}

export interface ResolvedLink {
  id: string;
  /** How it reads from the ticket being viewed. */
  label: string;
  /** The ticket on the other end — already access-checked. */
  other: MITSTicket;
  otherNumber: string;
}

/**
 * Links visible from this ticket, in both stored directions.
 *
 * Two queries rather than an `OR`: the direction decides which label applies, and
 * a single query would have to carry that decision as a computed column.
 */
export function listLinksFor(
  ticketId: string,
  user: SessionUser,
): ResolvedLink[] {
  const outgoing = db
    .prepare(
      `SELECT id, from_ticket, to_ticket, kind, created_by, created_at
         FROM mits_ticket_link WHERE from_ticket = ? ORDER BY created_at ASC`,
    )
    .all(ticketId) as LinkRow[];

  const incoming = db
    .prepare(
      `SELECT id, from_ticket, to_ticket, kind, created_by, created_at
         FROM mits_ticket_link WHERE to_ticket = ? ORDER BY created_at ASC`,
    )
    .all(ticketId) as LinkRow[];

  const resolved: ResolvedLink[] = [];

  for (const row of outgoing) {
    const kind = TicketLinkKind.safeParse(row.kind);
    if (!kind.success) continue;
    const other = getTicketFor(row.to_ticket, user);
    if (!other) continue;
    resolved.push({
      id: row.id,
      label: TICKET_LINK_LABELS[kind.data],
      other,
      otherNumber: formatTicketNumber(other.ticket_number),
    });
  }

  for (const row of incoming) {
    const kind = TicketLinkKind.safeParse(row.kind);
    if (!kind.success) continue;
    const other = getTicketFor(row.from_ticket, user);
    if (!other) continue;
    resolved.push({
      id: row.id,
      label: TICKET_LINK_INVERSE_LABELS[kind.data],
      other,
      otherNumber: formatTicketNumber(other.ticket_number),
    });
  }

  return resolved;
}

/**
 * Create a link.
 *
 * Both ends are access-checked against the caller — linking to a ticket you
 * cannot see would let you confirm it exists, and would put its title in front of
 * you the moment the list renders.
 */
export function addLink(
  fromTicketId: string,
  targetNumber: number,
  kind: string,
  user: SessionUser,
): ResolvedLink {
  const parsedKind = TicketLinkKind.safeParse(kind);
  if (!parsedKind.success) throw new TicketLinkError("Unbekannte Beziehung.");

  const from = getTicketFor(fromTicketId, user);
  if (!from) throw new TicketLinkError("Ticket nicht gefunden.");

  const target = db
    .prepare(
      // A deleted ticket cannot be linked to: it would render as a dead row in the
      // relations card of whatever it was attached to.
      "SELECT id FROM mits_ticket WHERE deleted_at IS NULL AND ticket_number = ?",
    )
    .get(targetNumber) as { id: string } | undefined;

  // Same answer for "no such number" and "not yours", so the number space cannot
  // be probed through this form.
  const to = target ? getTicketFor(target.id, user) : null;
  if (!to) {
    throw new TicketLinkError(
      `Ticket ${formatTicketNumber(targetNumber)} wurde nicht gefunden.`,
    );
  }

  if (to.id === from.id) {
    throw new TicketLinkError("Ein Ticket kann nicht mit sich selbst verknüpft werden.");
  }

  // The unique index covers one direction; the reverse has to be rejected here,
  // because (A,B) and (B,A) are different rows to SQLite and the same fact to us.
  const existing = db
    .prepare(
      `SELECT id FROM mits_ticket_link
        WHERE (from_ticket = ? AND to_ticket = ?)
           OR (from_ticket = ? AND to_ticket = ?)`,
    )
    .get(from.id, to.id, to.id, from.id) as { id: string } | undefined;

  if (existing) {
    throw new TicketLinkError(
      `Ticket ${formatTicketNumber(to.ticket_number)} ist bereits verknüpft.`,
    );
  }

  const row: LinkRow = {
    id: randomUUID(),
    from_ticket: from.id,
    to_ticket: to.id,
    kind: parsedKind.data,
    created_by: user.id,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO mits_ticket_link
       (id, from_ticket, to_ticket, kind, created_by, created_at)
     VALUES (@id, @from_ticket, @to_ticket, @kind, @created_by, @created_at)`,
  ).run(row);

  /*
   * Logged on both tickets. A relation is a fact about the pair, and an agent looking
   * at the other one has to be able to see where it came from — a history that only
   * exists on the side somebody happened to act from is half a history.
   */
  recordAudit(from.id, user, "link_added", {
    field: TICKET_LINK_LABELS[parsedKind.data],
    to: formatTicketNumber(to.ticket_number),
  });
  recordAudit(to.id, user, "link_added", {
    field: TICKET_LINK_INVERSE_LABELS[parsedKind.data],
    to: formatTicketNumber(from.ticket_number),
  });

  return {
    id: row.id,
    label: TICKET_LINK_LABELS[parsedKind.data],
    other: to,
    otherNumber: formatTicketNumber(to.ticket_number),
  };
}

/**
 * Remove a link.
 *
 * Only from a ticket the caller can see, and only a link that actually touches
 * it — otherwise a known link id would be enough to unpick relations between
 * tickets the caller has no access to.
 */
export function removeLink(
  linkId: string,
  ticketId: string,
  user: SessionUser,
): void {
  if (!getTicketFor(ticketId, user)) {
    throw new TicketLinkError("Ticket nicht gefunden.");
  }

  const result = db
    .prepare(
      `DELETE FROM mits_ticket_link
        WHERE id = ? AND (from_ticket = ? OR to_ticket = ?)`,
    )
    .run(linkId, ticketId, ticketId);

  if (result.changes === 0) {
    throw new TicketLinkError("Verknüpfung nicht gefunden.");
  }

  // Only on the ticket it was removed from: the row is gone, so the other id is no
  // longer available to log against without a second lookup for no benefit.
  recordAudit(ticketId, user, "link_removed", { field: linkId });
}
