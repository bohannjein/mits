import type { Metadata } from "next";
import Link from "next/link";
import {
  FilterIcon,
  FilterXIcon,
  ServerIcon,
} from "lucide-react";

import { IncidentBanner } from "@/components/dashboard/incident-banner";
import { PresenceList } from "@/components/dashboard/presence-list";
import { StatsTiles } from "@/components/dashboard/stats-tiles";
import { AppHeader } from "@/components/layout/app-header";
import { QueueLive } from "@/components/tickets/queue-live";
import { QueueShortcuts } from "@/components/tickets/queue-shortcuts";
import { QueueTabs } from "@/components/tickets/queue-tabs";
import type { TicketFilterValues } from "@/components/tickets/ticket-filters";
import { TicketPager } from "@/components/tickets/ticket-pager";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AGENT_SCOPE_LABELS,
  AGENT_VIEWS,
  AGENT_VIEW_LABELS,
  filterFor,
  getSavedAgentView,
  isAgentScope,
  isAgentView,
  saveAgentView,
  viewsForScope,
  type AgentScope,
  type AgentView,
} from "@/lib/agent-views";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { listLocations, ticketCountsByLocation } from "@/lib/locations";
import { listPresence } from "@/lib/presence";
import { detectClusters } from "@/lib/services/ai/clustering";
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
  todayCounts,
} from "@/lib/tickets";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/types/mits";

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
  const user = await requireRole("agent", "/mits");

  const params = await searchParams;
  const flags = getFeatureFlags();

  if (flags.feature_ticket_search) {
    jumpToTicketNumber(params.q as string | undefined, user);
  }

  /*
   * Nothing in the query means "where I left off". The saved pair is written on
   * every explicit switch, so an agent who works the pool inbox lands there and
   * one who lives in their own escalated list lands there — no settings page.
   */
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const requestedScope = one(params.scope);
  const requestedView = one(params.view);
  const saved = getSavedAgentView(user.id);

  const scope: AgentScope = isAgentScope(requestedScope)
    ? requestedScope
    : saved.scope;

  let view: AgentView = isAgentView(requestedView) ? requestedView : saved.view;
  // The inbox does not exist in "Mein Bereich" — a saved or hand-typed value has
  // to land somewhere real rather than on an empty tab.
  if (!viewsForScope(scope).includes(view)) view = "open";

  if (isAgentScope(requestedScope) || isAgentView(requestedView)) {
    saveAgentView(user.id, { scope, view });
  }

  // The tab's preset first, then the deep filters on top of it, then the sort.
  const { filter, values, activeCount } = parseTicketQuery(params);
  const sort = parseTicketSort(params.sort, params.dir);
  const active = { ...filterFor(scope, view, user.id), ...filter, sort };

  /*
   * Counted before the page is fetched, because the offset depends on the total:
   * an agent sitting on page four whose filter just narrowed the list to two
   * pages gets the last page that exists rather than an empty table. `pageOffset`
   * clamps; `page` stays what the URL said so the pager can highlight it.
   */
  const total = countSearchTickets(active, user);
  const page = Math.min(toPage(params.page), pageCount(total));
  const tickets = searchTickets(
    { ...active, limit: TICKETS_PER_PAGE, offset: pageOffset(page, total) },
    user,
  );

  // Counts for the tabs actually shown, so the badges say where the work is.
  // Cheap indexed reads; the alternative is an agent clicking through to find out.
  const counts = Object.fromEntries(
    AGENT_VIEWS.map((candidate) => [
      candidate,
      searchTickets(filterFor(scope, candidate, user.id), user).length,
    ]),
  ) as Record<AgentView, number>;

  const locations = listLocations();
  const { opened, closed } = todayCounts();

  const showAside =
    flags.feature_stats_heatmap || flags.feature_presence_sidebar;

  /*
   * Awaited, unlike the counts above: the banner belongs at the top of the page
   * and streaming it in afterwards would push the queue down under the agent's
   * cursor. The grouping itself is synchronous arithmetic — the await is only
   * there for the optional headline, which falls back rather than blocking.
   */
  const clusters = await detectClusters();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-7xl">
          {/* Renders nothing. Refreshes the list on a realtime signal, and
              falls back to an ETag check that answers 304 when nothing moved. */}
          <QueueLive />
          {/* j / k / Enter / c over the table below. Renders nothing. */}
          <QueueShortcuts />
          <div>
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Queue
            </h1>
            <p className="mt-2 text-muted-foreground">
              {/* `total`, not `tickets.length` — the latter is now the page size,
                  and a queue of two hundred reporting "50 Tickets" is a number
                  somebody would act on. */}
              {AGENT_SCOPE_LABELS[scope]} · {AGENT_VIEW_LABELS[view]} —{" "}
              {total} {total === 1 ? "Ticket" : "Tickets"}, angemeldet als{" "}
              {user.email}.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {/*
            The sidebar column exists only when something goes in it. Declaring
            `1fr 20rem` unconditionally reserved 320 px of nothing on an instance
            with both sidebar modules switched off, and took that width straight
            out of the ticket table — the one element on the page that has to fit
            without scrolling sideways.
          */}
          <div
            className={
              showAside
                ? "grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start"
                : "grid gap-8"
            }
          >
            <div className="grid min-w-0 gap-4">
              {/*
                Above the tabs, because it is about the queue as a whole rather
                than about the tab somebody happens to be in — and because an
                outage is the one thing worth seeing before the ticket list.
                Renders nothing at all when the feature is off or no group
                reaches the configured threshold.
              */}
              {clusters.map((cluster) => (
                <IncidentBanner
                  key={cluster.key}
                  title={cluster.title}
                  keywords={cluster.keywords}
                  members={cluster.members}
                />
              ))}

              {/*
                The two links out of the queue sit beside the scope switcher, in
                its row but not in its group — see the note on `actions`. Both are
                inside /mits, so no area gate applies: whoever may see this page
                may see both. A reporter never gets here at all — the guard sends
                them to /customer and the user menu shows them no route in.
              */}
              <QueueTabs
                scope={scope}
                view={view}
                counts={counts}
                actions={
                  /*
                   * The CMDB only. "Statistiken" used to sit here as its equal and
                   * has moved next to the pie chart in the sidebar — the CMDB is a
                   * place agents work, the statistics are a place they look
                   * occasionally, and two identical pills said otherwise.
                   *
                   * Hidden with the module, not merely disabled: a link into a 404
                   * is a worse answer than no link.
                   */
                  flags.feature_cmdb ? (
                    <Button
                      asChild
                      size="sm"
                      className="h-11 rounded-full border border-border bg-card px-4 text-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Link href="/mits/cmdb">
                        <ServerIcon strokeWidth={1.5} />
                        CMDB
                      </Link>
                    </Button>
                  ) : undefined
                }
              />

              {/* The filter block that used to sit here is gone. It occupied the
                  screen permanently for an occasional operation and pushed the
                  ticket list below the fold; searching now happens in the header
                  dialog (Ctrl+K). Deep-link filters in the URL still apply — only
                  the form is gone, not the capability. */}
              {activeCount > 0 && (
                <ActiveFilterNotice count={activeCount} values={values} />
              )}

              {tickets.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Keine Tickets in dieser Ansicht.
                </p>
              ) : (
                <>
                  <TicketTable
                    tickets={tickets}
                    showOwner
                    showTime={flags.feature_time_tracking}
                    locations={locations}
                    detailBase="/mits/tickets"
                    sort={sort}
                    sortBasePath="/mits"
                    // Passed whole, so a sort click keeps the tab, the scope and any
                    // deep filter that is already narrowing the list.
                    searchParams={params}
                  />
                  <TicketPager
                    basePath="/mits"
                    searchParams={params}
                    page={page}
                    pageCount={pageCount(total)}
                    total={total}
                    perPage={TICKETS_PER_PAGE}
                  />
                </>
              )}
            </div>

            {showAside && (
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
                  <PresenceList people={listPresence()} />
                )}
              </aside>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * Says so when the URL carries deep filters.
 *
 * Without the old filter form on screen there is nothing else to reveal them, and
 * a narrowed queue is indistinguishable from a complete one — the failure mode is a
 * queue that looks like it is working while holding the wrong rows. The reset link
 * drops the filters and keeps the tab.
 */
function ActiveFilterNotice({
  count,
  values,
}: {
  count: number;
  values: TicketFilterValues;
}) {
  const parts: string[] = [];
  if (values.q) parts.push(`Text „${values.q}“`);
  if (values.locationId) parts.push("Standort");
  if (values.status) parts.push(`Status ${TICKET_STATUS_LABELS[values.status as TicketStatus] ?? values.status}`);
  if (values.priority) parts.push("Priorität");
  if (values.assignedTo) parts.push("Bearbeiter");
  if (values.from || values.to) parts.push("Zeitraum");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <FilterIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <span className="min-w-40 flex-1 text-sm">
        {count} {count === 1 ? "Filter" : "Filter"} aktiv: {parts.join(" · ")}
      </span>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-3 text-xs"
      >
        <Link href="/mits">
          <FilterXIcon strokeWidth={1.5} />
          Zurücksetzen
        </Link>
      </Button>
    </div>
  );
}
