import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { listOwnTickets } from "@/lib/tickets";

export const metadata: Metadata = {
  title: "Meine Tickets — MITS",
};

export default async function MyTicketsPage() {
  // Authoritative guard. The proxy already redirected anonymous visitors, but
  // this is the check that actually decides.
  const user = await requireUser("/tickets");

  // `listOwnTickets`, not `listTicketsFor`: this page is "mine" for every role,
  // including admins. Foreign tickets live on the board.
  const tickets = listOwnTickets(user.id);

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold uppercase sm:text-3xl">
                Meine Tickets
              </h1>
              <p className="mt-2 text-muted-foreground">
                Alles, was du gemeldet hast — {tickets.length}{" "}
                {tickets.length === 1 ? "Eintrag" : "Einträge"}.
              </p>
            </div>
            <Button asChild className="rounded-sm">
              <Link href="/tickets/new">
                <PlusIcon />
                Neues Ticket
              </Link>
            </Button>
          </div>

          <Separator className="my-8 bg-border" />

          <TicketTable tickets={tickets} />
        </div>
      </main>
    </>
  );
}
