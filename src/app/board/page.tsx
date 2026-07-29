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
              <h1 className="text-2xl font-bold uppercase sm:text-3xl">
                Ticket-Board
              </h1>
              <p className="mt-2 text-muted-foreground">
                Alle Meldungen der Instanz, angemeldet als {user.email}.
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="rounded-sm font-mono">
                {total} gesamt
              </Badge>
              <Badge className="rounded-sm font-mono">{open} offen</Badge>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {tickets.length === 0 ? (
            <Card className="rounded-sm border-2 border-border ring-0">
              <CardHeader>
                <CardTitle className="uppercase">Board ist leer</CardTitle>
                <CardDescription>
                  Sobald Meldungen eingehen, erscheinen sie hier.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <TicketTable tickets={tickets} showOwner />
          )}
        </div>
      </main>
    </>
  );
}
