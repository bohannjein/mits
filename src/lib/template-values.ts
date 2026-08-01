import "server-only";

import { getFormSchema } from "@/lib/form-schemas";
import { findUser } from "@/lib/users";
import {
  firstNameOf,
  formatTicketNumber,
  type MITSTicket,
  type TemplateValues,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   What a template's placeholders resolve to.

   One resolver, called from both places that fill a template: the canned-response
   dropdown on the ticket page and the macro runner. They used to build the object
   inline, three fields each, and had already drifted — one passed the reporter's
   *address* as `reporter_name` while the other passed the same thing but meant it.
   With six fields and a greeting among them, two hand-built objects is two
   different ways to address the same customer.

   **Resolved on the server, always.** The filled text reaches the browser; the
   inputs do not. Handing a client the reporter's name so it can render a template
   would mean every agent's browser is given the name of everybody they write to,
   for a substitution the server can do in one pass. Same rule the AI triage
   follows: what goes out is confirmed by a person, but it is assembled here.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The ticket's category, as a person would name it.
 *
 * Three sources in order of how specific they are: the form the ticket was filed
 * with, then a `category` answer inside the payload, then nothing. Empty rather
 * than a placeholder word — a template that greets somebody with "Kategorie:
 * Unbekannt" reads worse than one that leaves the line out, and an admin who put
 * the token in a template where it never resolves will see that immediately.
 */
function categoryOf(ticket: MITSTicket): string {
  if (ticket.form_schema_id) {
    const schema = getFormSchema(ticket.form_schema_id);
    if (schema?.title) return schema.title;
  }

  const raw = ticket.payload["category"];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Build the substitution set for one ticket and one agent.
 *
 * The reporter's display name comes from the account, by **id** — not by looking
 * up `created_by_email`. On a mailed-in ticket the two disagree on purpose:
 * `created_by` is the fallback account and `created_by_email` the human. Falling
 * back to the address when there is no account is right; addressing somebody by
 * the fallback mailbox's name would not be.
 */
export function templateValuesFor(
  ticket: MITSTicket,
  agentName: string,
): TemplateValues {
  const reporterName =
    findUser(ticket.created_by)?.name?.trim() || ticket.created_by_email;

  return {
    ticket_number: formatTicketNumber(ticket.ticket_number),
    ticket_category: categoryOf(ticket),
    reporter_name: reporterName,
    reporter_first_name: firstNameOf(reporterName),
    agent_name: agentName,
    agent_first_name: firstNameOf(agentName),
  };
}
