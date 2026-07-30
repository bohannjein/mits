import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AgentActions } from "@/components/tickets/agent-actions";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { TicketLinks } from "@/components/tickets/ticket-links";
import { TicketThread } from "@/components/tickets/ticket-thread";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { getFeatureFlags } from "@/lib/features";
import { getFormSchema } from "@/lib/form-schemas";
import { getLocation } from "@/lib/locations";
import { listCommentsFor } from "@/lib/ticket-comments";
import { listLinksFor } from "@/lib/ticket-links";
import { getTicketFor } from "@/lib/tickets";
import { listUsers } from "@/lib/users";
import { fillCannedResponse, formatTicketNumber } from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The agent's view: everything the reporter sees, plus the workflow panel and
   internal notes.

   Guarded with `requireRole("technician")`, so a reporter handed this URL lands
   in their own portal rather than on a page that merely hides the controls.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AgentTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("technician", `/mits/tickets/${id}`);
  const flags = getFeatureFlags();

  // Answers null both for "does not exist" and "not visible", so a 404 leaks
  // nothing about which ids are real.
  const ticket = getTicketFor(id, user);
  if (!ticket) notFound();

  // Only staff may hold a ticket, so only staff appear in the picker.
  const agents = listUsers()
    .filter((candidate) => canViewBoard(candidate.role))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
    }));

  const assignee = ticket.assigned_to
    ? (agents.find((agent) => agent.id === ticket.assigned_to)?.name ??
      "zugewiesen")
    : null;

  return (
    <>
      <AppHeader />
      <TicketDetail
        ticket={ticket}
        schema={
          ticket.form_schema_id ? getFormSchema(ticket.form_schema_id) : undefined
        }
        location={ticket.location_id ? getLocation(ticket.location_id) : null}
        backHref="/mits"
        backLabel="Queue"
        assigneeName={assignee}
      >
        <AgentActions ticket={ticket} agents={agents} currentUserId={user.id} />

        {flags.feature_ticket_linking && (
          <TicketLinks
            ticketId={ticket.id}
            links={listLinksFor(id, user).map((link) => ({
              id: link.id,
              label: link.label,
              otherId: link.other.id,
              otherNumber: link.otherNumber,
              otherTitle: link.other.title,
              otherStatus: link.other.status,
            }))}
          />
        )}

        <TicketThread
          ticketId={ticket.id}
          comments={listCommentsFor(id, user)}
          isAgent
          cannedResponses={
            flags.feature_canned_responses
              ? listCannedResponses().map((canned) => ({
                  id: canned.id,
                  title: canned.title,
                  // Filled here, not in the browser: the reporter's name is not
                  // something the client should have to be handed for a template.
                  body: fillCannedResponse(canned.body, {
                    ticket_number: formatTicketNumber(ticket.ticket_number),
                    reporter_name: ticket.created_by_email,
                    agent_name: user.name,
                  }),
                }))
              : []
          }
        />
      </TicketDetail>
    </>
  );
}
