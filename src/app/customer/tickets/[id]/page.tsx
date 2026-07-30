import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { TicketThread } from "@/components/tickets/ticket-thread";
import { requireUser } from "@/lib/auth/session";
import { getFormSchema } from "@/lib/form-schemas";
import { getLocation } from "@/lib/locations";
import { listCommentsFor } from "@/lib/ticket-comments";
import { getTicketFor } from "@/lib/tickets";

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
        backLabel="Meine Tickets"
      >
        <TicketThread
          ticketId={ticket.id}
          comments={listCommentsFor(id, user)}
          isAgent={false}
        />
      </TicketDetail>
    </>
  );
}
