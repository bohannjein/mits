import type { Metadata } from "next";
import Link from "next/link";
import { ListIcon } from "lucide-react";

import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { AppHeader } from "@/components/layout/app-header";
import { TriModalContainer } from "@/components/tickets/tri-modal-container";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { getFormSchema, listCatalogSchemas } from "@/lib/form-schemas";
import { QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
import { getActiveAnnouncements } from "@/lib/portal";

export const metadata: Metadata = {
  title: "Neues Ticket — MITS",
  description:
    "Ticket klassisch, über den geführten Service-Katalog oder per KI-Assistent erfassen.",
};

export default async function NewTicketPage() {
  // Authoritative guard — the proxy only redirects early.
  const user = await requireUser("/tickets/new");

  // Resolved on the server so builder-published schemas appear without a rebuild.
  // The quick-ticket form may itself be overridden by a stored version.
  const quickTicketSchema =
    getFormSchema(QUICK_TICKET_SCHEMA.id) ?? QUICK_TICKET_SCHEMA;
  const catalogSchemas = listCatalogSchemas();
  const announcements = getActiveAnnouncements();

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

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold uppercase sm:text-3xl">
                Neues Ticket
              </h1>
              <p className="mt-2 text-muted-foreground">
                Wähle den Weg, der passt. Alle drei erzeugen dieselbe
                strukturierte Payload — gemeldet als {user.email}.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-sm">
              <Link href="/tickets">
                <ListIcon />
                Meine Tickets
              </Link>
            </Button>
          </div>

          <Separator className="my-8 bg-border" />

          <TriModalContainer
            quickTicketSchema={quickTicketSchema}
            catalogSchemas={catalogSchemas}
          />
        </div>
      </main>
    </>
  );
}
