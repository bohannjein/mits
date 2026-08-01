import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { QueueLive } from "@/components/tickets/queue-live";
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
import { OPEN_TICKET_STATUSES, type TicketStatus } from "@/types/mits";

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

  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
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
   * Two views, and closed tickets are not in the default one.
   *
   * A reporter's list is a list of things still happening. Ten resolved tickets
   * from last quarter above the one they are waiting on is the same failure as an
   * unfiltered inbox — the page technically shows everything and answers nothing.
   *
   * They are not hidden, they are one click away under "Verlauf". Hiding them
   * outright would mean a reporter cannot look up what the desk did in March,
   * which is the second most common reason to open this page.
   *
   * The agent side is deliberately untouched: a queue that quietly dropped closed
   * tickets would be a queue an agent cannot audit.
   */
  const history = one(params.view) === "verlauf";
  const scope = history
    ? { statusIn: ["closed"] as TicketStatus[] }
    : { statusIn: OPEN_TICKET_STATUSES };

  // Counted per view, so the tabs can say how much is behind each one. Two cheap
  // indexed counts; the alternative is a badge that lies or no badge at all.
  const openCount = countSearchTickets(
    { ...filter, statusIn: OPEN_TICKET_STATUSES },
    user,
  );
  const closedCount = countSearchTickets(
    { ...filter, statusIn: ["closed"] },
    user,
  );

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
  const total = countSearchTickets({ ...scope, ...filter, sort }, user);
  const page = Math.min(toPage(params.page), pageCount(total));
  const tickets = searchTickets(
    {
      // The view first, an explicit filter on top: both are status clauses and
      // they narrow with AND, so filtering to "Gelöst" inside "Verlauf" finds
      // nothing rather than quietly widening the view.
      ...scope,
      ...filter,
      sort,
      limit: TICKETS_PER_PAGE,
      offset: pageOffset(page, total),
    },
    user,
  );

  const locations = listLocations();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-5xl">
          {/* Same live/fallback pair as the queue — a reporter’s list has to
              show a status change without them reloading the page. */}
          <QueueLive />
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

          <nav
            aria-label="Ansicht"
            className="mb-6 inline-flex w-fit gap-1 rounded-full border border-border bg-card p-1"
          >
            {[
              { key: "", label: "Aktuell", count: openCount },
              { key: "verlauf", label: "Verlauf", count: closedCount },
            ].map((tab) => {
              const active = history === (tab.key === "verlauf");
              return (
                <Link
                  key={tab.key || "offen"}
                  href={tab.key ? "/customer/tickets?view=verlauf" : "/customer/tickets"}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "inline-flex h-9 items-center gap-2 rounded-full bg-inverse-surface px-3.5 text-sm font-medium text-inverse-surface-foreground"
                      : "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
                  }
                >
                  {tab.label}
                  <span className="text-xs opacity-70">{tab.count}</span>
                </Link>
              );
            })}
          </nav>

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
