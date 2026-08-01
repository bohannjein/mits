import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketSearch } from "@/components/tickets/ticket-search";
import { TicketPager } from "@/components/tickets/ticket-pager";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { listLocations } from "@/lib/locations";
import {
  jumpToTicketNumber,
  parseTicketQuery,
  type RawSearchParams,
} from "@/lib/ticket-query";
import { parseTicketSort } from "@/lib/ticket-sort";
import {
  TICKETS_PER_PAGE,
  countSearchTickets,
  pageCount,
  pageOffset,
  searchTickets,
  toPage,
} from "@/lib/tickets";

export const metadata: Metadata = {
  title: "Meine Tickets — MITS",
};

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Authoritative guard. The proxy already redirected anonymous visitors, but
  // this is the check that actually decides.
  const user = await requireUser("/customer/tickets");

  const params = await searchParams;
  const flags = getFeatureFlags();
  const searchEnabled = flags.feature_ticket_search;

  // Typing a number jumps straight into the ticket. Throws a redirect, so
  // nothing below runs in that case.
  if (searchEnabled) jumpToTicketNumber(params.q as string | undefined, user);

  // `ownOnly` regardless of role: this page is "mine" for everyone, including
  // admins. Foreign tickets live on the board.
  const { filter, values, activeCount } = parseTicketQuery(params, {
    ownOnly: true,
  });

  const hasQuery = searchEnabled && (activeCount > 0 || Boolean(values.q));
  const sort = parseTicketSort(params.sort, params.dir);

  /*
   * One query for both cases, where the unfiltered path used to call
   * `listOwnTickets`.
   *
   * That shortcut cannot stay: only `searchTickets` computes the read state and
   * honours a sort, so the unfiltered listing — which is the one people actually
   * look at — would have been the only table with no unread markers and dead
   * column headers. `ownOnly` is already set by `parseTicketQuery` above, and the
   * role clause narrows on top of it, so the scope is unchanged.
   */
  // Same order as the queue: count, clamp the page, then fetch that slice.
  const total = countSearchTickets({ ...filter, sort }, user);
  const page = Math.min(toPage(params.page), pageCount(total));
  const tickets = searchTickets(
    { ...filter, sort, limit: TICKETS_PER_PAGE, offset: pageOffset(page, total) },
    user,
  );

  const locations = listLocations();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-5xl">
          <BackLink href="/customer" label="Zurück zum Portal" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Meine Tickets
              </h1>
              <p className="mt-2 text-muted-foreground">
                {/* The total, not the page size — see the note on the queue. */}
                {hasQuery
                  ? `${total} Treffer für die aktuelle Auswahl.`
                  : `Alles, was du gemeldet hast — ${total} ${total === 1 ? "Eintrag" : "Einträge"}.`}
              </p>
            </div>
            <Button
              asChild
              className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              <Link href="/customer/new">
                <PlusIcon strokeWidth={1.5} />
                Neues Ticket
              </Link>
            </Button>
          </div>

          <Separator className="my-8 bg-border" />

          {searchEnabled && (
            <div className="mb-6 grid gap-4">
              <TicketSearch action="/customer/tickets" defaultValue={values.q} />
              <TicketFilters
                action="/customer/tickets"
                values={values}
                locations={locations}
                activeCount={activeCount}
              />
            </div>
          )}

          {hasQuery && total === 0 ? (
            <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
              Kein Ticket passt zu dieser Auswahl.
            </p>
          ) : (
            <div className="grid gap-4">
              <TicketTable
                tickets={tickets}
                locations={locations}
                sort={sort}
                sortBasePath="/customer/tickets"
                searchParams={params}
              />
              <TicketPager
                basePath="/customer/tickets"
                searchParams={params}
                page={page}
                pageCount={pageCount(total)}
                total={total}
                perPage={TICKETS_PER_PAGE}
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
