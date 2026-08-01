import "server-only";

import { z } from "zod";

import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { db } from "@/lib/db/sqlite";
import { addComment } from "@/lib/ticket-comments";
import { templateValuesFor } from "@/lib/template-values";
import { assignTicket, setTicketPriority, setTicketStatus } from "@/lib/tickets";
import {
  MacroSchema,
  TicketPriority,
  TicketStatus,
  fillCannedResponse,
  type Macro,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Macro store and runner.

   A JSON blob in `mits_setting`, like the canned responses it references. No
   table: the list is short, admin-edited, and read on one page.

   **The runner reuses the ordinary mutators.** `setTicketStatus`, `assignTicket`
   and `addComment` each re-check what they need to and each write their own audit
   row, so a macro leaves exactly the trail the same three actions performed by
   hand would. A macro that wrote the columns directly would be faster and would be
   a second door into every rule those functions enforce — including the one that
   refuses to assign a ticket to somebody who cannot open it.

   **Nothing is transactional across steps, deliberately.** Each step is a decision
   an agent could have made separately, and a partially applied macro leaves the
   ticket in a state somebody can see and finish. Wrapping the lot in a transaction
   would mean a failed mail send rolls back a status change that was correct.
   ────────────────────────────────────────────────────────────────────────── */

const KEY = "macros";
const ListSchema = z.array(MacroSchema);

export class MacroError extends Error {}

export function listMacros(): Macro[] {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(KEY) as { value: string } | undefined;
  if (!row) return [];

  const parsed = ListSchema.safeParse(safeJsonParse(row.value));
  if (!parsed.success) return [];

  return [...parsed.data].sort((a, b) => a.order_index - b.order_index);
}

export function getMacro(id: string): Macro | null {
  return listMacros().find((macro) => macro.id === id) ?? null;
}

export function setMacros(next: Macro[]): Macro[] {
  // Position in the submitted list is the order, so the editor never has to keep
  // an index consistent while rows move.
  const macros = ListSchema.parse(
    next.map((entry, index) => ({ ...entry, order_index: index })),
  );

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, JSON.stringify(macros));

  return macros;
}

export interface MacroOutcome {
  /** What changed, in the order it happened — shown in the confirmation toast. */
  steps: string[];
  /**
   * Placeholder-filled reply text the composer should receive, or null.
   *
   * Only for `reply_mode: "insert"`. Filled on the server for the same reason the
   * canned-response dropdown is: resolving `{reporter_name}` in the browser would
   * mean handing the client the reporter's name so it can render a template.
   */
  insert: string | null;
  /**
   * The resolved reply text, whichever mode produced it, or null.
   *
   * Separate from `insert` because the notification mail needs the words that were
   * actually posted, and `insert` is null in exactly the case — `reply_mode: "send"`
   * — where a mail goes out. Deriving the mail body from `insert` would have sent
   * the macro's *title* to the customer.
   */
  body: string | null;
  /** True when the macro posted the reply itself. */
  sent: boolean;
}

/**
 * Apply a macro to a ticket.
 *
 * The caller has already resolved the ticket through `getTicketFor` and is
 * responsible for the revalidation and the notification mail — this function does
 * the state changes and reports what it did.
 */
export function runMacro(
  macro: Macro,
  ticket: MITSTicket,
  user: SessionUser,
): MacroOutcome {
  // Re-checked here and not only in the action: this is a library function, and
  // the next call site has not been written yet.
  if (!canViewBoard(user.role)) {
    throw new MacroError("Makros sind Agenten vorbehalten.");
  }

  const steps: string[] = [];

  /*
   * Unrecognised values are skipped, not rejected.
   *
   * A macro authored against a status a later build removed should still do its
   * other three things rather than refusing entirely — and the admin page shows
   * the stored value, so the broken part is visible where it can be fixed.
   */
  const status = TicketStatus.safeParse(macro.set_status);
  if (macro.set_status !== "" && status.success && ticket.status !== status.data) {
    setTicketStatus(ticket.id, status.data, user);
    steps.push(`Status: ${status.data}`);
  }

  const priority = TicketPriority.safeParse(macro.set_priority);
  if (
    macro.set_priority !== "" &&
    priority.success &&
    ticket.priority !== priority.data
  ) {
    setTicketPriority(ticket.id, priority.data, user);
    steps.push(`Priorität: ${priority.data}`);
  }

  if (macro.assign === "self" && ticket.assigned_to !== user.id) {
    assignTicket(ticket.id, user.id, user);
    steps.push("Dir zugewiesen");
  } else if (macro.assign === "unassign" && ticket.assigned_to !== null) {
    assignTicket(ticket.id, null, user);
    steps.push("Zuweisung entfernt");
  }

  let insert: string | null = null;
  let body: string | null = null;
  let sent = false;

  if (macro.canned_response_id !== "") {
    const canned = listCannedResponses().find(
      (entry) => entry.id === macro.canned_response_id,
    );

    /*
     * A macro pointing at a deleted response fails loudly rather than quietly
     * skipping the reply. The field changes above have already been applied and
     * are correct; what must not happen is "Makro ausgeführt" on a ticket where
     * the customer was never actually answered.
     */
    if (!canned) {
      throw new MacroError(
        "Der Textbaustein dieses Makros existiert nicht mehr. Die Feldänderungen wurden übernommen, es wurde aber nicht geantwortet.",
      );
    }

    // One resolver, shared with the ticket page's dropdown. Two hand-built
    // objects had already drifted on what `reporter_name` meant.
    body = fillCannedResponse(canned.body, templateValuesFor(ticket, user.name));

    if (macro.reply_mode === "send") {
      // Plain text, not HTML: a canned response is stored as text and handing it
      // to the sanitiser as markup would collapse its line breaks.
      addComment(ticket.id, user, body, "public", "text");
      sent = true;
      steps.push("Antwort gesendet");
    } else {
      insert = body;
      steps.push("Textbaustein eingesetzt");
    }
  }

  return { steps, insert, body, sent };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
