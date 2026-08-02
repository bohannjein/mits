import type { Metadata } from "next";

import { TicketDisplayForm } from "@/components/admin/ticket-display-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getTicketDisplaySettings } from "@/lib/ticket-display";
import { TICKET_FORM_DISPLAY_META } from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket-Darstellung — MITS",
};

export default async function AdminTicketDisplayPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/settings/tickets");

  const settings = getTicketDisplaySettings();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Ticket-Darstellung
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Wo die Antworten eines ausgefüllten Formulars auf der Ticketseite
                stehen.
              </p>
            </div>
            <Badge
              variant="outline"
              className="h-auto rounded-full px-3 py-1 font-normal"
            >
              {TICKET_FORM_DISPLAY_META[settings.formDisplay].label}
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

          <TicketDisplayForm settings={settings} />
        </div>
      </main>
    </>
  );
}
