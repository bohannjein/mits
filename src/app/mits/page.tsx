import type { Metadata } from "next";
import Link from "next/link";
import {
  FilterIcon,
  FilterXIcon,
  PinIcon,
  ServerIcon,
} from "lucide-react";

import { IncidentBanner } from "@/components/dashboard/incident-banner";
import { PresenceList } from "@/components/dashboard/presence-list";
import { RemindersWidget } from "@/components/dashboard/reminders-widget";
import { StatsTiles } from "@/components/dashboard/stats-tiles";
import { AppHeader } from "@/components/layout/app-header";
import { QueueLive } from "@/components/tickets/queue-live";
import { QueueShortcuts } from "@/components/tickets/queue-shortcuts";
import { QueueFilterBar } from "@/components/tickets/queue-filter-bar";
import { QueueTabs } from "@/components/tickets/queue-tabs";
import type { TicketFilterValues } from "@/components/tickets/ticket-filters";
import { TicketPager } from "@/components/tickets/ticket-pager";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AGENT_VIEWS,
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
import { visibleAreas } from "@/lib/role-visibility";
import { detectClusters } from "@/lib/services/ai/clustering";
import { categoryLabel, listCategoryTree } from "@/lib/ticket-categories";
import { MAX_PINS } from "@/lib/ticket-pins";
import { listUpcomingReminders } from "@/lib/ticket-reminders";
import { getSystemTimezone } from "@/lib/system-settings";
import { formatDateTime } from "@/lib/format";
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
import {
  TICKET_STATUS_LABELS,
  formatTicketNumber,
  type TicketStatus,
} from "@/types/mits";

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
  const areas = visibleAreas(user.role);

  if (flags.feature_ticket_search && areas.ticket_search) {
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
  /*
   * The pinned block, and the list it was taken out of.
   *
   * Both run the *same* filter — the block is this queue section pulled to the
   * top, not a second queue. A pin in „Wartend" is therefore not shown while
   * „Eingang" is the active tab: a row above the table that contradicts the
   * filter below it is worse than a row one click away.
   *
   * `excludePinnedFor` on the list is what keeps a pinned ticket from appearing
   * twice on one screen, and the count below uses the same filter — a pager
   * whose total included rows the list no longer shows would be off by however
   * many pins somebody happens to have.
   *
   * No paging on the block: it is capped at `MAX_PINS`, and a pin somebody can
   * page away from is not a pin. It renders on every page for the same reason.
   */
  const pinning = flags.feature_ticket_pins;
  const pinnedTickets = pinning
    ? searchTickets({ ...active, pinnedOnlyFor: user.id, limit: MAX_PINS }, user)
    : [];

  const listFilter = pinning
    ? { ...active, excludePinnedFor: user.id }
    : active;

  const total = countSearchTickets(listFilter, user);
  const page = Math.min(toPage(params.page), pageCount(total));
  const tickets = searchTickets(
    { ...listFilter, limit: TICKETS_PER_PAGE, offset: pageOffset(page, total) },
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

  /*
   * The tree for the filter, and the readable path for the notice.
   *
   * Read even when the filter is switched off, because the notice has to name a
   * category that is *already* in the URL — a deep link from before somebody
   * disabled the module still narrows the list, and a notice that said "1 Filter
   * aktiv:" with nothing after it is worse than one that names it.
   */
  const categories = listCategoryTree();
  const activeCategoryLabel = categoryLabel(filter.categoryId ?? null);

  /*
   * The agent's own reminders, formatted here.
   *
   * The widget is a client component (each row's tick is a form), so the due times
   * are turned into strings on this side — the instance's timezone is a server
   * read, and handing the browser an ISO string plus a zone name would put a second
   * formatter in the bundle for the one thing every other timestamp in MITS goes
   * through `lib/format.ts` for.
   */
  const timezone = getSystemTimezone();
  const now = Date.now();
  const reminderRows = flags.feature_ticket_reminders
    ? listUpcomingReminders(user.id).map((entry) => ({
        id: entry.id,
        ticketId: entry.ticket_id,
        ticketNumber: formatTicketNumber(entry.ticket_number),
        ticketTitle: entry.ticket_title,
        dueLabel: formatDateTime(new Date(entry.due_at), timezone),
        note: entry.note,
        overdue: new Date(entry.due_at).getTime() <= now,
      }))
    : [];

  const showAside =
    flags.feature_stats_heatmap ||
    flags.feature_presence_sidebar ||
    reminderRows.length > 0;

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
          {/*
            The heading, and nothing under it.

            The line that used to sit here read "Pool · Eingang — 1 Ticket,
            angemeldet als admin@mits.local." and every part of it was already on
            screen: the scope and the view are the two tab strips directly below
            (`QueueTabs` renders `AGENT_SCOPE_LABELS` and `AGENT_VIEW_LABELS`), the
            count is the badge on the active tab and the range in `TicketPager`, and
            the address is in the user menu in the header.

            It was not merely redundant. Restating the tab you are on *above* the
            tabs makes the tabs look like they are not the answer — and it cost the
            two lines of vertical space that the ticket table wants, on the page
            whose whole job is to show as many rows as fit.

            The one number that is genuinely nowhere else is the *filtered* total
            when a deep filter narrows the list below what the tab badge claims.
            That belongs in `ActiveFilterNotice`, which is the line explaining why
            the two disagree — see there.
          */}
          <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
            Queue
          </h1>

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
                  /* Zweite Achse neben dem Modulschalter: die CMDB kann für die
                     Instanz an und für diese Rolle ausgeblendet sein. */
                  /*
                   * The CMDB only. "Statistiken" used to sit here as its equal and
                   * has moved next to the pie chart in the sidebar — the CMDB is a
                   * place agents work, the statistics are a place they look
                   * occasionally, and two identical pills said otherwise.
                   *
                   * Hidden with the module, not merely disabled: a link into a 404
                   * is a worse answer than no link.
                   */
                  flags.feature_cmdb && areas.mits_cmdb ? (
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

              {/*
                The category pair, and only it.

                The full filter block that used to sit here is still gone, for the
                reason it went: six controls occupied the screen permanently for an
                occasional operation and pushed the ticket list below the fold.
                Filtering by category is the exception — it is how a desk with
                specialists divides the day's work, so it is the one filter that is
                touched on the way in rather than occasionally.

                Renders nothing when no categories exist, so an instance that never
                adopted them sees the queue exactly as before.
              */}
              {flags.feature_ticket_categories && (
                <QueueFilterBar categories={categories} basePath="/mits" />
              )}

              {activeCount > 0 && (
                <ActiveFilterNotice
                  count={activeCount}
                  values={values}
                  categoryLabel={activeCategoryLabel}
                  total={total}
                />
              )}

              {/*
                Angeheftet, oben, mit Akzentrahmen.

                Kein Block, wenn nichts angeheftet ist — keine Überschrift und
                keine Karte mit „keine angehefteten Tickets". Dieselbe Regel, die
                das Erinnerungs-Widget bei leerer Liste `null` rendern lässt: eine
                Dauererinnerung an ein Feature ist auf der Fläche, um die am
                meisten konkurriert wird, teurer als das Feature wert ist.

                Ohne `sortBasePath`, also mit stummer Kopfzeile: zwei Zeilen mit
                Sortierlinks übereinander wären zwei Steuerungen für eine
                Sortierung. Die Reihenfolge ist dieselbe wie unten.
              */}
              {pinnedTickets.length > 0 && (
                <section className="grid gap-2">
                  <h2 className="label-industrial flex items-center gap-2">
                    <PinIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
                    Angeheftet
                    <span className="tabular-nums text-muted-foreground">
                      {pinnedTickets.length}
                    </span>
                  </h2>
                  <TicketTable
                    tickets={pinnedTickets}
                    showOwner
                    showPin
                    accent
                    showTime={flags.feature_time_tracking}
                    locations={locations}
                    detailBase="/mits/tickets"
                    sort={sort}
                  />
                </section>
              )}

              {tickets.length === 0 ? (
                /*
                 * „Keine Tickets" nur, wenn auch oben nichts steht. Sonst wäre es
                 * ein Satz über einer Tabelle mit Zeilen darin.
                 */
                pinnedTickets.length === 0 && (
                  <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                    Keine Tickets in dieser Ansicht.
                  </p>
                )
              ) : (
                <section className="grid gap-2">
                  {/* Die Überschrift gibt es nur, wenn es zwei Blöcke zu
                      unterscheiden gibt. Über der einzigen Tabelle der Seite wäre
                      „Alle Tickets" eine Beschriftung für das Offensichtliche. */}
                  {pinnedTickets.length > 0 && (
                    <h2 className="label-industrial">Alle Tickets</h2>
                  )}
                  <TicketTable
                    tickets={tickets}
                    showOwner
                    showPin={pinning}
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
                </section>
              )}
            </div>

            {showAside && (
              <aside className="grid gap-6">
                {/* First in the column: it is the only module here that is about
                    something the agent asked to be reminded of at a particular
                    time, and the two below it are ambient. */}
                <RemindersWidget rows={reminderRows} detailBase="/mits/tickets" />
                {flags.feature_stats_heatmap && (
                  <StatsTiles
                    opened={opened}
                    closed={closed}
                    locations={locations}
                    counts={ticketCountsByLocation()}
                    showHeatmap={flags.feature_stats_heatmap}
                    showAnalyticsLink={areas.mits_analytics}
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
  /**
   * The category's readable path, resolved on the server.
   *
   * Named rather than counted, unlike the five below it: „Standort" tells somebody
   * a site filter is on and the dropdown beside it says which, but the category is
   * the filter most likely to have arrived in a pasted URL — and „Kategorie" alone
   * would leave them to guess which one narrowed the queue.
   */
  categoryLabel,
  /**
   * How many tickets survive the filter.
   *
   * The one count that is not visible anywhere else. The badge on the active tab
   * is the *unfiltered* size of that view — `counts` is built from the view preset
   * alone — and `TicketPager` renders nothing at all on a single page. So a
   * narrowed queue could show a tab claiming forty above a table of three with
   * nothing saying why.
   */
  total,
}: {
  count: number;
  values: TicketFilterValues;
  categoryLabel: string;
  total: number;
}) {
  const parts: string[] = [];
  if (values.q) parts.push(`Text „${values.q}“`);
  if (categoryLabel) parts.push(`Kategorie ${categoryLabel}`);
  if (values.locationId) parts.push("Standort");
  if (values.status) parts.push(`Status ${TICKET_STATUS_LABELS[values.status as TicketStatus] ?? values.status}`);
  if (values.priority) parts.push("Priorität");
  if (values.assignedTo) parts.push("Bearbeiter");
  if (values.from || values.to) parts.push("Zeitraum");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <FilterIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <span className="min-w-40 flex-1 text-sm">
        {count} {count === 1 ? "Filter" : "Filter"} aktiv: {parts.join(" · ")} —{" "}
        <span className="tabular-nums">
          {total} {total === 1 ? "Treffer" : "Treffer"}
        </span>
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
