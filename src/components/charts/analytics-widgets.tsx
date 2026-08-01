"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ANIMATION,
  AXIS,
  ChartCard,
  ChartTooltip,
  GRID_STROKE,
  formatDuration,
  seriesColor,
} from "@/components/charts/chart-kit";
import { bucketLabel, type Granularity } from "@/lib/analytics/range";
import type { AnalyticsData, NamedCount } from "@/lib/analytics/queries";

/* ──────────────────────────────────────────────────────────────────────────
   The individual widgets.

   Split out of the panel so each is one readable thing, and so the panel is a
   list of switches rather than nine hundred lines of JSX.

   Every chart passes `{...ANIMATION}`. That is what makes an auto-refresh a morph
   instead of a jump — but only because the series generators emit *every* bucket
   including the empty ones. Recharts can tween between two arrays of the same
   shape; given arrays whose length changes, it can only redraw.
   ────────────────────────────────────────────────────────────────────────── */

/** Height of a bar chart per row, so a ranking of two is not a wall of white. */
const ROW_HEIGHT = 34;
const MIN_HEIGHT = 140;

const barHeight = (rows: number): number =>
  Math.max(MIN_HEIGHT, rows * ROW_HEIGHT + 24);

/**
 * A horizontal ranking.
 *
 * Horizontal, not vertical: the labels are people's names and form titles, and a
 * vertical bar chart turns those into rotated text nobody reads.
 */
