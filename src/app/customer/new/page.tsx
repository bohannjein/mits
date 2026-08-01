import type { Metadata } from "next";
import Link from "next/link";
import { ListIcon } from "lucide-react";

import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { TriModalContainer } from "@/components/tickets/tri-modal-container";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { getFormSchema, listCatalogSchemas } from "@/lib/form-schemas";
import { listActiveLocations } from "@/lib/locations";
import { QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
import { getActiveAnnouncements, getPortalFaqs } from "@/lib/portal";
import { getAISettings } from "@/lib/ai-settings";
import { listUsers } from "@/lib/users";
import { TicketSource, isAIFeatureOn } from "@/types/mits";

export const metadata: Metadata = {
  title: "Neues Ticket — MITS",
  description:
    "Ticket klassisch, über den geführten Service-Katalog oder per KI-Assistent erfassen.",
};

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  // Authoritative guard — the proxy only redirects early.
  const user = await requireUser("/customer/new");

  /*
   * Validated against the enum rather than cast: `?mode=` is user input, and an
   * unknown value should open the default tab, not render nothing.
   *
   * `email` passes the enum and is still not a tab — it is how a ticket arrived,
   * not a way to file one. Without the second check `?mode=email` would render a
   * tab strip with nothing selected and an empty panel below it.
   */
  const { mode } = await searchParams;
  const parsedMode = TicketSource.safeParse(mode).data;
  const initialMode = parsedMode === "email" ? undefined : parsedMode;

  // Resolved on the server so builder-published schemas appear without a rebuild.
  // The quick-ticket form may itself be overridden by a stored version.
  const quickTicketSchema =
    getFormSchema(QUICK_TICKET_SCHEMA.id) ?? QUICK_TICKET_SCHEMA;
  const catalogSchemas = listCatalogSchemas();
  const announcements = getActiveAnnouncements();

  /*
   * Choices for the `location` and `user` field widgets. Loaded here rather than
   * baked into the schemas, so a new branch or a new colleague shows up without
   * anyone editing a form.
   *
   * Users are reduced to id and name on purpose. `listUsers()` also returns the
   * address and the role, and a ticket form has no reason to hand every reporter a
   * staff directory — a colleague picker needs a name and nothing else.
   */
  const activeLocations = listActiveLocations();
  const fieldOptions = {
    locations: activeLocations.map((location) => ({
      value: location.id,
      label: location.code ? `${location.name} (${location.code})` : location.name,
    })),
    users: listUsers().map((candidate) => ({
      value: candidate.id,
      label: candidate.name,
    })),
  };

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-3xl">
          {announcements.length > 0 && (
            <div className="mb-8">
              <AnnouncementBanner announcements={announcements} />
            </div>
          )}

          <BackLink href="/customer" label="Zurück zum Portal" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Neues Ticket
              </h1>
              <p className="mt-2 text-muted-foreground">
                Einfach schreiben, ein Formular aus dem Katalog wählen oder die KI
                fragen — gemeldet als {user.email}.
              </p>
            </div>
            <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
              <Link href="/customer/tickets">
                <ListIcon />
                Meine Tickets
              </Link>
            </Button>
          </div>

          <Separator className="my-8 bg-border" />

          <TriModalContainer
            quickTicketSchema={quickTicketSchema}
            catalogSchemas={catalogSchemas}
            initialMode={initialMode}
            locations={activeLocations}
            fieldOptions={fieldOptions}
            // First word of the display name, same rule the portal hero uses. An
            // account whose name is its address falls back to the neutral heading
            // rather than greeting somebody as "anna.meier@firma.de".
            greetingName={
              user.name.includes("@") ? "" : user.name.trim().split(/\s+/)[0]
            }
            /*
             * Sent whole to the browser, and that is the point: the matching runs
             * locally on every pause in typing, so there is no request per
             * keystroke and no server round trip in the way. The FAQ is published
             * to every signed-in user anyway — this hands over nothing the portal
             * does not already show.
             *
             * Empty when the feature is off, which switches the whole area off.
             */
            faqs={
              isAIFeatureOn(getAISettings(), "deflection") ? getPortalFaqs() : []
            }
          />
        </div>
      </main>
    </>
  );
}
