import type { Metadata } from "next";

import { PresenceList } from "@/components/dashboard/presence-list";
import { StatsTiles } from "@/components/dashboard/stats-tiles";
import { AppHeader } from "@/components/layout/app-header";
import { QueueTabs } from "@/components/tickets/queue-tabs";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketSearch } from "@/components/tickets/ticket-search";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Separator } from "@/components/ui/separator";
import {
  AGENT_VIEWS,
  AGENT_VIEW_LABELS,
  filterForView,
  getSavedAgentView,
  isAgentView,
  saveAgentView,
  type AgentView,
} from "@/lib/agent-views";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { listLocations, ticketCountsByLocation } from "@/lib/locations";
import { listAgentPresence } from "@/lib/presence";
import {
  jumpToTicketNumber,
  parseTicketQuery,
  type RawSearchParams,
} from "@/lib/ticket-query";
import { searchTickets, todayCounts } from "@/lib/tickets";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Queue — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   The staff hub. Lands directly on the queue — no landing page.

   A view is a preset over `searchTickets`, so the deep filters from part 3 keep
   working on top of a tab: both end up in the same filter object and narrow with
   AND.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AgentQueuePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Authoritative role gate. A reporter who follows a link here is sent to their
  // own portal rather than to a permission error — see `deniedPathFor`.
  const user = await requireRole("technician", "/mits");

  const params = await searchParams;
  const flags = getFeatureFlags();

  if (flags.feature_ticket_search) {
    jumpToTicketNumber(params.q as string | undefined, user);
  }

  /*
   * No `?view=` means "where I left off". The saved value is written on every
   * explicit switch, so an agent who works the inbox lands on the inbox and one
   * who lives in "Meine" lands there — without a settings page for it.
   */
  const requested = Array.isArray(params.view) ? params.view[0] : params.view;
  const view: AgentView = isAgentView(requested)
    ? requested
    : getSavedAgentView(user.id);

  if (isAgentView(requested)) saveAgentView(user.id, requested);

  // The tab's preset first, then the deep filters on top of it.
  const { filter, values, activeCount } = parseTicketQuery(params);
  const tickets = searchTickets(
    { ...filterForView(view, user.id), ...filter },
    user,
  );

  // Counts for every tab, so the badges show where the work is. Five cheap
  // indexed reads; the alternative is an agent clicking through to find out.
  const counts = Object.fromEntries(
    AGENT_VIEWS.map((candidate) => [
      candidate,
      searchTickets(filterForView(candidate, user.id), user).length,
    ]),
  ) as Record<AgentView, number>;

  const locations = listLocations();
  const agents = listUsers()
    .filter((candidate) => canViewBoard(candidate.role))
    .map((candidate) => ({ id: candidate.id, name: candidate.name }));
  const { opened, closed } = todayCounts();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-7xl">
          <div>
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Queue
            </h1>
            <p className="mt-2 text-muted-foreground">
              {AGENT_VIEW_LABELS[view]} — {tickets.length}{" "}
              {tickets.length === 1 ? "Ticket" : "Tickets"}, angemeldet als{" "}
              {user.email}.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
            <div className="grid min-w-0 gap-4">
              <QueueTabs active={view} counts={counts} />

              {flags.feature_ticket_search && (
                <>
                  <TicketSearch action="/mits" defaultValue={values.q} />
                  <TicketFilters
                    action="/mits"
                    values={values}
                    locations={locations}
                    agents={agents}
                    activeCount={activeCount}
                  />
                </>
              )}

              {tickets.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Keine Tickets in dieser Ansicht.
                </p>
              ) : (
                <TicketTable
                  tickets={tickets}
                  showOwner
                  locations={locations}
                  detailBase="/mits/tickets"
                />
              )}
            </div>

            <aside className="grid gap-6">
              {flags.feature_stats_heatmap && (
                <StatsTiles
                  opened={opened}
                  closed={closed}
                  locations={locations}
                  counts={ticketCountsByLocation()}
                  showHeatmap={flags.feature_stats_heatmap}
                />
              )}
              {flags.feature_presence_sidebar && (
                <PresenceList agents={listAgentPresence()} />
              )}
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
