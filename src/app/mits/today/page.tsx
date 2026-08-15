import { SunriseIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { QueueLive } from "@/components/tickets/queue-live";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { formatRelativeTime } from "@/lib/format";
import { collectToday, TODAY_REASON_LABELS } from "@/lib/today";
import { cn } from "@/lib/utils";
import {
  TICKET_PRIORITY_LABELS,
  formatTicketNumber,
  isElevatedPriority,
} from "@/types/mits";

export const metadata: Metadata = {
  title: "Mein Tag — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Womit fange ich an.

   Die Angaben lagen alle schon da — Queue-Reiter, Pin-Block,
   Erinnerungs-Widget, und seit Neuestem die Abo-Spalte. Keine davon beantwortete
   die Frage, mit der jemand morgens ankommt, weil jede nur ihren eigenen
   Ausschnitt kennt.

   **Kein eigenes Flag.** Die Seite zeigt ausschließlich, was der Leser ohnehin
   sehen darf, in einer anderen Reihenfolge; ein Schalter dafür wäre einer für
   eine Sortierung. Was fehlt, fehlt mit seinem Modul: ohne Erinnerungen keine
   Erinnerungszeilen, ohne Beobachter keine beobachteten.

   **Kein Bereich in `/admin/settings/roles`** aus demselben Grund — und weil
   `requireRole("agent")` die Grenze ist, die zählt.
   ────────────────────────────────────────────────────────────────────────── */

export default async function TodayPage() {
  const user = await requireRole("agent", "/mits/today");

  const now = Date.now();
  const { items, poolTotal } = collectToday(user);

  return (
    <>
      <AppHeader />
      <QueueLive />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/mits" label="Zurück zur Queue" />
          <div className="mt-4">
            <h1 className="flex items-center gap-3 text-3xl font-normal tracking-tight sm:text-4xl">
              <SunriseIcon
                className="size-7 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              Mein Tag
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Fällige Erinnerungen, Kunden, die auf eine Antwort warten, und was
              du im Blick behalten wolltest — in einer Liste, dringendstes zuerst.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {items.length === 0 ? (
            /*
              Die leere Liste ist hier eine gute Nachricht und wird auch so
              formuliert. „Keine Einträge" wäre der Satz, den eine kaputte
              Abfrage produziert.
            */
            <p className="rounded-2xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Nichts liegt an. Keine fällige Erinnerung, kein Kunde, der wartet.
            </p>
          ) : (
            <ul className="grid gap-2">
              {items.map((item) => (
                <li key={item.ticketId}>
                  <Link
                    href={`/mits/tickets/${item.ticketId}`}
                    className="block rounded-2xl border border-border px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          // Nur die Erinnerung sticht heraus: sie ist die
                          // einzige Zeile, die jemand selbst auf heute gelegt
                          // hat. Fünf auffällige Etiketten wären keins.
                          item.reason === "reminder" &&
                            "border-warning/40 text-warning",
                        )}
                      >
                        {TODAY_REASON_LABELS[item.reason]}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatTicketNumber(item.ticketNumber ?? 0)}
                      </span>
                      {isElevatedPriority(item.priority) &&
                        item.reason !== "reminder" && (
                          <Badge variant="default" className="rounded-full">
                            {TICKET_PRIORITY_LABELS[item.priority]}
                          </Badge>
                        )}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(new Date(item.at), now)}
                      </span>
                    </div>

                    <p className="mt-1 truncate font-medium">{item.title}</p>
                    {item.detail && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/*
            Der Pool ist hier ein Angebot und gedeckelt; die vollständige Liste
            hat die Queue. Der Link steht auch dann da, wenn der Deckel nicht
            greift — ein Weg, der erst ab dem sechsten Ticket erscheint, ist
            einer, den niemand findet.
          */}
          {poolTotal > 0 && (
            <p className="mt-6 text-sm text-muted-foreground">
              <Link
                href="/mits?scope=pool&view=inbox"
                className="hover:text-foreground hover:underline"
              >
                {poolTotal} unzugewiesen im Eingang
              </Link>
            </p>
          )}
        </div>
      </main>
    </>
  );
}
