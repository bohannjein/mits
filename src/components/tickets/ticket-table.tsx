import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ClockIcon,
  ReplyIcon,
} from "lucide-react";

import { PinButton } from "@/components/tickets/pin-button";
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
  CUSTOMER_STATUS,
  TICKET_STATUS_LABELS,
  queueColumnVisible,
  type QueueColumn,
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
   looking for.

   Everything fits instead, and the mechanism is one absorbing column: automatic
   layout sizes each column to its content, the title cell is `w-full max-w-0` so
   it takes the slack and truncates, and the columns that are context rather than
   content drop out at narrow widths. The full title stays in the `title`
   attribute and in the link.

   A previous attempt used `table-fixed` with a width per column. It does not work:
   the widths summed wider than the column the table sits in, so the title was
   squeezed to nothing, its link became a zero-area click target, and the rest was
   clipped into a pile. Fixed layout needs numbers that fit at every window width,
   and there are none.

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
  /**
   * Shows the pin toggle as a leading column.
   *
   * Off by default, so the reporter's listing is unchanged — a pin is an agent's
   * bookmark on their own queue, and `MITSTicket.pinned` is only computed by
   * `searchTickets` anyway.
   */
  showPin = false,
  /**
   * Draws the card's outline in the accent colour instead of the hairline.
   *
   * For the pinned block above the queue. A prop rather than a wrapper with its
   * own border: two borders twelve pixels apart read as a render error, which is
   * the same reason the composer lost its own outline inside `TicketFrame`.
   */
  accent = false,
  /**
   * Welches Statusvokabular die Zeilen tragen.
   *
   * Der Desk und der Melder lesen dieselbe Spalte und brauchen zwei
   * verschiedene Wörter: „Wartet auf Anwender" sagt einem Agenten, dass das
   * Ticket nicht seine Baustelle ist, und dem Melder gar nichts — obwohl es ihn
   * betrifft und er der Grund ist.
   *
   * Standard ist die Melderansicht, wie bei jedem anderen Schalter hier
   * (`showOwner`, `showPin`, `detailBase`): die Agentenseite setzt ihre Props
   * ohnehin alle ausdrücklich, die Melderseite bekommt die schmale Variante
   * geschenkt.
   */
  customerLabels = true,
  /**
   * Spalten, die dieser Leser ausgeblendet hat.
   *
   * **Verengt, schaltet nicht ein.** `showOwner`, `showTime`, `showPin` und
   * `locations` entscheiden weiter, ob eine Spalte überhaupt angeboten wird — das
   * hängt an Modulen und daran, ob es Standorte gibt. Diese Liste nimmt aus dem
   * Angebot etwas weg. Dieselbe Form wie „Sichtbarkeit verengt die Rolle": ein
   * Agent kann sich nichts einschalten, was die Instanz nicht hat.
   *
   * Leer für die Melderliste, die ihren festen schmalen Satz behält.
   */
  hiddenColumns = [],
  /**
   * Zeigt den geteilten Marker „der Melder hat nachgelegt".
   *
   * Aus wie jeder andere Schalter hier: der Auslieferungszustand ist die
   * Melderansicht, die Queue schaltet ihn ein. Ein Melder braucht ihn nicht —
   * dass er geschrieben und noch keine Antwort hat, weiß er.
   */
  showAwaitingReply = false,
}: {
  tickets: MITSTicket[];
  showOwner?: boolean;
  locations?: MITSLocation[];
  detailBase?: string;
  sort?: TicketSort;
  sortBasePath?: string;
  searchParams?: Record<string, string | string[] | undefined>;
  showTime?: boolean;
  showPin?: boolean;
  accent?: boolean;
  customerLabels?: boolean;
  hiddenColumns?: QueueColumn[];
  showAwaitingReply?: boolean;
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

  /*
   * Das Angebot **und** die Wahl, in dieser Reihenfolge.
   *
   * `showLocation` fragt, ob es überhaupt Standorte gibt; `on("location")` fragt,
   * ob dieser Leser sie sehen will. Beides muss stimmen — die Wahl kann nichts
   * einschalten, was die Instanz nicht anbietet.
   */
  const on = (column: QueueColumn) => queueColumnVisible(hiddenColumns, column);

  const showLocation =
    locations !== undefined && locations.length > 0 && on("location");
  const withPin = showPin && on("pin");
  const withReporter = showOwner && on("reporter");
  const withAssignee = showOwner && on("owner");
  const withPriority = on("priority");
  const withStatus = on("status");
  const withTime = showTime && on("time");
  const withAge = on("age");

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
    <div
      className={cn(
        "rounded-2xl border bg-card shadow-elev-1",
        accent ? "border-primary/30" : "border-border",
      )}
    >
      {/*
        Automatic layout, **not** `table-fixed`.

        `table-fixed` with a declared width per column was the first attempt and it
        broke the page: the widths summed to about 1070 px while the queue's main
        column is roughly 930 px next to the sidebar, so the one column without a
        declared width — the title — was squeezed to zero. Its link became a click
        target with no area, and `overflow-hidden` quietly clipped the rest into a
        pile.

        Automatic layout sizes each column to its content and gives the rest to the
        title cell, which is marked `w-full max-w-0 min-w-48` below so it absorbs
        the slack and truncates instead of growing.

        **Der Container scrollt seitwärts, wenn es trotzdem nicht reicht**, und das
        kehrt eine frühere Regel um („Ticket-Tabellen scrollen nie seitwärts").
        Grund: der Spaltensatz gehört jetzt dem Agenten. Wer Standort, Melder,
        Bearbeiter und Zeit gleichzeitig anschaltet, hat die Breite verlangt — und
        die Alternative zum Scrollen ist ein Titel ohne Klickfläche, was schon
        einmal als „man kann Tickets nicht mehr öffnen" gemeldet wurde. Ein
        Scrollbalken, den man selten sieht, ist die bessere der zwei schlechten
        Antworten.

        Bei den Breakpoints ändert das nichts: `hidden … table-cell` nimmt die
        Kontextspalten auf schmalen Schirmen weiter heraus, bevor es überhaupt so
        weit kommt.
      */}
      <Table containerClassName="overflow-x-auto">
        <TableHeader>
          <TableRow>
            {/*
              `w-px` on every column except the title, and it is not a width.

              In automatic layout `width: 1px` reads as "as narrow as you can make
              this", so the column shrinks to its content and refuses to grow. The
              title then gets every remaining pixel.

              Without it the title truncated early **while free space sat beside
              it**: a `max-width: 0` column cannot absorb leftover space, so the
              browser handed the slack to the neighbours instead and padded them
              out around a clipped title. The `max-w-0` is what makes the title
              truncate rather than widen the table; `w-px` on the others is what
              makes the leftover reach it at all.

              Not `table-fixed` with declared widths — that was the first attempt
              and it broke the page; see the note above the table.

              `hidden … table-cell` drops the context columns on narrow screens
              rather than shrinking them into unreadability. What survives at every
              width is number, title, status and age: enough to find a ticket and
              know whether it needs attention.
            */}
            {/*
              The pin column has no heading text, only a screen-reader one: a word
              above a column of toggles would be the widest thing in it and would
              take that width out of the title. It is also not sortable — the
              pinned rows have their own block above the table, so a sort on
              "pinned" would be a second way to do the same thing.
            */}
            {withPin && (
              <TableHead className="w-px">
                <span className="sr-only">Anheften</span>
              </TableHead>
            )}
            {header("number", "w-px whitespace-nowrap")}
            {header("title", "w-full")}
            {showLocation && (
              <TableHead className="hidden w-px whitespace-nowrap lg:table-cell">
                Standort
              </TableHead>
            )}
            {withReporter && header("reporter", "hidden w-px whitespace-nowrap xl:table-cell")}
            {withAssignee && header("owner", "hidden w-px whitespace-nowrap lg:table-cell")}
            {withPriority && header("priority", "hidden w-px whitespace-nowrap sm:table-cell")}
            {withStatus && header("status", "w-px whitespace-nowrap")}
            {withTime && (
              <TableHead className="hidden w-px text-right whitespace-nowrap xl:table-cell">
                Zeit
              </TableHead>
            )}
            {withAge && header("age", "w-px whitespace-nowrap")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => {
            const location = ticket.location_id
              ? byId.get(ticket.location_id)
              : undefined;

            return (
              /*
                `data-ticket-row` and `data-ticket-href` are what the j/k cursor
                walks. Attributes rather than a callback: this stays a Server
                Component, so the relative ages are computed once at render
                instead of after hydration — and making it a client component to
                draw one outline would move fifty rows of formatting into the
                browser to move a border.
              */
              <TableRow
                key={ticket.id}
                data-ticket-row=""
                data-ticket-href={`${detailBase}/${ticket.id}`}
              >
                {withPin && (
                  <TableCell className="w-px pr-0">
                    <PinButton ticketId={ticket.id} pinned={ticket.pinned} />
                  </TableCell>
                )}
                <TableCell
                  className={cn(
                    "w-px font-mono text-xs whitespace-nowrap text-muted-foreground",
                    // The unread dot rides on the number cell so it sits in a fixed
                    // column instead of shifting with the title's length.
                    ticket.unread && "text-foreground",
                  )}
                >
                  {/*
                    The number opens the ticket too.

                    It was the only plain-text ticket number left in the
                    application — every other list (the agent inbox, the search
                    results, the reminder widget, the objects on a CI, the
                    reporter's rail) wraps its whole row in one link, so the number
                    there has always been clickable. In this table only the title
                    was, and the number is what people read first and point at.

                    `tabIndex={-1}` keeps it out of the tab order. It is the same
                    destination as the link directly after it, and two stops per row
                    is a hundred presses to walk fifty tickets — the keyboard path
                    here is `j`/`k` plus Enter anyway. It stays in the
                    accessibility tree: not focusable is not the same as hidden, and
                    the number is the thing somebody reads a row by.
                  */}
                  <Link
                    href={`${detailBase}/${ticket.id}`}
                    tabIndex={-1}
                    // Underline on hover like the title, not a background change:
                    // this is an inline run of text inside a cell, and a filled
                    // hover rectangle around eighteen mono characters reads as a
                    // badge that has come loose.
                    className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        ticket.unread ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    {formatTicketNumber(ticket.ticket_number)}
                    {/*
                      Zweiter Marker, und er hat mit dem Punkt daneben nichts zu
                      tun: der Punkt ist **persönlich** („habe ich das gesehen"),
                      dieser ist **geteilt** („wartet ein Kunde auf uns"). Zwei
                      Agenten sehen den Punkt verschieden und den Pfeil gleich.

                      Eine andere **Form**, nicht eine zweite Farbe. Zwei Punkte in
                      verschiedenen Tönen wären eine Legende, die niemand hat, und
                      Farbe ist das eine Signal, das ein rot-grün-blinder Leser
                      verliert — dieselbe Begründung, aus der der Titel bei
                      Ungelesenem *auch* fetter wird und nicht nur farbig.

                      `bg-warning` als Ton, weil `open-tickets-panel` ihn schon für
                      „der Melder ist am Zug" benutzt.

                      Reitet auf derselben Zelle wie der Punkt, aus demselben Grund:
                      eine feste Spalte, die nicht mit der Titellänge wandert.
                    */}
                    {showAwaitingReply && ticket.awaiting_reply && (
                      <>
                        <ReplyIcon
                          className="size-3.5 shrink-0 text-warning"
                          strokeWidth={2}
                          aria-hidden
                        />
                        {/* Ein Symbol allein ist eine Legende. */}
                        <span className="sr-only">
                          Der Melder hat nachgeschrieben
                        </span>
                      </>
                    )}
                  </Link>
                </TableCell>
                {/*
                  `w-full max-w-0` is what makes automatic layout truncate instead
                  of grow: the cell asks for all the remaining width and is then
                  told its maximum is zero, so the browser hands it the slack and
                  clips the content rather than widening the table. The link stays
                  a full-width block, which is the row-height click target.
                */}
                <TableCell
                  className={cn(
                    // `min-w-48` neben `max-w-0`, und das ist kein Widerspruch.
                    //
                    // `max-w-0` ist, was die Zelle kürzen statt wachsen lässt;
                    // `min-w` ist der Boden darunter. Ohne ihn konnte der Titel bei
                    // vielen eingeschalteten Spalten auf null schrumpfen — ein
                    // Klickziel ohne Fläche, genau der Defekt, den `table-fixed`
                    // damals verursacht hat („man kann Tickets nicht mehr
                    // öffnen"). Reicht die Breite dann nicht, scrollt der Container
                    // seitwärts; das ist die schlechtere Antwort von zwei
                    // schlechten, aber die einzige, die den Link erreichbar lässt.
                    "w-full max-w-0 min-w-48 truncate font-medium",
                    // Weight *and* the dot, not an accent hue alone: colour is the
                    // one signal a red-green colour blind reader loses, and "which
                    // of these is new" is the entire point of the row.
                    ticket.unread && "font-semibold",
                  )}
                >
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
                  <TableCell className="hidden w-px text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
                    {/* A ticket can outlive its branch — see lib/locations.ts. */}
                    <span className="block max-w-24 truncate">
                      {location?.code || location?.name || "—"}
                    </span>
                  </TableCell>
                )}
                {withReporter && (
                  <TableCell className="hidden w-px text-xs xl:table-cell">
                    {/*
                      Capped on an inner span, not on the cell: in automatic layout
                      a `max-width` on a `<td>` is advisory, and a long address
                      would still widen the column — taking the space back out of
                      the title.
                    */}
                    <span
                      className="block max-w-[200px] truncate"
                      title={ticket.created_by_email}
                    >
                      {ticket.created_by_email}
                    </span>
                  </TableCell>
                )}
                {withAssignee && (
                  <TableCell className="hidden w-px text-xs lg:table-cell">
                    <span className="block max-w-32 truncate">
                      {ticket.assigned_to_name ?? (
                        <span className="text-muted-foreground">
                          Nicht zugewiesen
                        </span>
                      )}
                    </span>
                  </TableCell>
                )}
                {withPriority && (
                  <TableCell className="hidden w-px whitespace-nowrap sm:table-cell">
                    <Badge
                      variant={
                        isElevatedPriority(ticket.priority) ? "default" : "outline"
                      }
                      className="rounded-full"
                    >
                      {TICKET_PRIORITY_LABELS[ticket.priority]}
                    </Badge>
                  </TableCell>
                )}
                {withStatus && (
                  <TableCell className="w-px whitespace-nowrap">
                    <Badge variant="secondary" className="rounded-full">
                      {customerLabels
                        ? CUSTOMER_STATUS[ticket.status].short
                        : TICKET_STATUS_LABELS[ticket.status]}
                    </Badge>
                  </TableCell>
                )}
                {withTime && (
                  <TableCell className="hidden w-px text-right text-xs whitespace-nowrap tabular-nums xl:table-cell">
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
                {withAge && (
                  <TableCell
                    className="w-px text-xs whitespace-nowrap text-muted-foreground"
                    title={formatDateTime(ticket.created_at, timezone)}
                  >
                    {formatRelativeTime(ticket.created_at, now)}
                  </TableCell>
                )}
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
          // No negative margin: the container clips, so a control that pokes
          // outside its cell loses its left edge in the first column.
          "inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
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
