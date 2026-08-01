import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangleIcon, TagIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { TicketComposer } from "@/components/tickets/ticket-composer";
import { TicketFrame } from "@/components/tickets/ticket-frame";
import { TicketLive } from "@/components/tickets/ticket-live";
import { TicketMessages } from "@/components/tickets/ticket-messages";
import { TicketSidebar } from "@/components/tickets/ticket-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canAdminister, canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { listMacros } from "@/lib/macros";
import { getFeatureFlags } from "@/lib/features";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import {
  listCIsForTicket,
  listConfigurationItems,
  suggestCIsForTicket,
} from "@/lib/cmdb";
import { getLocation } from "@/lib/locations";
import { formatDateTime } from "@/lib/format";
import { getSystemTimezone } from "@/lib/system-settings";
import { listAuditFor } from "@/lib/audit";
import {
  listCommentsFor,
  ticketActivityFingerprint,
} from "@/lib/ticket-comments";
import { getAISettings } from "@/lib/ai-settings";
import { parkedChildren } from "@/lib/services/ai/clustering";
import {
  ROUTING_TAG_PREFIX,
  isRoutingHint,
} from "@/lib/services/ai/tags";
import { SUMMARY_MIN_MESSAGES } from "@/lib/services/ai/summary";
import { listLinksFor } from "@/lib/ticket-links";
import { getTicketFor, markTicketRead } from "@/lib/tickets";
import { getUserProfile } from "@/lib/user-profile";
import { findUser, listUsers } from "@/lib/users";
import { listWorklogs } from "@/lib/worklogs";
import {
  fieldsBesidesOpening,
  openingFieldName,
  openingMessageFor,
} from "@/lib/ticket-opening";
import {
  type MITSConfigurationItem,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  fillCannedResponse,
  formatTicketNumber,
  isAIFeatureOn,
  isElevatedPriority,
} from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The agent's ticket, as a two-column messenger.

   Left: the conversation with a composer pinned to the bottom. Right: a sticky
   column of metadata whose dropdowns apply on change.

   Guarded with `requireRole("agent")`, so a reporter handed this URL lands in
   their own portal rather than on a page that merely hides the controls.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AgentTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("agent", `/mits/tickets/${id}`);
  const flags = getFeatureFlags();

  // Answers null both for "does not exist" and "not visible", so a 404 leaks
  // nothing about which ids are real.
  const ticket = getTicketFor(id, user);
  if (!ticket) notFound();

  /*
   * Opening the ticket is what "reading" it means, so the bookmark is written
   * here. After the visibility check, never before — a `markTicketRead` above the
   * `notFound()` would let anybody stamp a row for a ticket they cannot see, which
   * turns this table into a way to prove an id exists.
   */
  markTicketRead(id, user.id);

  const schema = ticket.form_schema_id
    ? getFormSchema(ticket.form_schema_id)
    : undefined;

  // Same label resolution the renderer uses, so a field is named identically
  // wherever it appears.
  const labels = new Map(
    schema ? resolveFields(schema).map((field) => [field.name, field.label]) : [],
  );

  /*
   * The reporter's own words open the thread instead of sitting in the sidebar.
   * `fieldsBesidesOpening` then drops that one field from the metadata list — the
   * alternative states the problem twice, once as a message and once as a labelled
   * value ten centimetres to the right.
   */
  /*
   * By id, not by address. On a mailed ticket the two disagree on purpose —
   * `created_by` is the fallback account, `created_by_email` the human — and
   * looking up the address would name an account that did not write it. `email`
   * tickets synthesise no bubble anyway, but a lookup that is right only by
   * accident is one refactor from being wrong.
   */
  const reporterName =
    findUser(ticket.created_by)?.name ?? ticket.created_by_email;
  const opening = openingMessageFor(ticket, schema, reporterName);

  // Read once and passed down: `listCommentsFor` is the thread *and* the input to
  // the "is this long enough to summarise" question, and calling it twice would
  // run the visibility-filtered query twice per render.
  const comments = listCommentsFor(id, user);
  const aiSettings = getAISettings();
  const openingField = openingFieldName(ticket.payload, schema);

  const fields = fieldsBesidesOpening(
    Object.entries(ticket.payload).map(([name, value]) => ({
      name,
      label: labels.get(name) ?? name,
      text: formatValue(value),
    })),
    // Only hidden when a bubble actually replaced it. A mailed ticket keeps the
    // field, because its opening bubble is the stored comment rather than this.
    opening ? openingField : null,
  ).filter((row) => row.text !== "");

  /*
   * Assets, only while the module is on. Three lists rather than one: what is attached,
   * what the reporter probably means, and everything else for the search. The reporter
   * lookup uses the ticket's own location, so a device at the right site is offered even
   * when nothing is assigned to the person.
   */
  const toAssetRow = (item: {
    id: string;
    name: string;
    type: MITSConfigurationItem["type"];
    asset_tag: string;
  }) => ({ id: item.id, name: item.name, type: item.type, assetTag: item.asset_tag });

  const assets = flags.feature_cmdb
    ? {
        attached: listCIsForTicket(id).map(toAssetRow),
        suggestions: suggestCIsForTicket(
          id,
          ticket.created_by,
          ticket.location_id,
        ).map(toAssetRow),
        candidates: listConfigurationItems().map(toAssetRow),
      }
    : null;

  // Only staff may hold a ticket, so only staff appear in the picker.
  const agents = listUsers()
    .filter((candidate) => canViewBoard(candidate.role))
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));

  return (
    <>
      <AppHeader />
      {/*
        From `lg` up the page itself never scrolls — only the conversation and the
        sidebar do. Below that the height is left alone; see the note in
        `TicketFrame` for why a phone gets an ordinary scrolling page instead.
      */}
      <main className="flex flex-1 flex-col items-center px-6 py-6 lg:min-h-0 lg:overflow-hidden">
        <div className="flex w-full max-w-7xl flex-1 flex-col lg:min-h-0">
          {/* Renders nothing. Polls for new replies and status changes and swaps
              the RSC payload in when there are any — see ticket-live.tsx. */}
          <TicketLive
            ticketId={ticket.id}
            fingerprint={ticketActivityFingerprint(ticket, user)}
          />
          <TicketFrame
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
                  {ticket.major_incident && (
                    <Badge className="h-auto rounded-full bg-bubble-internal-accent/15 px-2.5 py-0.5 text-xs font-normal text-bubble-internal-accent">
                      <AlertTriangleIcon className="size-3" strokeWidth={1.5} />
                      Hauptstörung
                    </Badge>
                  )}
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
                  {/*
                    Machine-written labels, marked as such by the icon rather than
                    by a word: an agent has to be able to tell at a glance which
                    badges a person chose. A routing hint reads differently from a
                    topic, so it gets its own wording.
                  */}
                  {ticket.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="h-auto rounded-full px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
                    >
                      <TagIcon className="size-3" strokeWidth={1.5} />
                      {isRoutingHint(tag)
                        ? `Passt eher: ${tag.slice(ROUTING_TAG_PREFIX.length)}`
                        : tag}
                    </Badge>
                  ))}
                </div>
              </>
            }
            messages={
              <TicketMessages
                // Prepended, not merged by timestamp: the opening message *is* the
                // earliest thing by definition, and sorting a synthetic entry into
                // a list by a date it shares with the ticket row invites a tie.
                comments={[...(opening ? [opening] : []), ...comments]}
                emptyText="Noch keine Beiträge. Die erste Antwort geht an den Melder."
              />
            }
            composer={
              <TicketComposer
                ticketId={ticket.id}
                isAgent
                variant="rich"
                // Title and blurb only. The macro's actions stay on the server —
                // the browser posts an id and `runMacro` decides what that means.
                macros={
                  flags.feature_macros
                    ? listMacros().map((macro) => ({
                        id: macro.id,
                        title: macro.title,
                        description: macro.description,
                      }))
                    : []
                }
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
                // The reporter's own details, so the agent does not have to ask
                // where they sit. Read here because the sidebar is a client component.
                reporter={getUserProfile(ticket.created_by)}
                auditEntries={
                  // Admin only. The trail names who did what, which is not something a
                  // agent needs to read about a colleague.
                  canAdminister(user.role) ? listAuditFor(id) : null
                }
                timezone={getSystemTimezone()}
                assets={assets}
                // Only past the point where reading the thread is slower than
                // reading a summary of it — and only when an admin turned it on.
                summarisable={
                  isAIFeatureOn(aiSettings, "summary") &&
                  comments.length >= SUMMARY_MIN_MESSAGES
                }
                majorIncident={
                  ticket.major_incident
                    ? {
                        children: parkedChildren(id),
                        // `resolved` and `closed` both count: the outage is over
                        // either way, and the children are still parked.
                        resolved:
                          ticket.status === "resolved" ||
                          ticket.status === "closed",
                      }
                    : null
                }
                worklog={
                  flags.feature_time_tracking
                    ? {
                        entries: listWorklogs(id).map((entry) => ({
                          id: entry.id,
                          userName: entry.user_name,
                          minutes: entry.minutes,
                          note: entry.note,
                          performedAt: entry.performed_at,
                          // Decided here, not in the browser: the component only
                          // draws the button, `deleteWorklog` decides again.
                          removable:
                            entry.user_id === user.id || canAdminister(user.role),
                        })),
                        // The instance's today, so the date field and the
                        // server's future-date clamp agree on which day it is.
                        today: new Date().toISOString().slice(0, 10),
                      }
                    : null
                }
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
