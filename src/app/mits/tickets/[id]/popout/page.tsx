import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComposerHandleProvider } from "@/components/tickets/composer-handle";
import { PayloadFields } from "@/components/tickets/payload-fields";
import { PopoutAnnouncer } from "@/components/tickets/popout-announcer";
import { TicketComposer } from "@/components/tickets/ticket-composer";
import { TicketFrame } from "@/components/tickets/ticket-frame";
import { TicketLive } from "@/components/tickets/ticket-live";
import { TicketMessages } from "@/components/tickets/ticket-messages";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { getFeatureFlags } from "@/lib/features";
import { getFormSchema } from "@/lib/form-schemas";
import { listMacros } from "@/lib/macros";
import { templateValuesFor } from "@/lib/template-values";
import {
  listCommentsFor,
  ticketActivityFingerprint,
} from "@/lib/ticket-comments";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { getTicketFormDisplay } from "@/lib/ticket-display";
import {
  openingFieldName,
  openingMessageFor,
  payloadFields,
} from "@/lib/ticket-opening";
import {
  getTicketFor,
  getTicketSeenAt,
  markTicketRead,
} from "@/lib/tickets";
import { findUser } from "@/lib/users";
import {
  TICKET_STATUS_LABELS,
  fillCannedResponse,
  formatTicketNumber,
} from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The conversation on its own: no header, no sidebar, no navigation.

   Serves two callers that want exactly the same thing — a real browser window
   from `window.open`, and the `<iframe>` inside the pinned panel. One route for
   both, because they are the same view and a second implementation would be a
   second place for the reply path to drift.

   **Guarded like any other page.** `requireRole("agent")` runs here too. A route
   that is only ever reached from a button on a guarded page is still a URL, and
   the Next docs are explicit that proxy coverage can disappear without notice.

   **What is deliberately not here:** the metadata sidebar, the back link, the
   application header. A pinned panel is 384 pixels wide; a status dropdown in it
   would be a control nobody can read the label of. Everything that is not the
   conversation stays in the main window, which is exactly where the cutout card
   says the rest of the page is still usable.

   No navigation of any kind, either — a pop-out that can be browsed away from the
   ticket it was opened for is a second application window with no way home.
   ────────────────────────────────────────────────────────────────────────── */

export default async function TicketPopoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("agent", `/mits/tickets/${id}/popout`);
  const flags = getFeatureFlags();

  const ticket = getTicketFor(id, user);
  if (!ticket) notFound();

  // Read before the bookmark moves, same ordering as the full page.
  const seenAt = getTicketSeenAt(id, user.id);
  markTicketRead(id, user.id);

  const schema = ticket.form_schema_id
    ? getFormSchema(ticket.form_schema_id)
    : undefined;
  const reporterName =
    findUser(ticket.created_by)?.name ?? ticket.created_by_email;
  const opening = openingMessageFor(ticket, schema, reporterName);
  const comments = listCommentsFor(id, user);
  const templateValues = templateValuesFor(ticket, user.name);

  /*
   * The form answers, when the admin has them in the thread.
   *
   * This window has no sidebar and no accordion, so the `panel` mode simply shows
   * nothing here — the answers are one click away in the full view. `both` behaves
   * like `chat`: there is no second place to put them.
   */
  const labels = new Map(
    schema ? resolveFields(schema).map((field) => [field.name, field.label]) : [],
  );
  const openingFields =
    getTicketFormDisplay() !== "panel" && opening !== null
      ? payloadFields(
          ticket.payload,
          labels,
          openingFieldName(ticket.payload, schema),
        )
      : [];

  return (
    /*
     * `h-full` and `overflow-hidden` on the wrapper, because this page *is* the
     * window: there is no application shell above it to divide the height up. The
     * frame's `min-h-0` chain needs a definite height at the top or the reply box
     * drifts down the page again — the same failure documented on the body element.
     */
    <main className="flex h-full min-h-0 flex-col overflow-hidden p-3">
      {/* Renders nothing. Tells the opener when this window closes, so the main
          window can take the cutout down. */}
      <PopoutAnnouncer ticketId={ticket.id} />

      <TicketLive
        ticketId={ticket.id}
        fingerprint={ticketActivityFingerprint(ticket, user)}
      />

      <ComposerHandleProvider>
        <TicketFrame
          // No `detachableId`: this view must never cut its own chat out of
          // itself. It *is* the detached copy.
          header={
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-xs text-muted-foreground">
                {formatTicketNumber(ticket.ticket_number)}
              </span>
              <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
                {ticket.title}
              </h1>
              <Badge
                variant="secondary"
                className="h-auto rounded-full px-2 py-0.5 text-[11px] font-normal"
              >
                {TICKET_STATUS_LABELS[ticket.status]}
              </Badge>
            </div>
          }
          messages={
            <TicketMessages
              comments={[...(opening ? [opening] : []), ...comments]}
              viewerId={user.id}
              ticketId={ticket.id}
              canEdit={flags.feature_message_editing}
              canRetract={flags.feature_message_retract}
              seenAt={seenAt}
              emptyText="Noch keine Beiträge."
              openingDetails={
                openingFields.length > 0 ? (
                  <PayloadFields fields={openingFields} variant="bubble" />
                ) : undefined
              }
            />
          }
          composer={
            /*
             * `plain`, not the rich editor, and that is a size decision rather
             * than a role one: the formatting toolbar wraps to three rows in a
             * 384-pixel panel and eats the field it belongs to. An agent who wants
             * formatting has the main window one click away.
             */
            <TicketComposer
              ticketId={ticket.id}
              isAgent
              variant="plain"
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
                      body: fillCannedResponse(canned.body, templateValues),
                    }))
                  : []
              }
            />
          }
        />
      </ComposerHandleProvider>
    </main>
  );
}
