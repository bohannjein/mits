"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarIcon,
  DownloadIcon,
  Loader2Icon,
  RadioIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  CreatorTopics,
  DistributionChart,
  DurationTile,
  PeakHeatmap,
  RankingChart,
  TotalsRow,
  TrendChart,
} from "@/components/charts/analytics-widgets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnalyticsData } from "@/lib/analytics/queries";
import {
  GRANULARITIES,
  GRANULARITY_LABELS,
  TIME_RANGES,
  TIME_RANGE_LABELS,
  type Granularity,
  type TimeRange,
} from "@/lib/analytics/range";
import { cn } from "@/lib/utils";
import {
  ANALYTICS_REFRESH_CHOICES,
  ANALYTICS_REFRESH_LABELS,
  type AnalyticsRefresh,
  type AnalyticsSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The analytics panel.

   A client component that owns the filter state and polls one endpoint. Not a
   server component with a form, unlike every other listing in MITS — and the
   reason is the refresh: an auto-refreshing page would remount every chart on
   each tick, which is exactly the hard jump the animation requirements exist to
   avoid. Keeping the data in TanStack Query means new numbers arrive into the
   *same* chart instances, and recharts tweens between them.

   The filters still travel in the URL through `initial*`, so a range is
   shareable; they are just not what drives the fetch.
   ────────────────────────────────────────────────────────────────────────── */

/** Auto-granularity is the default; `""` means "let the server decide". */
const AUTO = "__auto";

export function AnalyticsPanel({
  settings,
  initialRange,
  initialGranularity,
}: {
  /** Which widgets exist, and the instance's default refresh interval. */
  settings: AnalyticsSettings;
  initialRange: TimeRange;
  initialGranularity?: Granularity;
}) {
  const [range, setRange] = useState<TimeRange>(initialRange);
  const [granularity, setGranularity] = useState<string>(
    initialGranularity ?? AUTO,
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refresh, setRefresh] = useState<AnalyticsRefresh>(
    settings.defaultRefreshSeconds,
  );

  const query = useMemo(() => {
    const params = new URLSearchParams({ range });
    if (granularity !== AUTO) params.set("granularity", granularity);
    if (range === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    return params.toString();
  }, [range, granularity, from, to]);

  const { data, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["analytics", query],
    queryFn: async (): Promise<AnalyticsData> => {
      const response = await fetch(`/api/analytics?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Für diese Auswertung fehlen die Rechte."
            : `Die Daten konnten nicht geladen werden (HTTP ${response.status}).`,
        );
      }
      return (await response.json()) as AnalyticsData;
    },
    refetchInterval: refresh === 0 ? false : refresh * 1000,
    // Off in a hidden tab. A dashboard left open on a second monitor polling
    // every five seconds all night is pure cost.
    refetchIntervalInBackground: false,
    /*
     * The previous range's data stays on screen while the next one loads. Without
     * it every filter change blanks all nine charts and then redraws them, which
     * is the hard jump this panel is built to avoid — with it, recharts morphs.
     */
    placeholderData: (previous) => previous,
    retry: false,
  });

  /*
   * The live badge pulses for a moment after each successful fetch rather than
   * for the whole request. A spinner that is visible the entire time an
   * auto-refresh runs is a permanently spinning page at a five-second interval.
   */
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(timer);
  }, [dataUpdatedAt]);

  const exportHref = `/api/analytics?${query}&format=csv`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <Field label="Zeitraum" htmlFor="range">
          <Select value={range} onValueChange={(value) => setRange(value as TimeRange)}>
            <SelectTrigger id="range" className="h-9 w-44 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((option) => (
                <SelectItem key={option} value={option}>
                  {TIME_RANGE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {range === "custom" && (
          <>
            <Field label="Von" htmlFor="from">
              <Input
                id="from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                className="h-9 w-40 rounded-xl"
              />
            </Field>
            <Field label="Bis" htmlFor="to">
              <Input
                id="to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                className="h-9 w-40 rounded-xl"
              />
            </Field>
          </>
        )}

        <Field label="Auflösung" htmlFor="granularity">
          <Select value={granularity} onValueChange={setGranularity}>
            <SelectTrigger id="granularity" className="h-9 w-36 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Automatic first and default: a manual choice that would blow the
                  bucket ceiling is silently corrected by the server, and picking
                  it deliberately should be the exception. */}
              <SelectItem value={AUTO}>Automatisch</SelectItem>
              {GRANULARITIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {GRANULARITY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Aktualisierung" htmlFor="refresh">
          <Select
            value={String(refresh)}
            onValueChange={(value) => setRefresh(Number(value) as AnalyticsRefresh)}
          >
            <SelectTrigger id="refresh" className="h-9 w-40 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANALYTICS_REFRESH_CHOICES.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {ANALYTICS_REFRESH_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LiveBadge active={refresh > 0} pulse={pulse} />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="h-9 rounded-full px-3 text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {isFetching ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <RefreshCwIcon strokeWidth={1.5} />
            )}
            Neu laden
          </Button>

          {/*
            A plain link, not a fetch-and-blob. The endpoint already answers with
            `Content-Disposition: attachment`, so the browser downloads it — and a
            link works with middle-click, with "save as" and without JavaScript
            having to hold a megabyte in memory.
          */}
          <Button
            asChild
            size="sm"
            className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            <a href={exportHref} download>
              <DownloadIcon strokeWidth={1.5} />
              CSV
            </a>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
          <TriangleAlertIcon strokeWidth={1.5} />
          <AlertDescription>
            {error instanceof Error ? error.message : "Unbekannter Fehler."}
          </AlertDescription>
        </Alert>
      )}

      {!data ? (
        <p className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          {isFetching ? "Zahlen werden geholt …" : "Keine Daten."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CalendarIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
            <span>
              {data.range.label} · {data.range.from.slice(0, 10)} bis{" "}
              {data.range.to.slice(0, 10)} ·{" "}
              {GRANULARITY_LABELS[data.range.granularity]}
            </span>
            {/*
              Said once, here, rather than under every chart: all bucketing is UTC,
              because the timestamps are compared as ISO strings. A reader in
              Berlin comparing a nine o'clock peak to their own morning deserves to
              know which nine o'clock this is.
            */}
            <span>· alle Zeiten in UTC</span>
          </div>

          <TotalsRow totals={data.totals} />

          {settings.inflowVsResolved && (
            <TrendChart series={data.series} granularity={data.range.granularity} />
          )}

          {(settings.resolutionTime || settings.firstResponse) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {settings.resolutionTime && (
                <DurationTile
                  title="Durchschnittliche Lösungszeit"
                  hint="Von der Erstellung bis zum ersten Abschluss. Nur Tickets, deren Abschluss in der Historie steht."
                  stat={data.resolutionTime}
                />
              )}
              {settings.firstResponse && (
                <DurationTile
                  title="Erstreaktionszeit"
                  hint="Bis zur ersten öffentlichen Antwort eines Agenten. Interne Notizen zählen nicht."
                  stat={data.firstResponse}
                />
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {settings.topCreators && (
              <RankingChart
                title="Top Ticket-Ersteller"
                hint="Wer im Zeitraum die meisten Tickets aufgegeben hat."
                rows={data.topCreators}
                color={0}
              />
            )}
            {settings.resolvedPerAgent && (
              <RankingChart
                title="Gelöst pro Agent"
                hint="Zugeordnet nach der Person, die abgeschlossen hat."
                rows={data.resolvedPerAgent}
                color={1}
              />
            )}
          </div>

          {settings.creatorTopics && <CreatorTopics entries={data.creatorTopics} />}
          {settings.peakHeatmap && <PeakHeatmap grid={data.heatmap} />}
          {settings.distribution && (
            <DistributionChart distribution={data.distribution} />
          )}
        </>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * The live indicator.
 *
 * Two states, not three: either a refresh timer is running or it is not. The glow
 * is a CSS transition rather than a keyframe loop — a permanently pulsing badge
 * is an animation nobody asked for on a page somebody is reading numbers from,
 * and it would keep the compositor busy for the whole session.
 */
function LiveBadge({ active, pulse }: { active: boolean; pulse: boolean }) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all duration-500",
        active
          ? "border-success/40 text-success"
          : "border-border text-muted-foreground",
        pulse && "border-success bg-success/10 shadow-glow",
      )}
    >
      <RadioIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
      {active ? "Live" : "Manuell"}
    </span>
  );
}
