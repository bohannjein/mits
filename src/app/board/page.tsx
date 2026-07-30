import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/app-header";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketSearch } from "@/components/tickets/ticket-search";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { listLocations } from "@/lib/locations";
import {
  jumpToTicketNumber,
  parseTicketQuery,
  type RawSearchParams,
} from "@/lib/ticket-query";
import { countTickets, listAllTickets, searchTickets } from "@/lib/tickets";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Ticket-Board — MITS",
};

/** Technician and admin view: every ticket, regardless of who reported it. */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Authoritative role gate. The proxy checks the signed session cookie first,
  // but this is what actually protects foreign payloads.
  const user = await requireRole("technician", "/board");

  const params = await searchParams;
  const searchEnabled = getFeatureFlags().feature_ticket_search;

  // Throws a redirect when the term is a visible ticket number.
  if (searchEnabled) jumpToTicketNumber(params.q as string | undefined, user);

  const { filter, values, activeCount } = parseTicketQuery(params);
  const hasQuery = searchEnabled && (activeCount > 0 || Boolean(values.q));

  const tickets = hasQuery ? searchTickets(filter, user) : listAllTickets();
  const { total, open } = countTickets();
  const locations = listLocations();

  // Only staff can hold a ticket, so only staff are worth filtering by.
  const agents = listUsers()
    .filter((candidate) => canViewBoard(candidate.role))
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));

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
              {hasQuery && (
                <Badge variant="secondary" className="rounded-full">
                  {tickets.length} Treffer
                </Badge>
              )}
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {searchEnabled && (
            <div className="mb-6 grid gap-4">
              <TicketSearch action="/board" defaultValue={values.q} />
              <TicketFilters
                action="/board"
                values={values}
                locations={locations}
                agents={agents}
                activeCount={activeCount}
              />
            </div>
          )}

          {tickets.length === 0 ? (
            <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <CardTitle className="text-lg font-medium">
                  {hasQuery ? "Kein Treffer" : "Board ist leer"}
                </CardTitle>
                <CardDescription>
                  {hasQuery
                    ? "Kein Ticket passt zu dieser Auswahl."
                    : "Sobald Meldungen eingehen, erscheinen sie hier."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <TicketTable tickets={tickets} showOwner locations={locations} />
          )}
        </div>
      </main>
    </>
  );
}
