import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MITSTicket, TicketPriority, TicketStatus } from "@/types/mits";

/* Shared listing for "my tickets" and the technician board. `showOwner` is the
   only difference: a plain user never sees a foreign address, because their
   listing only ever contains their own tickets anyway. */

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  closed: "Geschlossen",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
};

export function TicketTable({
  tickets,
  showOwner = false,
}: {
  tickets: MITSTicket[];
  showOwner?: boolean;
}) {
  if (tickets.length === 0) {
    return (
      <p className="rounded-sm border-2 border-border p-6 text-sm text-muted-foreground">
        Noch keine Tickets erfasst.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-sm border-2 border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Titel</TableHead>
            <TableHead>Typ</TableHead>
            {showOwner && <TableHead>Melder</TableHead>}
            <TableHead>Priorität</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Erstellt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell className="font-medium">{ticket.title}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {ticket.form_schema_id ?? ticket.source}
              </TableCell>
              {showOwner && (
                <TableCell className="text-xs">{ticket.created_by_email}</TableCell>
              )}
              <TableCell>
                <Badge
                  variant={
                    ticket.priority === "urgent" || ticket.priority === "high"
                      ? "default"
                      : "outline"
                  }
                  className="rounded-sm font-mono"
                >
                  {PRIORITY_LABELS[ticket.priority]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="rounded-sm font-mono">
                  {STATUS_LABELS[ticket.status]}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {ticket.created_at.toLocaleString("de-DE", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
