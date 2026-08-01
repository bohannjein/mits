import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPinIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { TicketThread } from "@/components/tickets/ticket-thread";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { listCommentsFor } from "@/lib/ticket-comments";
import {
  fieldsBesidesOpening,
  openingFieldName,
  openingMessageFor,
} from "@/lib/ticket-opening";
import { getTicketFor, markTicketRead } from "@/lib/tickets";
import { findUser } from "@/lib/users";
import { TICKET_STATUS_LABELS, formatTicketNumber } from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The reporter's view of their own ticket: a messenger, and nothing else.

   Deliberately not the two-column `TicketDetail` the agent page shares. What was
   in that second column — priority, assignee, the structured answers pinned open
   beside the conversation — is either none of the reporter's business or a second
   copy of what they already wrote. A person checking on their ticket wants to know
   whether anybody answered; everything competing with that is noise.

   So: one centred column, a slim head, the conversation. The answers survive as a
   collapsed accordion below the head, because they are the reporter's own data and
   occasionally worth re-reading — closed by default, and without the field that is
   now the opening bubble.

   `listCommentsFor` never hands a reporter an internal note; the filter is in the
   SQL, not in this page.
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

  const schema = ticket.form_schema_id
    ? getFormSchema(ticket.form_schema_id)
    : undefined;
  const location = ticket.location_id ? getLocation(ticket.location_id) : null;

  const reporterName =
    findUser(ticket.created_by)?.name ?? ticket.created_by_email;
  const opening = openingMessageFor(ticket, schema, reporterName);

  const labels = new Map(
    schema ? resolveFields(schema).map((field) => [field.name, field.label]) : [],
  );
  const fields = fieldsBesidesOpening(
    Object.entries(ticket.payload).map(([name, value]) => ({
      name,
      label: labels.get(name) ?? name,
      text: formatValue(value),
    })),
    opening ? openingFieldName(ticket.payload, schema) : null,
  ).filter((row) => row.text !== "");

  return (
    <>
      <AppHeader />
      {/*
        `overflow-hidden` on the frame: the conversation scrolls inside its column,
        the page does not. Without it the browser shows one scrollbar for
        everything and the composer walks off the bottom of a long thread.
      */}
      <main className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-6 py-8">
        <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <header className="shrink-0">
            <BackLink href="/customer/tickets" label="Zurück zu meinen Tickets" />
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm text-muted-foreground">
                {formatTicketNumber(ticket.ticket_number)}
              </span>
              <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">
                {ticket.title}
              </h1>
            </div>
            {/*
              Status and site only. No priority badge: a reporter cannot set it and
              seeing "Niedrig" on the problem stopping their day reads as a verdict
              rather than as scheduling.
            */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-auto rounded-full px-3 py-1">
                {TICKET_STATUS_LABELS[ticket.status]}
              </Badge>
              {location && (
                <Badge
                  variant="outline"
                  className="h-auto rounded-full px-3 py-1 font-normal"
                >
                  <MapPinIcon className="size-3" strokeWidth={1.5} />
                  {location.name}
                </Badge>
              )}
            </div>

            {fields.length > 0 && (
              <Accordion type="single" collapsible className="mt-4">
                <AccordionItem
                  value="fields"
                  className="rounded-2xl border border-border px-4"
                >
                  <AccordionTrigger className="py-3 text-sm hover:no-underline">
                    Meine Angaben
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <dl className="grid gap-3">
                      {fields.map((field) => (
                        <div key={field.name} className="grid gap-0.5">
                          <dt className="text-xs text-muted-foreground">
                            {field.label}
                          </dt>
                          <dd className="text-sm break-words whitespace-pre-wrap">
                            {field.text}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </header>

          <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            <TicketThread
              ticketId={ticket.id}
              comments={[
                ...(opening ? [opening] : []),
                ...listCommentsFor(id, user),
              ]}
              isAgent={false}
            />
          </div>
        </div>
      </main>
    </>
  );
}

/** Same rendering the agent view uses, so one answer reads identically in both. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    return value
      .map((entry) =>
        entry && typeof entry === "object" && "name" in entry
          ? String((entry as { name: unknown }).name)
          : String(entry),
      )
      .join(", ");
  }
  if (typeof value === "object") return "";
  return String(value).trim();
}
