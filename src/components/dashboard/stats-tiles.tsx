import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

import { OpenClosedPie } from "@/components/dashboard/open-closed-pie";
import type { MITSLocation } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Counters and the branch heatmap.

   A server component — plain aggregates, nothing to hydrate.

   The heatmap is a bar per site rather than a colour ramp. With a handful of
   branches a ramp encodes one number in a hue nobody can read back; a bar can be
   compared at a glance and stays legible for someone who cannot distinguish the
   ramp's ends.
   ────────────────────────────────────────────────────────────────────────── */

export function StatsTiles({
  opened,
  closed,
  locations,
  counts,
  showHeatmap,
}: {
  opened: number;
  closed: number;
  locations: MITSLocation[];
  /** Ticket count keyed by location id. */
  counts: Record<string, number>;
  showHeatmap: boolean;
}) {
  const ranked = locations
    .map((location) => ({ location, count: counts[location.id] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  const max = ranked[0]?.count ?? 0;

  return (
    <section aria-label="Kennzahlen" className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-industrial">Heute</h2>

        {/*
          The way into the statistics panel, next to the figures it expands on
          rather than as a pill in the queue's header row.

          It sat up there beside the CMDB button and read as its equal, which it
          is not: the CMDB is a place agents work, the statistics are a place they
          look occasionally. Two controls of the same size and weight say the two
          things matter the same amount, and this one does not.
        */}
        <Link
          href="/mits/analytics"
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Statistiken
          <ArrowUpRightIcon className="size-3" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>

      {/* Both figures live in the pie's legend, so the counter tiles that used to
          sit here said the same thing a second time. */}
      <OpenClosedPie opened={opened} closed={closed} />

      {showHeatmap && ranked.length > 0 && (
        <div className="mt-2 grid gap-3">
          <h2 className="label-industrial">Verteilung über die Standorte</h2>
          <ul className="grid gap-2 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1">
            {ranked.map(({ location, count }) => (
              <li key={location.id} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {location.code ? `${location.code} — ` : ""}
                    {location.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{count}</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
                  role="img"
                  aria-label={`${location.name}: ${count} Tickets`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
