import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authEventLabel, countAuthEvents, listAuthEvents } from "@/lib/auth-log";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { getSystemTimezone } from "@/lib/system-settings";

export const metadata: Metadata = {
  title: "Zugriffsprotokoll — MITS",
};

const SHOWN = 200;

/* ──────────────────────────────────────────────────────────────────────────
   Zugriffsprotokoll.

   Anmeldungen und Eingriffe an Konten, neueste zuerst. Eine Server Component
   ohne Filter und ohne Blättern: die Frage an ein solches Protokoll ist fast
   immer „was ist in letzter Zeit passiert", und die letzten zweihundert Zeilen
   beantworten sie besser als eine Maske mit vier Auswahlfeldern darüber.

   Nur lesbar, nirgends löschbar — es gibt in `lib/auth-log.ts` kein `DELETE`.
   Ein Protokoll, das der Protokollierte aufräumen kann, ist keines.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AdminSecurityPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/security");

  const events = listAuthEvents(SHOWN);
  const total = countAuthEvents();
  const timeZone = getSystemTimezone();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Zugriffsprotokoll
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Anmeldungen und Eingriffe an Konten. Gescheiterte Anmeldeversuche
                stehen nicht darin.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {total} Einträge
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

          {events.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
              Noch nichts protokolliert.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-elev-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeitpunkt</TableHead>
                    <TableHead>Vorgang</TableHead>
                    <TableHead>Konto</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(new Date(event.createdAt), timeZone)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {authEventLabel(event.action)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {event.actorEmail || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {event.detail || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {total > events.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              Die jüngsten {SHOWN} von {total} Einträgen.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
