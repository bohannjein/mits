import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { TicketChat } from "@/components/tickets/ticket-chat";
import { TicketLinks } from "@/components/tickets/ticket-links";
import { TicketSidebar } from "@/components/tickets/ticket-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { getFeatureFlags } from "@/lib/features";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { listCommentsFor } from "@/lib/ticket-comments";
import { listLinksFor } from "@/lib/ticket-links";
import { getTicketFor } from "@/lib/tickets";
import { listUsers } from "@/lib/users";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  fillCannedResponse,
  formatTicketNumber,
  isElevatedPriority,
} from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The agent's ticket, as a two-column messenger.

   Left: the conversation with a composer pinned to the bottom. Right: a sticky
   column of metadata whose dropdowns apply on change.

   Guarded with `requireRole("technician")`, so a reporter handed this URL lands in
   their own portal rather than on a page that merely hides the controls.
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

  const schema = ticket.form_schema_id
    ? getFormSchema(ticket.form_schema_id)
    : undefined;

  // Same label resolution the renderer uses, so a field is named identically
  // wherever it appears.
  const labels = new Map(
    schema ? resolveFields(schema).map((field) => [field.name, field.label]) : [],
  );
  const fields = Object.entries(ticket.payload)
    .map(([name, value]) => ({
      name,
      label: labels.get(name) ?? name,
      text: formatValue(value),
    }))
    .filter((row) => row.text !== "");

  // Only staff may hold a ticket, so only staff appear in the picker.
  const agents = listUsers()
    .filter((candidate) => canViewBoard(candidate.role))
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-6">
        <div className="flex min-h-0 w-full max-w-7xl flex-1 flex-col">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 w-fit rounded-full px-3 text-muted-foreground"
          >
            <Link href="/mits">
              <ArrowLeftIcon strokeWidth={1.5} />
              Queue
            </Link>
          </Button>

          <div className="mt-4 grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
            {/* Left column. `min-h-0` on every ancestor is what lets the thread
                scroll instead of stretching the page. */}
            <section
              aria-label="Verlauf"
              className="flex min-h-0 flex-1 flex-col lg:h-[calc(100vh-11rem)]"
            >
              <header className="mb-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatTicketNumber(ticket.ticket_number)}
                  </span>
                  <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
                    {ticket.title}
                  </h1>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {ticket.created_by_email} ·{" "}
                  {ticket.created_at.toLocaleString("de-DE", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="h-auto rounded-full px-2.5 py-0.5 text-xs font-normal"
                  >
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      isElevatedPriority(ticket.priority)
                        ? "h-auto rounded-full border-destructive/40 px-2.5 py-0.5 text-xs font-normal text-destructive"
                        : "h-auto rounded-full px-2.5 py-0.5 text-xs font-normal"
                    }
                  >
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                </div>
              </header>

              <TicketChat
                ticketId={ticket.id}
                comments={listCommentsFor(id, user)}
                isAgent
                cannedResponses={
                  flags.feature_canned_responses
                    ? listCannedResponses().map((canned) => ({
                        id: canned.id,
                        title: canned.title,
                        // Filled here, not in the browser: the reporter's name is
                        // not something the client needs handed to it.
                        body: fillCannedResponse(canned.body, {
                          ticket_number: formatTicketNumber(ticket.ticket_number),
                          reporter_name: ticket.created_by_email,
                          agent_name: user.name,
                        }),
                      }))
                    : []
                }
              />
            </section>

            <aside className="lg:sticky lg:top-6">
              <TicketSidebar
                ticket={ticket}
                agents={agents}
                currentUserId={user.id}
                location={
                  ticket.location_id ? getLocation(ticket.location_id) : null
                }
                fields={fields}
              >
                {flags.feature_ticket_linking && (
                  <TicketLinks
                    compact
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
              </TicketSidebar>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

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
