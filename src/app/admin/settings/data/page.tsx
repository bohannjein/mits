import type { Metadata } from "next";
import { ArchiveIcon, DatabaseIcon, HardDriveIcon, Trash2Icon } from "lucide-react";

import { DataSettingsForm } from "@/components/admin/data-settings-form";
import { PurgeDataDialog } from "@/components/admin/purge-data-dialog";
import { TrashList } from "@/components/admin/trash-list";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import {
  getDataSettings,
  retentionCandidates,
  storageStats,
} from "@/lib/data-settings";
import { formatDate, formatDateTimeShort } from "@/lib/format";
import { purgeCounts } from "@/lib/purge";
import { getSystemTimezone } from "@/lib/system-settings";
import { listDeletedComments, listDeletedTickets } from "@/lib/trash";
import { formatBytes } from "@/types/mits";

export const metadata: Metadata = {
  title: "Daten & Aufbewahrung — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Data management.

   Three things an operator needs and could not see before: how much the instance is
   holding, what the retention policy would do, and where the deleted rows went.

   Timestamps are formatted here rather than in the client components: `formatDate`
   needs the configured zone, which only the server can read, and passing raw Dates into
   a client component would mean calling `Date.now()`-adjacent formatting during
   hydration — the same mismatch the presence list avoids.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AdminDataPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/settings/data");

  const settings = getDataSettings();
  const stats = storageStats();
  // Raw row counts, soft-deleted included — the purge does not care about
  // `deleted_at`, so the dialog must not name a smaller number than it removes.
  const counts = purgeCounts();
  const { count, before } = retentionCandidates(settings);
  const timezone = getSystemTimezone();

  const deletedTickets = listDeletedTickets().map((entry) => ({
    id: entry.ticket.id,
    number: entry.ticket.ticket_number,
    title: entry.ticket.title,
    deletedAt: formatDateTimeShort(entry.deletedAt, timezone),
    comments: entry.comments,
  }));

  const deletedComments = listDeletedComments().map((entry) => ({
    id: entry.id,
    ticketId: entry.ticketId,
    ticketNumber: entry.ticketNumber,
    authorName: entry.authorName,
    preview: entry.preview,
    deletedAt: formatDateTimeShort(entry.deletedAt, timezone),
  }));

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Daten &amp; Aufbewahrung
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Bestand, Grenzen, Aufbewahrungsfrist und Papierkorb.
              </p>
            </div>
            <Badge
              variant="outline"
              className="h-auto rounded-full px-3 py-1 font-normal"
            >
              {formatBytes(stats.databaseBytes + stats.attachments.bytes)} belegt
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

          <section aria-label="Bestand" className="grid gap-3">
            <h2 className="label-industrial">Bestand</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat
                icon={<DatabaseIcon className="size-5" strokeWidth={1.5} aria-hidden />}
                label="Tickets"
                value={String(stats.tickets.alive)}
                note={
                  stats.tickets.deleted > 0
                    ? `${stats.tickets.deleted} im Papierkorb`
                    : "keine gelöschten"
                }
              />
              <Stat
                icon={<ArchiveIcon className="size-5" strokeWidth={1.5} aria-hidden />}
                label="Beiträge"
                value={String(stats.comments.alive)}
                note={
                  stats.comments.deleted > 0
                    ? `${stats.comments.deleted} gelöscht`
                    : "keine gelöschten"
                }
              />
              <Stat
                icon={<HardDriveIcon className="size-5" strokeWidth={1.5} aria-hidden />}
                label="Anhänge"
                value={formatBytes(stats.attachments.bytes)}
                note={`${stats.attachments.alive} Dateien${
                  stats.attachments.deletedBytes > 0
                    ? ` · ${formatBytes(stats.attachments.deletedBytes)} im Papierkorb`
                    : ""
                }`}
              />
              <Stat
                icon={<DatabaseIcon className="size-5" strokeWidth={1.5} aria-hidden />}
                label="Datenbank"
                value={formatBytes(stats.databaseBytes)}
                // The WAL is counted in: it is real disk usage and can outgrow the main
                // file for a while after a busy period.
                note="inklusive Write-Ahead-Log"
              />
            </div>
            {/* Blobs still on disk after a soft delete. Said out loud because "im
                Papierkorb" above could otherwise read as "freed". */}
            {stats.attachments.deletedBytes > 0 && (
              <p className="text-xs text-muted-foreground">
                Gelöschte Anhänge belegen weiter Platz — die Datei bleibt liegen, damit
                eine Wiederherstellung sie noch findet.
              </p>
            )}
          </section>

          <Separator className="my-8 bg-border" />

          <DataSettingsForm
            settings={settings}
            candidates={count}
            cutoff={formatDate(before, timezone)}
          />

          <Separator className="my-8 bg-border" />

          <section aria-label="Papierkorb" className="grid gap-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Trash2Icon
                className="size-5 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              Papierkorb
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Gelöscht heißt in MITS ausgeblendet, nicht entfernt. Ein Ticket bringt
              seine Beiträge und Anhänge beim Wiederherstellen mit; ein einzeln
              gelöschter Beitrag bleibt gelöscht, weil das eine eigene Entscheidung war.
            </p>
            <TrashList tickets={deletedTickets} comments={deletedComments} />
          </section>

          <Separator className="my-8 bg-border" />

          {/*
            Last on the page, and deliberately not beside the retention form: that
            one anonymises and keeps the work record, this one removes rows. Two
            controls that both say "Daten weg" a centimetre apart would invite the
            wrong one.
          */}
          <section aria-label="Bestand löschen" className="grid gap-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Trash2Icon
                className="size-5 text-destructive"
                strokeWidth={1.5}
                aria-hidden
              />
              Bestand löschen
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Entfernt Tickets und CMDB-Daten endgültig — nicht in den Papierkorb.
              Konten, Einstellungen, Formulare, Textbausteine und FAQ-Anhänge bleiben.
              Fragt zum Schluss nach dem Passwort dieses Kontos.
            </p>
            <div>
              <PurgeDataDialog counts={counts} />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <span className="block text-xl font-normal tabular-nums">{value}</span>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}
