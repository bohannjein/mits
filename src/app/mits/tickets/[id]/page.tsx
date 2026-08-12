import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangleIcon,
  FolderTreeIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { TicketComposer } from "@/components/tickets/ticket-composer";
import { TicketFrame } from "@/components/tickets/ticket-frame";
import { ComposerHandleProvider } from "@/components/tickets/composer-handle";
import { DetachButtons } from "@/components/tickets/detach-buttons";
import { TicketLive } from "@/components/tickets/ticket-live";
import { TicketShortcuts } from "@/components/tickets/ticket-shortcuts";
import { PayloadFields } from "@/components/tickets/payload-fields";
import { TicketMessages } from "@/components/tickets/ticket-messages";
import { TicketSidebar } from "@/components/tickets/ticket-sidebar";
import { TicketWorkspace } from "@/components/tickets/ticket-workspace";
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
import { getWorkflowSettings } from "@/lib/workflow-settings";
import { listAuditFor } from "@/lib/audit";
import {
  categoryLabel,
  categoryPath,
  listCategoryTree,
} from "@/lib/ticket-categories";
import { isPinned } from "@/lib/ticket-pins";
import { listRemindersForTicket } from "@/lib/ticket-reminders";
import { triage } from "@/lib/services/auto-triage";
import { listTriageRules } from "@/lib/triage-rules";
import { listUploadsForTicket } from "@/lib/storage";
import { collectLinks } from "@/lib/ticket-resources";
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
import {
  getTicketFor,
  getTicketSeenAt,
  markTicketRead,
} from "@/lib/tickets";
import { getUserProfile } from "@/lib/user-profile";
import { findUser, listUsers } from "@/lib/users";
import { templateValuesFor } from "@/lib/template-values";
import { listWorklogs } from "@/lib/worklogs";
import { checklistFor } from "@/lib/ticket-checklist";
import { getTicketFormDisplay } from "@/lib/ticket-display";
import {
  openingFieldName,
  openingMessageFor,
  payloadAttachments,
  payloadFields,
} from "@/lib/ticket-opening";
import { OpeningAttachments } from "@/components/tickets/opening-attachments";
import {
  type MITSConfigurationItem,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  fillCannedResponse,
  formatInventoryNumber,
  formatTicketNumber,
  hasAutoClose,
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
  // Read **before** the bookmark moves — `markTicketRead` overwrites the answer.
  // The two lines are adjacent and in this order on purpose; see `getTicketSeenAt`.
  const seenAt = getTicketSeenAt(id, user.id);
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

  const fields = payloadFields(
    ticket.payload,
    labels,
    // Only hidden when a bubble actually replaced it. A mailed ticket keeps the
    // field, because its opening bubble is the stored comment rather than this.
    opening ? openingField : null,
  );

  /*
   * Die Anhänge der Erstmeldung, aus der Payload.
   *
   * Nicht aus `listUploadsForTicket`: das liefert *alle* Dateien am Ticket, also
   * auch die aus späteren Antworten — und die sind in ihrer eigenen Bubble schon
   * eingebettet.
   */
  const openingAttachments = payloadAttachments(ticket.payload);

  /*
   * Where the answers go, per the admin setting.
   *
   * `chat` needs somewhere to put them, and the synthetic opening is that place —
   * a mailed ticket has none, so it falls back to the panel. Answers nobody can see
   * would be the one outcome worse than answers in the wrong place.
   */
  const formDisplay = getTicketFormDisplay();
  const fieldsInBubble = formDisplay !== "panel" && opening !== null;
  const fieldsInPanel = !fieldsInBubble || formDisplay === "both";

  /*
   * The agent checklist for this ticket type, with the answers given so far.
   *
   * Read from the schema and the answer table together — see `checklistFor`. No
   * feature flag: a type with no steps has no panel, which is the off switch.
   */
  const checklist = checklistFor(id, schema);

  /*
   * Assets, only while the module is on. Three lists rather than one: what is attached,
   * what the reporter probably means, and everything else for the search. The reporter
   * lookup uses the ticket's own location, so a device at the right site is offered even
   * when nothing is assigned to the person.
   */
  /*
   * The MITS inventory number, not the vendor sticker.
   *
   * This line is what an agent reads out to the person on the phone, and it is the
   * one number that exists on every object — `asset_tag` is optional and empty on
   * most of them, which made the second line of an asset row usually blank.
   */
  const toAssetRow = (item: {
    id: string;
    name: string;
    type: MITSConfigurationItem["type"];
    inventory_number: number;
  }) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    assetTag: formatInventoryNumber(item.inventory_number),
  });

  const suggested = flags.feature_cmdb
    ? suggestCIsForTicket(id, ticket.created_by, ticket.location_id)
    : { assigned: [], onSite: [] };

  const assets = flags.feature_cmdb
    ? {
        attached: listCIsForTicket(id).map(toAssetRow),
        suggestions: {
          assigned: suggested.assigned.map(toAssetRow),
          onSite: suggested.onSite.map(toAssetRow),
        },
        candidates: listConfigurationItems().map(toAssetRow),
      }
    : null;

  // Only staff may hold a ticket, so only staff appear in the picker.
  /*
   * Files and links, gathered once.
   *
   * The links come out of the comments this reader may see — `comments` is already
   * the visibility-filtered list, so an address posted in an internal note never
   * reaches a reporter's panel. Passing the raw thread here would be the leak.
   */
  const resources = {
    files: listUploadsForTicket(id),
    links: collectLinks([...(opening ? [opening] : []), ...comments]),
  };

  // One resolver for every template on this page, so the canned responses and the
  // macros cannot address the same person two different ways.
  const templateValues = templateValuesFor(ticket, user.name);

  const agents = listUsers()
    .filter((candidate) => canViewBoard(candidate.role))
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));

  /*
   * The three that moved out of the sidebar and into the action bar.
   *
   * Hoisted rather than built inline, because each is now read by exactly one
   * place and building them in the JSX would put three multi-line expressions
   * between the frame's slots.
   */
  const worklog = flags.feature_time_tracking
    ? {
        entries: listWorklogs(id).map((entry) => ({
          id: entry.id,
          userName: entry.user_name,
          minutes: entry.minutes,
          note: entry.note,
          performedAt: entry.performed_at,
          // Decided here, not in the browser: the component only draws the
          // button, `deleteWorklog` decides again.
          removable: entry.user_id === user.id || canAdminister(user.role),
        })),
        // The instance's today, so the date field and the server's future-date
        // clamp agree on which day it is.
        today: new Date().toISOString().slice(0, 10),
      }
    : null;

  /*
   * This agent's own reminders on this ticket, formatted here.
   *
   * The popover is a client component, so the due times become strings on this
   * side — every timestamp in MITS is rendered through `lib/format.ts` with the
   * instance's timezone, and handing the browser an ISO string plus a zone name
   * would be a second formatter for the one thing that already has one.
   *
   * `overdue` is computed here too, for the same reason: a client comparing
   * against its own clock would disagree with the server on a laptop whose time is
   * off, and „fällig" is the one word on this button that has to be right.
   */
  const timezone = getSystemTimezone();
  const nowMs = Date.now();
  const reminders = flags.feature_ticket_reminders
    ? listRemindersForTicket(id, user.id).map((entry) => ({
        id: entry.id,
        dueLabel: formatDateTime(new Date(entry.due_at), timezone),
        note: entry.note,
        overdue: new Date(entry.due_at).getTime() <= nowMs,
      }))
    : null;

  /*
   * Angeheftet, oder das Feature ist aus.
   *
   * Eine Einzelabfrage und nicht die Spalte aus `searchTickets`: diese Seite lädt
   * ein Ticket über `getTicketFor`, und `MITSTicket.pinned` ist dort per Default
   * `false` — was eine Behauptung wäre, keine Antwort. Deshalb ist der Wert hier
   * ein eigener Read und nicht `ticket.pinned`.
   */
  const pinned = flags.feature_ticket_pins ? isPinned(id, user.id) : null;

  /*
   * Everything the re-route dialog needs, or null.
   *
   * The suggestion comes from the **triage rules**, not from the model's routing
   * tag. The tag names a *form schema* (`passt-eher:<id>`), and there is no table
   * that maps a schema to a category — inventing one here would be this page
   * guessing from strings. The rules, by contrast, produce a category id directly
   * and can be read back: „Regel Drucker hätte das nach Hardware / Drucker
   * gelegt". The tag keeps rendering as a badge in the header, unchanged.
   *
   * Null when the tree is empty as well as when the module is off: a dialog whose
   * only option is „keine Kategorie" is a button that leads nowhere.
   */
  const categoryTree = flags.feature_ticket_categories ? listCategoryTree() : [];
  const suggestedCategoryId = flags.feature_smart_routing
    ? triage(
        `${ticket.title}\n${openingField ? String(ticket.payload[openingField] ?? "") : ""}`,
        listTriageRules(),
      ).categoryId
    : "";

  const routing =
    categoryTree.length > 0
      ? {
          categories: categoryTree,
          currentCategoryId: ticket.category_id,
          suggestion:
            suggestedCategoryId && suggestedCategoryId !== ticket.category_id
              ? {
                  id: suggestedCategoryId,
                  path: categoryPath(suggestedCategoryId),
                }
              : null,
        }
      : null;

  const links = flags.feature_ticket_linking
    ? listLinksFor(id, user).map((link) => ({
        id: link.id,
        label: link.label,
        otherId: link.other.id,
        otherNumber: link.otherNumber,
        otherTitle: link.other.title,
        otherStatus: link.other.status,
      }))
    : null;

  return (
    <>
      <AppHeader />
      {/*
        From `lg` up the page itself never scrolls — only the conversation and the
        sidebar do. Below that the height is left alone; see the note in
        `TicketFrame` for why a phone gets an ordinary scrolling page instead.
      */}
      <main className="flex flex-1 flex-col items-center px-6 py-6 lg:min-h-0 lg:overflow-hidden">
        <ComposerHandleProvider>
        <div className="flex w-full max-w-7xl flex-1 flex-col lg:min-h-0">
          {/* Renders nothing. Polls for new replies and status changes and swaps
              the RSC payload in when there are any — see ticket-live.tsx. */}
          <TicketLive
            ticketId={ticket.id}
            fingerprint={ticketActivityFingerprint(ticket, user)}
          />
          {/* r / m / i / Esc. The provider is what lets the handler reach the
              composer — a Server Component cannot create the shared ref. */}
          <TicketShortcuts
            ticketId={ticket.id}
            currentUserId={user.id}
            mine={ticket.assigned_to === user.id}
          />
          <TicketFrame
            sidebarLabel="Details"
            // Draws the cutout in place of the conversation while this ticket is
            // open in a pop-out or a pinned panel.
            detachableId={ticket.id}
            header={
              /*
                Chat-first: three lines where there were five.

                The back link, the number and the title share a row; everything
                that used to have its own line — reporter, timestamp, status,
                priority, tags — is one wrapping strip of badges under it. None of
                it is gone, it is just no longer stacked: every line here comes
                straight off the conversation, which is the thing the page is for.
              */
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <BackLink href="/mits" label="Queue" />
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatTicketNumber(ticket.ticket_number)}
                  </span>
                  <h1 className="min-w-0 flex-1 truncate text-base font-medium tracking-tight sm:text-lg">
                    {ticket.title}
                  </h1>
                  {/* Beside the title rather than in a toolbar: detaching is about
                      this conversation, and the title is what names it. */}
                  <DetachButtons
                    ticketId={ticket.id}
                    label={formatTicketNumber(ticket.ticket_number)}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  {ticket.major_incident && (
                    <Badge className="h-auto rounded-full bg-bubble-internal-accent/15 px-2 py-0 text-[11px] font-normal text-bubble-internal-accent">
                      <AlertTriangleIcon className="size-3" strokeWidth={1.5} />
                      Hauptstörung
                    </Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className="h-auto rounded-full px-2 py-0 text-[11px] font-normal"
                  >
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      isElevatedPriority(ticket.priority)
                        ? "h-auto rounded-full border-destructive/40 px-2 py-0 text-[11px] font-normal text-destructive"
                        : "h-auto rounded-full px-2 py-0 text-[11px] font-normal"
                    }
                  >
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>

                  {/*
                    The category, when there is one. Absent rather than „Keine
                    Kategorie": an empty badge in a strip of five would read as a
                    field somebody failed to fill in, and on an instance without
                    categories it would sit on every ticket forever.
                  */}
                  {ticket.category_id && categoryLabel(ticket.category_id) && (
                    <Badge
                      variant="outline"
                      className="h-auto rounded-full px-2 py-0 text-[11px] font-normal"
                    >
                      <FolderTreeIcon className="size-3" strokeWidth={1.5} />
                      {categoryLabel(ticket.category_id)}
                    </Badge>
                  )}

                  {/* Assignment as a badge rather than a sidebar-only field: it is
                      the attribute most often checked and least often changed, so
                      it belongs where it can be read without opening anything. */}
                  <Badge
                    variant="outline"
                    className="h-auto rounded-full px-2 py-0 text-[11px] font-normal"
                  >
                    <UserIcon className="size-3" strokeWidth={1.5} />
                    {ticket.assigned_to_name ?? "Nicht zugewiesen"}
                  </Badge>

                  <span className="truncate">
                    {ticket.created_by_email} ·{" "}
                    {formatDateTime(ticket.created_at, getSystemTimezone())}
                  </span>

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
                      className="h-auto rounded-full px-2 py-0 text-[11px] font-normal text-muted-foreground"
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
              /*
                The action bar and the checklist wrap the conversation rather
                than sitting beside it: the bar is about this ticket, and the
                checklist is an alternative view of the same region. Both are
                client state, the thread stays a server render inside them.
              */
              <TicketWorkspace
                ticketId={ticket.id}
                agents={agents}
                currentAssignee={ticket.assigned_to}
                ccEmails={ticket.cc_emails}
                checklist={checklist.length > 0 ? checklist : null}
                worklog={worklog}
                links={links}
                reminders={reminders}
                routing={routing}
                pinned={pinned}
              >
              <TicketMessages
                // Prepended, not merged by timestamp: the opening message *is* the
                // earliest thing by definition, and sorting a synthetic entry into
                // a list by a date it shares with the ticket row invites a tie.
                comments={[...(opening ? [opening] : []), ...comments]}
                viewerId={user.id}
                ticketId={ticket.id}
                // Resolved on the server: a client that could decide this would be
                // deciding whether a disabled module is disabled.
                canEdit={flags.feature_message_editing}
                canRetract={flags.feature_message_retract}
                seenAt={seenAt}
                emptyText="Noch keine Beiträge. Die erste Antwort geht an den Melder."
                /*
                  Anhänge **immer**, Antworten nach der Einstellung.
                  `formDisplay` entscheidet, wo die Formularantworten stehen; ein
                  mitgeschickter Screenshot ist keine Antwort auf ein Feld, sondern
                  Teil der Nachricht. Ihn an dieselbe Einstellung zu hängen hieße,
                  dass „daneben" ein Bild in eine Liste aus Dateinamen verwandelt.
                */
                openingDetails={
                  openingAttachments.length > 0 || fieldsInBubble ? (
                    <>
                      <OpeningAttachments attachments={openingAttachments} />
                      {fieldsInBubble && (
                        <PayloadFields fields={fields} variant="bubble" />
                      )}
                    </>
                  ) : undefined
                }
              />
              </TicketWorkspace>
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
                        shortcut: macro.shortcut,
                      }))
                    : []
                }
                cannedResponses={
                  flags.feature_canned_responses
                    ? listCannedResponses().map((canned) => ({
                        id: canned.id,
                        title: canned.title,
                        shortcut: canned.shortcut,
                        // Filled here, not in the browser: the reporter's name
                        // is not something the client needs handed to it.
                        body: fillCannedResponse(canned.body, templateValues),
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
                // Empty when the answers are in the bubble: the sidebar hides its
                // own section on an empty list, so the mode needs no second switch
                // inside the component.
                fields={fieldsInPanel ? fields : []}
                // The reporter's own details, so the agent does not have to ask
                // where they sit. Read here because the sidebar is a client component.
                reporter={getUserProfile(ticket.created_by)}
                auditEntries={
                  // Admin only. The trail names who did what, which is not something a
                  // agent needs to read about a colleague.
                  canAdminister(user.role) ? listAuditFor(id) : null
                }
                timezone={getSystemTimezone()}
                // Hier aufgelöst, weil die Einstellung eine Datenbankzeile ist
                // und die Sidebar eine Client-Komponente. Steht keine Frist, gibt
                // es den Schalter nicht.
                autoCloseAvailable={hasAutoClose(getWorkflowSettings())}
                assets={assets}
                // Only past the point where reading the thread is slower than
                // reading a summary of it — and only when an admin turned it on.
                summarisable={
                  isAIFeatureOn(aiSettings, "summary") &&
                  comments.length >= SUMMARY_MIN_MESSAGES
                }
                resources={resources}
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
              />
            }
          />
        </div>
        </ComposerHandleProvider>
      </main>
    </>
  );
}