export function RankingChart({
  title,
  hint,
  rows,
  color = 0,
}: {
  title: string;
  hint?: string;
  rows: NamedCount[];
  color?: number;
}) {
  return (
    <ChartCard title={title} hint={hint} empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height={barHeight(rows.length)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            // Truncated here rather than by CSS: an SVG text node does not
            // ellipsize, it just runs into the chart.
            tickFormatter={(value: string) =>
              value.length > 20 ? `${value.slice(0, 19)}…` : value
            }
            {...AXIS}
          />
          <Tooltip
            content={<ChartTooltip />}
            // The default is a grey rectangle with no theme awareness; `--accent`
            // is the same surface every other hover in MITS uses.
            cursor={{ fill: "var(--accent)", fillOpacity: 0.5 }}
          />
          <Bar
            dataKey="value"
            name="Tickets"
            fill={seriesColor(color)}
            radius={[0, 6, 6, 0]}
            {...ANIMATION}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Inflow against throughput. Two lines, because the gap is the message. */
export function TrendChart({
  series,
  granularity,
}: {
  series: AnalyticsData["series"];
  granularity: Granularity;
}) {
  const data = series.map((point) => ({
    ...point,
    label: bucketLabel(point.bucket, granularity),
  }));

  return (
    <ChartCard
      title="Eingang gegen Erledigt"
      hint="Läuft die untere Linie dauerhaft unter der oberen, wächst der Rückstand."
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="label"
            // Recharts drops ticks that would collide; letting it decide beats a
            // hand-tuned interval that is wrong at every other window width.
            interval="preserveStartEnd"
            minTickGap={24}
            {...AXIS}
          />
          <YAxis allowDecimals={false} width={44} {...AXIS} />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="created"
            name="Eingegangen"
            stroke={seriesColor(0)}
            strokeWidth={2}
            // No dots on a long series: four hundred circles is a texture, not a
            // set of points. They come back on hover through the tooltip cursor.
            dot={data.length <= 30}
            activeDot={{ r: 4 }}
            {...ANIMATION}
          />
          <Line
            type="monotone"
            dataKey="resolved"
            name="Erledigt"
            stroke={seriesColor(1)}
            strokeWidth={2}
            dot={data.length <= 30}
            activeDot={{ r: 4 }}
            {...ANIMATION}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Weekday against hour.
 *
 * A CSS grid of divs rather than a recharts chart. Recharts has no heatmap, and
 * building one out of a scatter with square shapes fights the library for a
 * result that is worse than 168 styled cells — which also get real tooltips,
 * keyboard focus and a colour scale that follows the theme.
 *
 * The scale is relative to the busiest cell, not absolute. An instance with
 * twelve tickets a week and one with twelve thousand both want to see *where*
 * their peak is; a fixed scale would render the first one uniformly empty.
 */
export function PeakHeatmap({ grid }: { grid: number[][] }) {
  const peak = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((sum, value) => sum + value, 0);

  const level = (value: number): string => {
    if (value === 0) return "var(--heat-0)";
    const share = value / peak;
    if (share <= 0.25) return "var(--heat-1)";
    if (share <= 0.5) return "var(--heat-2)";
    if (share <= 0.75) return "var(--heat-3)";
    return "var(--heat-4)";
  };

  return (
    <ChartCard
      title="Peak-Zeiten"
      hint="Wochentag gegen Uhrzeit, in UTC. Die Skala ist relativ zur vollsten Stunde."
      empty={total === 0}
    >
      <div className="overflow-x-auto">
        <div className="min-w-[34rem]">
          {/* Hour ruler. Every third label, because 24 labels in that width
              overlap and a ruler nobody can read is decoration. */}
          <div className="mb-1 grid grid-cols-[2rem_repeat(24,1fr)] gap-0.5">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span
                key={hour}
                className="text-center text-[9px] text-muted-foreground tabular-nums"
              >
                {hour % 3 === 0 ? hour : ""}
              </span>
            ))}
          </div>

          {grid.map((day, index) => (
            <div
              key={index}
              className="mb-0.5 grid grid-cols-[2rem_repeat(24,1fr)] items-center gap-0.5"
            >
              <span className="text-[10px] text-muted-foreground">
                {WEEKDAYS[index]}
              </span>
              {day.map((value, hour) => (
                <div
                  key={hour}
                  // `title` rather than a custom tooltip: 168 cells with a React
                  // tooltip each is 168 event handlers for one number.
                  title={`${WEEKDAYS[index]} ${String(hour).padStart(2, "0")}:00 — ${value} Ticket(s)`}
                  className="aspect-square rounded-[3px] transition-colors"
                  style={{ background: level(value) }}
                />
              ))}
            </div>
          ))}

          <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            <span>weniger</span>
            {["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"].map(
              (colour) => (
                <span
                  key={colour}
                  aria-hidden
                  className="size-2.5 rounded-[3px]"
                  style={{ background: colour }}
                />
              ),
            )}
            <span>mehr</span>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}

/** Status, priority and form, side by side as three small rankings. */
export function DistributionChart({
  distribution,
}: {
  distribution: AnalyticsData["distribution"];
}) {
  const groups = [
    { title: "Status", rows: distribution.status, offset: 0 },
    { title: "Priorität", rows: distribution.priority, offset: 2 },
    { title: "Formular", rows: distribution.schema, offset: 4 },
  ];

  return (
    <ChartCard
      title="Verteilung"
      empty={groups.every((group) => group.rows.length === 0)}
    >
      <div className="grid gap-6 sm:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="grid gap-2">
            <span className="label-industrial">{group.title}</span>
            {group.rows.length === 0 ? (
              <span className="text-xs text-muted-foreground">Keine Daten.</span>
            ) : (
              <ResponsiveContainer width="100%" height={barHeight(group.rows.length)}>
                <BarChart
                  data={group.rows}
                  layout="vertical"
                  margin={{ left: 0, right: 8 }}
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={92}
                    tickFormatter={(value: string) =>
                      value.length > 13 ? `${value.slice(0, 12)}…` : value
                    }
                    {...AXIS}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "var(--accent)", fillOpacity: 0.5 }}
                  />
                  <Bar dataKey="value" name="Tickets" radius={[0, 5, 5, 0]} {...ANIMATION}>
                    {group.rows.map((row, index) => (
                      <Cell key={row.key} fill={seriesColor(group.offset + index)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/**
 * A duration as two figures.
 *
 * Median *and* mean, side by side, because they disagree in a way that matters:
 * one ticket left open over Christmas moves the mean by days and the median not
 * at all. The sample size is stated because it is usually smaller than the ticket
 * count — a ticket closed before the audit log existed contributes nothing.
 */
export function DurationTile({
  title,
  hint,
  stat,
}: {
  title: string;
  hint: string;
  stat: AnalyticsData["resolutionTime"];
}) {
  return (
    <ChartCard title={title} hint={hint} empty={stat.sample === 0}>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <Figure label="Median" value={formatDuration(stat.median)} />
        <Figure label="Mittel" value={formatDuration(stat.mean)} />
        <span className="text-xs text-muted-foreground">
          Datenbasis: {stat.sample} Ticket(s)
        </span>
      </div>
    </ChartCard>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** The four headline counters. */
export function TotalsRow({ totals }: { totals: AnalyticsData["totals"] }) {
  const tiles = [
    { label: "Eingegangen", value: totals.created },
    { label: "Erledigt", value: totals.resolved },
    { label: "Aktuell offen", value: totals.open, hint: "unabhängig vom Zeitraum" },
    { label: "Meldende Personen", value: totals.reporters },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="grid gap-0.5 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1"
        >
          <span className="text-xs text-muted-foreground">{tile.label}</span>
          <span className="text-2xl font-medium tabular-nums">{tile.value}</span>
          {tile.hint && (
            <span className="text-[11px] text-muted-foreground">{tile.hint}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Topics per heavy reporter, as a plain table — three columns, no chart needed. */
export function CreatorTopics({
  entries,
}: {
  entries: AnalyticsData["creatorTopics"];
}) {
  return (
    <ChartCard
      title="Themen pro Anwender"
      hint="Wiederkehrende Themen der häufigsten Melder."
      empty={entries.length === 0}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.creator} className="grid gap-1.5">
            <span className="text-sm font-medium">{entry.creator}</span>
            <ul className="grid gap-1">
              {entry.topics.map((topic) => (
                <li
                  key={topic.key}
                  className="flex items-baseline gap-2 text-xs text-muted-foreground"
                >
                  <span className="flex-1 truncate">{topic.label}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {topic.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
