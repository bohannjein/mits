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

// `QueueLive` wiederverwendet statt nachgebaut. Folge: Präsenz allein bewegt
// nichts — der Heartbeat veröffentlicht kein Signal.

export default async function TeamPage() {
  const viewer = await requireRole("agent", "/mits/team");
  requireArea("mits_team", viewer.role);

  if (!isFeatureEnabled("feature_team_overview")) notFound();

  const settings = getTeamSettings();

  // Eine Uhr für Abfragen und Anzeige.
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
          </div>

          <Separator className="my-8 bg-border" />

          {everythingOff ? (
            <p className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Für diese Instanz ist auf der Team-Übersicht nichts freigegeben.
            </p>
          ) : (
            <TeamBoard overview={overview} settings={settings} now={now} />
          )}

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
