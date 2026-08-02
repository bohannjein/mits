import "server-only";

import { recordAudit } from "@/lib/audit";
import { canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { publish } from "@/lib/services/realtime";
import {
  isChecklistValueFor,
  type ChecklistItem,
  type ChecklistValue,
  type MITSFormSchema,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   What the agent did, step by step.

   The steps come from the ticket type (`schema.checklist`), the answers from this
   table. Keeping them apart is what makes both halves editable without breaking the
   other: an admin can rename a step or add one to a type whose tickets are already
   open, and the answers given so far keep pointing at the ids they were given for.

   **The definition decides what exists.** A row whose `item_id` is no longer in the
   schema is not read and not displayed — it is left in place rather than deleted,
   because a step removed today may be a step restored tomorrow, and the answer is a
   record of work that was actually done. Nothing joins on it, so an orphan costs a
   row and no correctness.

   **Every write is audited.** That is the whole point of the feature: the panel
   shows the current state, the trail shows the sequence — including a step that was
   ticked, untucked and ticked again, which is exactly the history somebody asking
   "what happened here" needs. Nothing is ever locked; a wrong answer is corrected,
   not frozen.

   Agents only, checked here and not just in the action: a reporter has no business
   documenting the work on their own ticket, and the panel is not rendered for them
   either.
   ────────────────────────────────────────────────────────────────────────── */

export class ChecklistError extends Error {}

/** One step with its current answer, ready to render. */
export interface ChecklistRow extends ChecklistItem {
  value: ChecklistValue;
  /** Who gave the current answer, empty while there is none. */
  answeredBy: string;
  answeredAt: Date | null;
}

interface ChecklistStateRow {
  item_id: string;
  value: string;
  user_name: string;
  updated_at: string;
}

/** The stored answers for one ticket, keyed by step id. */
function statesFor(ticketId: string): Map<string, ChecklistStateRow> {
  const rows = db
    .prepare(
      `SELECT item_id, value, user_name, updated_at
         FROM mits_ticket_checklist
        WHERE ticket_id = ?`,
    )
    .all(ticketId) as ChecklistStateRow[];

  return new Map(rows.map((row) => [row.item_id, row]));
}

/**
 * The checklist for one ticket: the type's steps, in the admin's order, each with
 * whatever has been answered.
 *
 * Returns an empty array when the type defines no steps — the caller then renders
 * nothing, which is the same house rule every other optional panel follows.
 *
 * A stored value that does not fit its step's kind is dropped back to unanswered
 * rather than shown: it can only come from a step whose kind an admin changed after
 * the fact, and "Ja" on something that is now a checkbox is not an answer to the
 * question being asked.
 */
export function checklistFor(
  ticketId: string,
  schema: MITSFormSchema | undefined,
): ChecklistRow[] {
  const items = schema?.checklist ?? [];
  if (items.length === 0) return [];

  const states = statesFor(ticketId);

  return items.map((item) => {
    const state = states.get(item.id);
    const usable =
      state !== undefined && isChecklistValueFor(item.kind, state.value);

    return {
      ...item,
      value: usable ? (state.value as ChecklistValue) : "",
      answeredBy: usable && state.value !== "" ? state.user_name : "",
      answeredAt:
        usable && state.value !== "" ? new Date(state.updated_at) : null,
    };
  });
}

/**
 * Record an answer. `""` clears one.
 *
 * Validated against the *schema*, not against the request: the step has to exist in
 * the ticket's own type and the value has to fit that step's kind. Without the first
 * check a hand-built request could write documentation for a step nobody ever
 * defined; without the second, a `yes` on a checkbox would render as unanswered and
 * look like a lost write.
 */
export function setChecklistValue(
  ticketId: string,
  schema: MITSFormSchema | undefined,
  itemId: string,
  value: string,
  user: SessionUser,
): ChecklistRow[] {
  if (!canViewBoard(user.role)) {
    throw new ChecklistError("Die Checkliste ist Agenten vorbehalten.");
  }

  const item = (schema?.checklist ?? []).find((entry) => entry.id === itemId);
  if (!item) {
    throw new ChecklistError("Dieser Schritt gehört nicht zu diesem Ticket.");
  }
  if (!isChecklistValueFor(item.kind, value)) {
    throw new ChecklistError("Diese Antwort passt nicht zu diesem Schritt.");
  }

  const previous = statesFor(ticketId).get(itemId)?.value ?? "";
  const stamp = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO mits_ticket_checklist
         (ticket_id, item_id, value, user_id, user_name, updated_at)
       VALUES (@ticket_id, @item_id, @value, @user_id, @user_name, @updated_at)
       ON CONFLICT(ticket_id, item_id) DO UPDATE SET
         value      = excluded.value,
         user_id    = excluded.user_id,
         user_name  = excluded.user_name,
         updated_at = excluded.updated_at`,
    ).run({
      ticket_id: ticketId,
      item_id: itemId,
      value,
      user_id: user.id,
      user_name: user.name,
      updated_at: stamp,
    });

    /*
     * Inside the transaction, so an answer cannot exist without its trail entry.
     * The label rather than the id: an id is a slug an admin never sees, and the
     * history is read by people asking what was done, not by code.
     */
    recordAudit(ticketId, user, "checklist_set", {
      field: item.label,
      from: describeChecklistValue(item, previous),
      to: describeChecklistValue(item, value),
    });
  })();

  /*
   * Same signals a comment sends, minus `notify`: two agents on one ticket should
   * see each other's ticks live, and the reporter is told nothing — this panel does
   * not exist on their page, and a notification about internal documentation would
   * be a leak of the work in progress.
   */
  publish({ type: "ticket", ticketId, audience: "staff", actorId: user.id });
  publish({ type: "queue", audience: "staff", actorId: user.id });

  return checklistFor(ticketId, schema);
}

/**
 * A value as it reads in the history.
 *
 * The audit trail is prose for a human; `done` and `yes` are storage. An empty value
 * is "offen" rather than an empty cell, so a cleared step reads as a step somebody
 * deliberately reopened.
 */
export function describeChecklistValue(
  item: Pick<ChecklistItem, "kind">,
  value: string,
): string {
  if (value === "") return "offen";
  if (item.kind === "check") return value === "done" ? "erledigt" : "offen";
  return value === "yes" ? "Ja" : "Nein";
}

/** Answered steps and total, for the section badge. */
export function checklistProgress(rows: ChecklistRow[]): {
  answered: number;
  total: number;
} {
  return {
    answered: rows.filter((row) => row.value !== "").length,
    total: rows.length,
  };
}
