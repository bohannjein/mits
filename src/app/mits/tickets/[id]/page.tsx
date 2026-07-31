import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { SplitView } from "@/components/layout/split-view";
import { TicketChat } from "@/components/tickets/ticket-chat";
import { TicketSidebar } from "@/components/tickets/ticket-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canAdminister, canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { getFeatureFlags } from "@/lib/features";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { formatDateTime } from "@/lib/format";
import { getSystemTimezone } from "@/lib/system-settings";
import { listAuditFor } from "@/lib/audit";
import { listCommentsFor } from "@/lib/ticket-comments";
import { listLinksFor } from "@/lib/ticket-links";
import { getTicketFor } from "@/lib/tickets";
import { getUserProfile } from "@/lib/user-profile";
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
      {/*
        `overflow-hidden` on the page frame: the two columns scroll, the page does not.
        Without it the outer main would grow and the browser would show one scrollbar for
        everything, which is the arrangement this layout exists to avoid.
      */}
      <main className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-6 py-6">
        <div className="flex min-h-0 w-full max-w-7xl flex-1 flex-col">
          <SplitView
            sidebarLabel="Details"
            header={
              <>
                <BackLink href="/mits" label="Zurück zur Queue" />
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatTicketNumber(ticket.ticket_number)}
                  </span>
                  <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
                    {ticket.title}
                  </h1>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {ticket.created_by_email} ·{" "}
                  {formatDateTime(ticket.created_at, getSystemTimezone())}
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
              </>
            }
            main={
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
            }
            sidebar={
              <TicketSidebar
                ticket={ticket}
                agents={agents}
                currentUserId={user.id}
                location={
                  ticket.location_id ? getLocation(ticket.location_id) : null
                }
                fields={fields}
                // The reporter's own details, so the technician does not have to ask
                // where they sit. Read here because the sidebar is a client component.
                reporter={getUserProfile(ticket.created_by)}
                auditEntries={
                  // Admin only. The trail names who did what, which is not something a
                  // technician needs to read about a colleague.
                  canAdminister(user.role) ? listAuditFor(id) : null
                }
                timezone={getSystemTimezone()}
                links={
                  flags.feature_ticket_linking
                    ? listLinksFor(id, user).map((link) => ({
                        id: link.id,
                        label: link.label,
                        otherId: link.other.id,
                        otherNumber: link.otherNumber,
                        otherTitle: link.other.title,
                        otherStatus: link.other.status,
                      }))
                    : null
                }
              />
            }
          />
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
