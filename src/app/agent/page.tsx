import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboardIcon } from "lucide-react";

import { AgentInbox } from "@/components/dashboard/agent-inbox";
import { PresenceList } from "@/components/dashboard/presence-list";
import { StatsTiles } from "@/components/dashboard/stats-tiles";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { listLocations, ticketCountsByLocation } from "@/lib/locations";
import { listAgentPresence } from "@/lib/presence";
import {
  listAssignedTickets,
  listUnassignedTickets,
  todayCounts,
} from "@/lib/tickets";

export const metadata: Metadata = {
  title: "Agenten-Desk — MITS",
};

export default async function AgentDashboardPage() {
  // Authoritative role gate. The proxy redirects early; this decides.
  const user = await requireRole("technician", "/agent");

  const flags = getFeatureFlags();

  /*
   * A switched-off module has no page, not an empty one. 404 rather than a notice
   * explaining that the dashboard is disabled: the route genuinely does not exist
   * on this instance, and a placeholder would leave an entry in the navigation
   * that goes nowhere useful.
   */
  if (!flags.feature_agent_dashboard) notFound();

  const unassigned = listUnassignedTickets();
  const mine = listAssignedTickets(user.id);
  const locations = listLocations();
  const { opened, closed } = todayCounts();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Agenten-Desk
              </h1>
              <p className="mt-2 text-muted-foreground">
                Was hereinkommt, was du hältst, und wer sonst da ist.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              <Link href="/board">
                <LayoutDashboardIcon strokeWidth={1.5} />
                Alle Tickets
              </Link>
            </Button>
          </div>

          <Separator className="my-8 bg-border" />

          <div className="grid gap-8">
            <AgentInbox
              title="Ticketeingang"
              emptyText="Nichts unzugewiesen — der Eingang ist leer."
              tickets={unassigned}
              locations={locations}
              currentUserId={user.id}
            />

            <AgentInbox
              title="Von dir übernommen"
              emptyText="Du hältst gerade kein Ticket."
              tickets={mine}
              locations={locations}
              currentUserId={user.id}
              claimable={false}
            />

            {flags.feature_stats_heatmap && (
              <StatsTiles
                opened={opened}
                closed={closed}
                locations={locations}
                counts={ticketCountsByLocation()}
                showHeatmap={flags.feature_stats_heatmap}
              />
            )}

            {flags.feature_presence_sidebar && (
              <PresenceList agents={listAgentPresence()} />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
