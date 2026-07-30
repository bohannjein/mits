"use client";

import {
  CheckCircle2Icon,
  InboxIcon,
  Loader2Icon,
  MapPinIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { assignTicketAction } from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketNumber,
  isElevatedPriority,
  type MITSLocation,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Agent inbox.

   Reuses `assignTicketAction` rather than adding a claim action of its own: that
   action already re-reads the session, re-checks the role, refuses a non-staff
   assignee and revalidates the right paths. A second entry point into the same
   mutation would be a second place to get those checks wrong.
   ────────────────────────────────────────────────────────────────────────── */

export function AgentInbox({
  tickets,
  locations,
  currentUserId,
  title,
  /** Shown instead of the list when nothing is waiting. */
  emptyText,
  /** Assigned lists do not need a claim button. */
  claimable = true,
}: {
  tickets: MITSTicket[];
  locations: MITSLocation[];
  currentUserId: string;
  title: string;
  emptyText: string;
  claimable?: boolean;
}) {
  const [result, formAction, pending] = useActionState(assignTicketAction, null);

  const byId = new Map(locations.map((entry) => [entry.id, entry]));

  return (
    <section aria-label={title} className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-industrial">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {tickets.length} {tickets.length === 1 ? "Ticket" : "Tickets"}
        </span>
      </div>

      {result && (
        <Alert
          variant={result.ok ? "default" : "destructive"}
          className="rounded-2xl border-border px-4 py-3"
        >
          {result.ok ? (
            <CheckCircle2Icon strokeWidth={1.5} />
          ) : (
            <TriangleAlertIcon strokeWidth={1.5} />
          )}
          <AlertDescription>
            {result.ok ? result.message : result.error}
          </AlertDescription>
        </Alert>
      )}

      {tickets.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
          <InboxIcon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          {emptyText}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1">
          {tickets.map((ticket) => {
            const location = ticket.location_id
              ? byId.get(ticket.location_id)
              : undefined;
            const urgent =
              isElevatedPriority(ticket.priority);

            return (
              <li
                key={ticket.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <Link
                  href={`/customer/tickets/${ticket.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-3 underline-offset-4 hover:underline"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatTicketNumber(ticket.ticket_number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {ticket.title}
                  </span>
                </Link>

                {location && (
                  <Badge
                    variant="outline"
                    className="h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal"
                  >
                    <MapPinIcon className="size-3" strokeWidth={1.5} />
                    {location.code || location.name}
                  </Badge>
                )}

                <Badge
                  variant={urgent ? "default" : "outline"}
                  className={cn(
                    "h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal",
                    urgent && "border-destructive/40",
                  )}
                >
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </Badge>

                <Badge
                  variant="secondary"
                  className="h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal"
                >
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Badge>

                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {ticket.created_at.toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>

                {claimable && (
                  <form action={formAction} className="shrink-0">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input
                      type="hidden"
                      name="assigneeId"
                      value={currentUserId}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 rounded-full bg-inverse-surface px-3 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                      disabled={pending}
                    >
                      {pending ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <UserPlusIcon strokeWidth={1.5} />
                      )}
                      Übernehmen
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
