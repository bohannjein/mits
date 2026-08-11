import Link from "next/link";
import { ListIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TICKET_STATUS_LABELS,
  formatTicketNumber,
  isOpenStatus,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Die eigenen Tickets, links neben dem Gespräch.

   Der Grund ist eine Geste, die vorher drei Klicks kostete: von einem Ticket zum
   nächsten kam man nur über die Übersicht zurück. Hier ist es ein Klick, und die
   Liste sagt zugleich, was sonst noch offen ist.

   **Eine Server Component.** Die Liste ändert sich nur bei einer Navigation, und
   die relative Zeit gibt es hier nicht — es ist eine Navigationsliste, keine
   Tabelle. Nichts davon braucht den Browser.

   **Kein Suchfeld.** Die Liste ist auf `RAIL_LIMIT` gedeckelt und die Kopfzeile
   trägt schon eine Suche, die jedes Ticket per Nummer findet. Ein zweites
   Eingabefeld in einer 15rem breiten Spalte wäre ein Bedienelement für den Fall,
   den der Knopf darunter schon abdeckt.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Wie viele Zeilen die Spalte trägt.
 *
 * Darüber ist es keine Randspalte mehr, sondern die Übersicht — und die ist einen
 * Klick entfernt. Offene stehen zuerst, also ist der Deckel genau dann spürbar,
 * wenn jemand mehr als dreißig Tickets *gleichzeitig* offen hat.
 */
export const RAIL_LIMIT = 30;

export function CustomerTicketRail({
  tickets,
  activeId,
}: {
  /** Die Tickets dieses Melders, bereits gedeckelt und sortiert. */
  tickets: MITSTicket[];
  activeId: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="label-industrial">Meine Tickets</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {tickets.length}
        </span>
      </div>

      <div className="grid gap-1.5">
        {tickets.map((ticket) => {
          const active = ticket.id === activeId;

          return (
            <Link
              key={ticket.id}
              href={`/customer/tickets/${ticket.id}`}
              aria-current={active ? "page" : undefined}
              /*
               * Der Hintergrund bewegt sich, der Vordergrund bleibt auf vollem
               * Kontrast — die Hover-Regel. Das aktive Ticket trägt eine gefüllte
               * Fläche statt nur einer Rahmenfarbe: in einer Liste aus Kacheln ist
               * ein Rahmen der schwächere von beiden Hinweisen.
               */
              className={cn(
                "grid gap-1 rounded-2xl border px-3 py-2 transition-colors",
                active
                  ? "border-border bg-surface-elevated"
                  : "border-transparent hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatTicketNumber(ticket.ticket_number)}
                </span>
                {/*
                  Geschlossene Tickets tragen den Umriss, offene die gefüllte
                  Fläche. Ohne den Unterschied liest sich eine Liste aus
                  Erledigtem genauso dringend wie eine aus Offenem.
                */}
                <Badge
                  variant={isOpenStatus(ticket.status) ? "secondary" : "outline"}
                  className="h-auto shrink-0 rounded-full px-2 py-0 text-[10px] font-normal"
                >
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
              </span>
              <span
                className="line-clamp-2 text-sm leading-snug"
                title={ticket.title}
              >
                {ticket.title}
              </span>
            </Link>
          );
        })}
      </div>

      {/*
        Immer da, nicht nur wenn der Deckel greift: die Übersicht kann filtern und
        durchsuchen, diese Spalte nicht. Ein Weg dorthin, der nur bei einunddreißig
        Tickets erscheint, ist ein Weg, den niemand findet.
      */}
      <Link
        href="/customer/tickets"
        className="mt-1 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ListIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
        Alle Tickets
      </Link>
    </div>
  );
}
