import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ClockIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  formatMinutes,
  formatRelativeTime,
} from "@/lib/format";
import { getSystemTimezone } from "@/lib/system-settings";
import {
  DEFAULT_TICKET_SORT,
  TICKET_SORT_LABELS,
  sortHref,
  type TicketSort,
  type TicketSortKey,
} from "@/lib/ticket-sort";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketNumber,
  isElevatedPriority,
  type MITSLocation,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Shared listing for "my tickets" and the agent queue.

   A **server** component, and it stays one. Sorting travels in the URL, so a
   header is a link rather than a click handler — which keeps the result
   shareable, keeps the back button working, and lets the relative age be computed
   once during the render instead of after hydration. The moment this needed
   `useState` for the sort, every row's age would have become a client-side
   calculation and a hydration risk.

   `showOwner` is what separates the two callers: a reporter's listing only ever
   contains their own tickets, so the reporter and owner columns would be a column
   of their own address and a column they cannot act on.

   **It never scrolls sideways.** A horizontally scrolling table hides its right
   half behind a gesture nobody makes with a mouse — the status and the age end up
   off-screen on a laptop, which are the two things somebody scanning a queue is
   looking for. Everything fits instead: `table-fixed` with declared widths, the
   title truncated, and the columns that are context rather than content dropped
   at narrow widths. The full title is still in the row's `title` attribute and in
   the link itself.

   The labels come from types/mits.ts rather than living here, so a new status
   cannot render as a blank cell in one table and a label in another.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketTable({
  tickets,
  showOwner = false,
  /** Resolves `location_id` for the site column. Omit to hide that column. */
  locations,
  /**
   * Where a row links to. The two worlds have their own detail view, and linking
   * an agent into the reporter's lean page would drop the workflow panel.
   */
  detailBase = "/customer/tickets",
  /**
   * Sorting. Omitting `sortBasePath` renders plain headings — a caller with no URL
   * to sort into (a panel, a dialog) gets a static table rather than links that
   * would navigate away from it.
   */
  sort = DEFAULT_TICKET_SORT,
  sortBasePath,
  searchParams = {},
  /** Shows the logged-time column. Off where the module is not in play. */
  showTime = false,
}: {
  tickets: MITSTicket[];
  showOwner?: boolean;
  locations?: MITSLocation[];
  detailBase?: string;
  sort?: TicketSort;
  sortBasePath?: string;
  searchParams?: Record<string, string | string[] | undefined>;
  showTime?: boolean;
}) {
  const timezone = getSystemTimezone();
  // One clock for every row, read once. Calling Date.now() per row would let a
  // slow render put two tickets filed in the same second into different buckets.
  const now = Date.now();

  if (tickets.length === 0) {
    return (
      <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
        Noch keine Tickets erfasst.
      </p>
    );
  }

  const byId = new Map((locations ?? []).map((entry) => [entry.id, entry]));
  const showLocation = locations !== undefined && locations.length > 0;

  const header = (key: TicketSortKey, className?: string) => (
    <SortableHead
      key={key}
      sortKey={key}
      sort={sort}
      basePath={sortBasePath}
      searchParams={searchParams}
      className={className}
    />
  );

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elev-1">
      {/*
        `overflow-hidden` rather than the primitive's `overflow-x-auto`: with
        `table-fixed` there is nothing to scroll to, and leaving the container
        scrollable would let a long unbroken word push a phantom scrollbar in.
      */}
      <Table containerClassName="overflow-hidden" className="table-fixed">
        <TableHeader>
          <TableRow>
            {/*
              Widths are declared once, here, because `table-fixed` takes them
              from the first row and ignores everything the cells ask for. The
              title column is the only one without one — it absorbs whatever is
              left, which is what keeps the rest from being squeezed.

              `hidden … table-cell` drops the context columns on narrow screens
              rather than shrinking them into unreadability. What survives at every
              width is number, title, status and age: enough to find a ticket and
              know whether it needs attention.
            */}
            {header("number", "w-40")}
            {header("title")}
            {showLocation && (
              <TableHead className="hidden w-24 lg:table-cell">Standort</TableHead>
            )}
            {showOwner && header("reporter", "hidden w-48 xl:table-cell")}
            {showOwner && header("owner", "hidden w-40 lg:table-cell")}
            {header("priority", "hidden w-28 sm:table-cell")}
            {header("status", "w-36")}
            {showTime && (
              <TableHead className="hidden w-24 text-right xl:table-cell">
                Zeit
              </TableHead>
            )}
            {header("age", "w-28")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => {
            const location = ticket.location_id
              ? byId.get(ticket.location_id)
              : undefined;

            return (
              <TableRow key={ticket.id}>
                <TableCell
                  className={cn(
                    "font-mono text-xs whitespace-nowrap text-muted-foreground",
                    // The unread dot rides on the number cell so it sits in a fixed
                    // column instead of shifting with the title's length.
                    ticket.unread && "text-foreground",
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        ticket.unread ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    {formatTicketNumber(ticket.ticket_number)}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "font-medium",
                    // Weight *and* the dot, not an accent hue alone: colour is the
                    // one signal a red-green colour blind reader loses, and "which
                    // of these is new" is the entire point of the row.
                    ticket.unread && "font-semibold",
                  )}
                >
                  {/*
                    `block truncate` needs the cell to have a width to truncate
                    against, which `table-fixed` gives it. The full text stays
                    available as the tooltip and to a screen reader.
                  */}
                  <Link
                    href={`${detailBase}/${ticket.id}`}
                    title={ticket.title}
                    className="block truncate underline-offset-4 hover:underline"
                  >
                    {ticket.title}
                  </Link>
                  {ticket.unread && (
                    <span className="sr-only"> — ungelesene Änderung</span>
                  )}
                </TableCell>
                {showLocation && (
                  <TableCell className="hidden truncate text-xs text-muted-foreground lg:table-cell">
                    {/* A ticket can outlive its branch — see lib/locations.ts. */}
                    {location?.code || location?.name || "—"}
                  </TableCell>
                )}
                {showOwner && (
                  <TableCell
                    className="hidden truncate text-xs xl:table-cell"
                    title={ticket.created_by_email}
                  >
                    {ticket.created_by_email}
                  </TableCell>
                )}
                {showOwner && (
                  <TableCell className="hidden truncate text-xs lg:table-cell">
                    {ticket.assigned_to_name ?? (
                      <span className="text-muted-foreground">
                        Nicht zugewiesen
                      </span>
                    )}
                  </TableCell>
                )}
                <TableCell className="hidden sm:table-cell">
                  <Badge
                    variant={
                      isElevatedPriority(ticket.priority) ? "default" : "outline"
                    }
                    className="rounded-full"
                  >
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className="max-w-full truncate rounded-full"
                    title={TICKET_STATUS_LABELS[ticket.status]}
                  >
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </Badge>
                </TableCell>
                {showTime && (
                  <TableCell className="hidden text-right text-xs whitespace-nowrap tabular-nums xl:table-cell">
                    {ticket.logged_minutes > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <ClockIcon
                          className="size-3 text-muted-foreground"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        {formatMinutes(ticket.logged_minutes)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {/*
                  The age, with the exact instant in the tooltip. Computed on the
                  server: this is not a client component, so there is nothing to
                  hydrate and no second clock to disagree with. It goes stale
                  between renders, which is what `AutoRefresh` in the header is for.
                */}
                <TableCell
                  className="text-xs whitespace-nowrap text-muted-foreground"
                  title={formatDateTime(ticket.created_at, timezone)}
                >
                  {formatRelativeTime(ticket.created_at, now)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * A column heading that sorts.
 *
 * The arrow has three states, not two: `ArrowUpDown` on an inactive column says
 * "this is sortable", up or down on the active one says which way. One arrow on
 * every column would make each of them look active.
 */
function SortableHead({
  sortKey,
  sort,
  basePath,
  searchParams,
  className,
}: {
  sortKey: TicketSortKey;
  sort: TicketSort;
  basePath?: string;
  searchParams: Record<string, string | string[] | undefined>;
  className?: string;
}) {
  const label = TICKET_SORT_LABELS[sortKey];
  const active = sort.key === sortKey;

  if (!basePath) {
    return <TableHead className={className}>{label}</TableHead>;
  }

  const Arrow = !active
    ? ArrowUpDownIcon
    : sort.dir === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon;

  return (
    <TableHead className={className} aria-sort={ariaSort(active, sort.dir)}>
      <Link
        href={sortHref(basePath, searchParams, sort, sortKey)}
        // Hover moves the background and leaves the label at full contrast; the
        // arrow's opacity is the only thing that dims, and it is decoration.
        className={cn(
          "-mx-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          active && "font-semibold",
        )}
      >
        {label}
        <Arrow
          className={cn("size-3.5", active ? "opacity-100" : "opacity-40")}
          strokeWidth={1.5}
          aria-hidden
        />
      </Link>
    </TableHead>
  );
}

function ariaSort(
  active: boolean,
  dir: TicketSort["dir"],
): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}
