import type { Metadata } from "next";
import { BarChart3Icon } from "lucide-react";

import { AnalyticsPanel } from "@/components/charts/analytics-panel";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Separator } from "@/components/ui/separator";
import { getAnalyticsSettings } from "@/lib/analytics/settings";
import {
  isGranularity,
  isTimeRange,
  type Granularity,
  type TimeRange,
} from "@/lib/analytics/range";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Statistiken — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Statistics, for whoever is interested.

   **Agent-gated, and that is the load-bearing part of this file.** The panel
   names who filed how many tickets and how quickly each agent closes them.
   `requireRole("agent")` sends a reporter to their own portal — `deniedPathFor`
   maps everything under `/mits` to `/customer`, so they land somewhere useful
   rather than on a permission error they can do nothing about.

   The guard is here *and* on `/api/analytics`. Hiding the page would leave the
   endpoint open, and the endpoint is where the numbers actually are. The
   navigation link is gated too — a reporter is shown no route into `/mits` at
   all, which is the rule the user menu already enforces.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; granularity?: string }>;
}) {
  await requireRole("agent", "/mits/analytics");

  const params = await searchParams;
  const settings = getAnalyticsSettings();

  /*
   * Validated against the enums rather than cast. The values only seed the
   * panel's own state — the fetch is driven from there — but an unknown `?range=`
   * would otherwise put a value into a Radix Select that has no matching item,
   * and the control would render blank.
   */
  const initialRange: TimeRange = isTimeRange(params.range)
    ? params.range
    : "30d";
  const initialGranularity: Granularity | undefined = isGranularity(
    params.granularity,
  )
    ? params.granularity
    : undefined;

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-7xl">
          <BackLink href="/mits" label="Zurück zur Queue" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-normal tracking-tight sm:text-4xl">
                <BarChart3Icon
                  className="size-7 text-muted-foreground"
                  strokeWidth={1.5}
                  aria-hidden
                />
                Statistiken
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Auslastung, Bearbeitungszeiten und wer womit kommt. Welche Kacheln
                erscheinen, steuert die Administration.
              </p>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <AnalyticsPanel
            settings={settings}
            initialRange={initialRange}
            initialGranularity={initialGranularity}
          />
        </div>
      </main>
    </>
  );
}
