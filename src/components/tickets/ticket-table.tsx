import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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

/* Shared listing for "my tickets" and the technician board. `showOwner` is the
   only difference: a plain user never sees a foreign address, because their
   listing only ever contains their own tickets anyway.

   The labels come from types/mits.ts rather than living here, so a new status
   cannot render as a blank cell in one table and a label in another. */

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
}: {
  tickets: MITSTicket[];
  showOwner?: boolean;
  locations?: MITSLocation[];
  detailBase?: string;
}) {
  if (tickets.length === 0) {
    return (
      <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
        Noch keine Tickets erfasst.
      </p>
    );
  }

  const byId = new Map((locations ?? []).map((entry) => [entry.id, entry]));
  const showLocation = locations !== undefined && locations.length > 0;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-elev-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nr.</TableHead>
            <TableHead>Titel</TableHead>
            {showLocation && <TableHead>Standort</TableHead>}
            {showOwner && <TableHead>Melder</TableHead>}
            <TableHead>Priorität</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Erstellt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => {
            const location = ticket.location_id
              ? byId.get(ticket.location_id)
              : undefined;

            return (
              <TableRow key={ticket.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {formatTicketNumber(ticket.ticket_number)}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`${detailBase}/${ticket.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {ticket.title}
                  </Link>
                </TableCell>
                {showLocation && (
                  <TableCell className="text-xs text-muted-foreground">
                    {/* A ticket can outlive its branch — see lib/locations.ts. */}
                    {location?.code || location?.name || "—"}
                  </TableCell>
                )}
                {showOwner && (
                  <TableCell className="text-xs">
                    {ticket.created_by_email}
                  </TableCell>
                )}
                <TableCell>
                  <Badge
                    variant={
                      isElevatedPriority(ticket.priority)
                        ? "default"
                        : "outline"
                    }
                    className="rounded-full"
                  >
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="rounded-full">
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {ticket.created_at.toLocaleString("de-DE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
