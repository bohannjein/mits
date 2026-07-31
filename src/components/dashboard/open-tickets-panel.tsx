"use client";

import { useQuery } from "@tanstack/react-query";
import { InboxIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/components/providers/auto-refresh";
import { useTimezone } from "@/components/providers/timezone-provider";
import {
  MITSTicketSchema,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketNumber,
  isElevatedPriority,
  isOpenStatus,
  type MITSTicket,
  type TicketStatus,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   "My open tickets" on the portal.

   Server-rendered first, then kept current by TanStack Query — the first paint
   already has rows, so there is no loading skeleton, and `initialData` doubles as
   the fallback if the poll ever fails.

   `?scope=own` matters: for a technician or admin the unscoped listing is the
   whole board, and this panel is explicitly *their* tickets.
   ────────────────────────────────────────────────────────────────────────── */

const ResponseSchema = z.object({ tickets: z.array(MITSTicketSchema) });

/** Derived from tokens, so both themes and the light variant follow along. */
const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "bg-chart-2/15 text-chart-2",
  in_progress: "bg-warning/15 text-warning",
  waiting_user: "bg-chart-5/15 text-chart-5",
  resolved: "bg-success/15 text-success",
  closed: "bg-muted text-muted-foreground",
};

async function fetchOwnTickets(): Promise<MITSTicket[]> {
  const response = await fetch("/api/tickets?scope=own", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Tickets konnten nicht geladen werden (HTTP ${response.status}).`);
  }

  // Parsed rather than cast: `created_at` arrives as an ISO string and the schema
  // coerces it to a Date, so the type matches the server-rendered initialData.
  return ResponseSchema.parse(await response.json()).tickets;
}

export function OpenTicketsPanel({
  initialTickets,
  /** Overridden by the portal's widget_titles. */
  title = "Meine offenen Tickets",
}: {
  initialTickets: MITSTicket[];
  title?: string;
}) {
  const timezone = useTimezone();
  const { minutes } = useAutoRefresh();

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["tickets", "own"],
    queryFn: fetchOwnTickets,
    initialData: initialTickets,
    /*
     * Follows the header's refresh setting instead of keeping a schedule of its own.
     *
     * This used to poll every 30 seconds, which was already the most frequent
     * request in the app and would now run *alongside* the page refresh — two
     * schedules asking SQLite for the same rows. One setting governs both, and "Aus"
     * means off here too rather than silently continuing to poll.
     *
     * `refetchIntervalInBackground` stays at its default of false, so a hidden tab
     * does not poll, matching the page refresher.
     */
    refetchInterval: minutes === 0 ? false : minutes * 60_000,
    refetchOnWindowFocus: true,
  });

  const open = data.filter((ticket) => isOpenStatus(ticket.status)).slice(0, 6);

  return (
    <section aria-label={title} className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-industrial">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-muted-foreground"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCwIcon
              className={cn("size-3.5", isFetching && "animate-spin")}
              strokeWidth={1.5}
            />
            Aktualisieren
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-muted-foreground"
          >
            <Link href="/customer/tickets">Alle</Link>
          </Button>
        </div>
      </div>

      {open.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
          <InboxIcon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          Keine offenen Tickets. Alles erledigt.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1">
          {open.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/customer/tickets/${ticket.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-elevated"
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTicketNumber(ticket.ticket_number)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {ticket.title}
                </span>
                {(isElevatedPriority(ticket.priority)) && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-destructive/40 text-destructive"
                  >
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                )}
                <Badge
                  className={cn("rounded-full", STATUS_STYLES[ticket.status])}
                >
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {ticket.created_at.toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    timeZone: timezone,
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
