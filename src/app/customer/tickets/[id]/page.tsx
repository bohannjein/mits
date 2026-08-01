import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { TicketThread } from "@/components/tickets/ticket-thread";
import { requireUser } from "@/lib/auth/session";
import { getFormSchema } from "@/lib/form-schemas";
import { getLocation } from "@/lib/locations";
import { listCommentsFor } from "@/lib/ticket-comments";
import { getTicketFor, markTicketRead } from "@/lib/tickets";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The reporter's view of their own ticket.

   Lean on purpose: their answers, the conversation, a reply box. No workflow
   panel, no assignee, and `listCommentsFor` never hands a reporter an internal
   note — the filter is in the SQL, not in this page.
   ────────────────────────────────────────────────────────────────────────── */

export default async function CustomerTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/customer/tickets/${id}`);

  // `getTicketFor` answers null both for "does not exist" and "not yours", so a
  // 404 here leaks nothing about which ids are real.
  const ticket = getTicketFor(id, user);
  if (!ticket) notFound();

  // After the visibility check, for the same reason as in the agent view: a stamp
  // written before it would let anybody record a read on a ticket they cannot open.
  markTicketRead(id, user.id);

  return (
    <>
      <AppHeader />
      <TicketDetail
        ticket={ticket}
        schema={
          ticket.form_schema_id ? getFormSchema(ticket.form_schema_id) : undefined
        }
        location={ticket.location_id ? getLocation(ticket.location_id) : null}
        backHref="/customer/tickets"
        backLabel="Zurück zu meinen Tickets"
      >
        {/* Wrapped so the conversation scrolls inside its column instead of
            stretching the page — the same arrangement the agent view uses. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
          <TicketThread
            ticketId={ticket.id}
            comments={listCommentsFor(id, user)}
            isAgent={false}
          />
        </div>
      </TicketDetail>
    </>
  );
}
