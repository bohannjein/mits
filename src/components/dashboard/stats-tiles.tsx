import { InboxIcon, CheckCheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
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
      <h2 className="label-industrial">Heute</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Tile
          icon={<InboxIcon className="size-5" strokeWidth={1.5} aria-hidden />}
          label="Eröffnet"
          value={opened}
          tone="neutral"
        />
        <Tile
          icon={<CheckCheckIcon className="size-5" strokeWidth={1.5} aria-hidden />}
          label="Erledigt"
          value={closed}
          tone="success"
        />
      </div>

      {/* Both counters are computed on the ISO date prefix, which is UTC. Said
          out loud rather than labelled "heute" and quietly meaning something else
          for anyone west of Greenwich. */}
      <p className="text-xs text-muted-foreground">
        Zeitraum ist der laufende UTC-Tag, nicht die lokale Zeitzone.
      </p>

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

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "neutral" | "success";
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1">
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full",
          tone === "success"
            ? "bg-success/15 text-success"
            : "bg-surface-elevated text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div>
        <span className="block text-2xl font-normal tabular-nums">{value}</span>
        <span className="block text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
