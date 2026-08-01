import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPinIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { TicketComposer } from "@/components/tickets/ticket-composer";
import { TicketFrame } from "@/components/tickets/ticket-frame";
import { TicketLive } from "@/components/tickets/ticket-live";
import { TicketMessages } from "@/components/tickets/ticket-messages";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { listUploadsForTicket } from "@/lib/storage";
import { collectLinks } from "@/lib/ticket-resources";
import { TicketResources } from "@/components/tickets/ticket-resources";
import { WithdrawTicket } from "@/components/tickets/withdraw-ticket";
import {
  Accordion as ResourceAccordion,
  AccordionContent as ResourceAccordionContent,
  AccordionItem as ResourceAccordionItem,
  AccordionTrigger as ResourceAccordionTrigger,
} from "@/components/ui/accordion";
import {
  listCommentsFor,
  ticketActivityFingerprint,
} from "@/lib/ticket-comments";
import {
  fieldsBesidesOpening,
  openingFieldName,
  openingMessageFor,
} from "@/lib/ticket-opening";
import {
  getTicketFor,
  getTicketSeenAt,
  markTicketRead,
} from "@/lib/tickets";
import { findUser } from "@/lib/users";
import { TICKET_STATUS_LABELS, formatTicketNumber } from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The reporter's view of their own ticket: a messenger, and nothing else.

   The same `TicketFrame` the agent page uses, without the sidebar. What was in
   that second column — priority, assignee, the structured answers pinned open
   beside the conversation — is either none of the reporter's business or a second
   copy of what they already wrote. A person checking on their ticket wants to know
   whether anybody answered; everything competing with that is noise.

   So: one centred column, a slim head, the conversation. The answers survive as a
   collapsed accordion inside the head, because they are the reporter's own data
   and occasionally worth re-reading — closed by default, and without the field
   that is now the opening bubble.

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
  // Read before the bookmark moves — same ordering as the agent page.
  const seenAt = getTicketSeenAt(id, user.id);
  markTicketRead(id, user.id);

  const flags = getFeatureFlags();

  // The same visibility-filtered thread the bubbles are built from, so a link
  // posted in an internal note cannot reach this list.
  const comments = listCommentsFor(id, user);


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

  /*
   * Files and links, gathered once. After `opening`, which is part of the thread
   * the links are pulled from — the reporter's own first message frequently holds
   * the address of whatever is broken.
   */
  const resources = {
    files: listUploadsForTicket(id),
    links: collectLinks([...(opening ? [opening] : []), ...comments]),
  };

  return (
    <>
      <AppHeader />
      {/*
        The same frame the agent view uses, minus the sidebar: static head,
        scrolling conversation, fixed reply box. Symmetric on purpose — a reporter
        and an agent looking at the same ticket should be looking at the same
        shape, so "scroll up to the third message" means the same thing in both.
      */}
      <main className="flex flex-1 flex-col items-center px-6 py-8 lg:min-h-0 lg:overflow-hidden">
        <div className="flex w-full max-w-3xl flex-1 flex-col lg:min-h-0">
          {/* The reporter's half of the live loop. An answer from the desk lands
              in the thread within seconds instead of on the next page load — the
              one thing somebody watching their own ticket is waiting for. */}
          <TicketLive
            ticketId={ticket.id}
            fingerprint={ticketActivityFingerprint(ticket, user)}
          />
          <TicketFrame
            header={
              <>
                <BackLink
                  href="/customer/tickets"
                  label="Zurück zu meinen Tickets"
                />
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatTicketNumber(ticket.ticket_number)}
                  </span>
                  <h1 className="text-xl font-normal tracking-tight sm:text-2xl">
                    {ticket.title}
                  </h1>
                </div>

                {/*
                  Status and site only. No priority badge: a reporter cannot set it
                  and seeing "Niedrig" on the problem stopping their day reads as a
                  verdict rather than as scheduling.
                */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="h-auto rounded-full px-3 py-1"
                  >
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

                {/*
                  Collapsed, and inside the static head rather than above the
                  thread: the reporter's own answers are worth re-reading
                  occasionally and are not what they came for.
                */}
                {/*
                  Files and links from this ticket, collapsed.
                  Same place as "Meine Angaben" and for the same reason: worth
                  having, not what the reporter came for. Renders nothing at all
                  when there is neither.
                */}
                {(resources.files.length > 0 || resources.links.length > 0) && (
                  <ResourceAccordion type="single" collapsible className="mt-3">
                    <ResourceAccordionItem
                      value="resources"
                      className="rounded-2xl border border-border px-4"
                    >
                      <ResourceAccordionTrigger className="py-2.5 text-sm hover:no-underline">
                        Dateien und Links
                      </ResourceAccordionTrigger>
                      <ResourceAccordionContent className="pb-4">
                        <TicketResources
                          files={resources.files}
                          links={resources.links}
                        />
                      </ResourceAccordionContent>
                    </ResourceAccordionItem>
                  </ResourceAccordion>
                )}

                {/*
                  Only while nobody has picked it up. `withdrawTicket` checks the
                  same condition against the row — this just avoids offering a
                  button that would be refused.
                */}
                {ticket.status === "open" && ticket.assigned_to === null && (
                  <div className="mt-3">
                    <WithdrawTicket ticketId={ticket.id} />
                  </div>
                )}

                {fields.length > 0 && (
                  <Accordion type="single" collapsible className="mt-3">
                    <AccordionItem
                      value="fields"
                      className="rounded-2xl border border-border px-4"
                    >
                      <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
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
              </>
            }
            messages={
              <TicketMessages
                comments={[...(opening ? [opening] : []), ...comments]}
                viewerId={user.id}
                ticketId={ticket.id}
                canEdit={flags.feature_message_editing}
                canRetract={flags.feature_message_retract}
                seenAt={seenAt}
                emptyText="Noch keine Antwort. Wir melden uns hier."
              />
            }
            composer={
              // `plain`, not the rich editor: a formatting toolbar is furniture on
              // a page whose whole point is to be minimal.
              <TicketComposer
                ticketId={ticket.id}
                isAgent={false}
                variant="plain"
              />
            }
          />
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
