import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/app-header";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { listLocations } from "@/lib/locations";
import { countTickets, listAllTickets } from "@/lib/tickets";

export const metadata: Metadata = {
  title: "Ticket-Board — MITS",
};

/** Technician and admin view: every ticket, regardless of who reported it. */
export default async function BoardPage() {
  // Authoritative role gate. The proxy checks the signed session cookie first,
  // but this is what actually protects foreign payloads.
  const user = await requireRole("technician", "/board");

  const tickets = listAllTickets();
  const { total, open } = countTickets();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Ticket-Board
              </h1>
              <p className="mt-2 text-muted-foreground">
                Alle Meldungen der Instanz, angemeldet als {user.email}.
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="rounded-full">
                {total} gesamt
              </Badge>
              <Badge className="rounded-full">{open} offen</Badge>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {tickets.length === 0 ? (
            <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Board ist leer</CardTitle>
                <CardDescription>
                  Sobald Meldungen eingehen, erscheinen sie hier.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <TicketTable
              tickets={tickets}
              showOwner
              locations={listLocations()}
            />
          )}
        </div>
      </main>
    </>
  );
}
