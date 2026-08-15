import { UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TeamBoard } from "@/components/dashboard/team-board";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { QueueLive } from "@/components/tickets/queue-live";
import { Separator } from "@/components/ui/separator";
import { requireArea, requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { collectTeamOverview } from "@/lib/team";
import { getTeamSettings } from "@/lib/team-settings";

export const metadata: Metadata = {
  title: "Team — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Der Desk sieht sich selbst.

   Drei Tore, wie überall im Agentenbereich, und jedes beantwortet eine andere
   Frage: `requireRole` — ist das Personal; `requireArea` — bietet die Instanz
   dieser Rolle die Fläche noch an; das Feature-Flag — gibt es das Modul hier
   überhaupt. Ein abgeschaltetes Modul antwortet `404` und nicht mit einer leeren
   Seite: eine leere Liste ist eine Aussage über den Bestand.

   **`QueueLive` wird wiederverwendet und nicht nachgebaut.** Es hört auf
   dasselbe `queue`-Signal, das jede Zuweisung, jeder Statuswechsel und jeder
   Kommentar ohnehin veröffentlicht, bündelt Bursts in einem 1,5-Sekunden-Fenster
   und fällt bei totem Stream auf den ETag-Poll zurück. Ein zweites Bauteil mit
   derselben Logik wäre eine zweite Stelle, an der das Coalescing falsch
   eingestellt ist.

   Die Folge, ehrlich benannt: **Präsenz allein bewegt nichts.** Der Heartbeat
   veröffentlicht kein Signal, ein Kollege, der sich anmeldet und sonst nichts
   tut, erscheint also erst mit der nächsten Aktualisierung. Dafür ein eigenes
   Signal einzuführen hieße, den Bus im 150-Sekunden-Takt jeder offenen Sitzung
   zu befeuern — für einen Punkt, der die Farbe wechselt.
   ────────────────────────────────────────────────────────────────────────── */

export default async function TeamPage() {
  const viewer = await requireRole("agent", "/mits/team");
  requireArea("mits_team", viewer.role);

  if (!isFeatureEnabled("feature_team_overview")) notFound();

  const settings = getTeamSettings();

  /*
   * Eine Uhr für die ganze Seite. Die vier Abfragen setzen ihre Zeitgrenzen
   * daraus, und die Alter darunter werden dagegen formatiert — mit mehreren
   * `Date.now()` lägen „heute" und „ohne Bewegung" ein paar Millisekunden
   * auseinander, und das ist eine Abweichung, die nur unter Last auftritt.
   */
  const now = Date.now();
  const overview = collectTeamOverview(settings, now);

  const everythingOff = !settings.show_backlog && !settings.show_workload;

  return (
    <>
      <AppHeader />
      <QueueLive />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-7xl">
          <BackLink href="/mits" label="Zurück zur Queue" />
          <div className="mt-4">
            <h1 className="flex items-center gap-3 text-3xl font-normal tracking-tight sm:text-4xl">
              <UsersIcon
                className="size-7 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              Team
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Was liegen bleibt und wer wie viel davon hält. Welche Angaben hier
              stehen, steuert die Administration.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {everythingOff ? (
            <p className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Für diese Instanz ist auf der Team-Übersicht nichts freigegeben.
            </p>
          ) : (
            <TeamBoard overview={overview} settings={settings} now={now} />
          )}

          {/*
            Die Zeitzone steht hier und nicht an jeder Zahl. „Heute" ist der
            laufende UTC-Tag, wie in der Statistik: die Anzeige-Zeitzone ist eine
            Render-Einstellung und greift bei einer Bucket-Grenze absichtlich
            nicht durch.
          */}
          {settings.show_resolved_today && (
            <p className="mt-6 text-xs text-muted-foreground">
              „Heute abgeschlossen" zählt den laufenden Tag in UTC.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
