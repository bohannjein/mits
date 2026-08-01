"use client";

import type { ReactNode } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Shared chart plumbing.

   Three things every chart in MITS needs and none of them should re-decide:
   the series palette, the tooltip, and the animation settings.

   **Colours are CSS variables, not literals.** Recharts passes `fill` and
   `stroke` straight through to SVG attributes, and SVG resolves `var(--chart-1)`
   like any other property — so a series follows the theme for free. A literal
   colour would break rule 2 *and* would sit at one lightness on both the dark
   shell and the white card, which is the point at which a five-series chart stops
   being readable. The palette itself lives in `globals.css`, once, per theme.

   **The tooltip is ours.** Recharts' default is a white box with a black border,
   hard-coded, and it is unreadable in the dark theme — the one place where "the
   chart library handles it" is simply false.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The categorical series, in order.
 *
 * Six is the cap on purpose: past that a legend stops being scannable and the
 * honest chart is a ranked bar, not more colours. Anything beyond wraps.
 */
export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export const seriesColor = (index: number): string =>
  SERIES[index % SERIES.length];

/**
 * Animation, spelled out once.
 *
 * 800 ms with an ease-out is slow enough to be followed and short enough that a
 * five-second auto-refresh is not permanently mid-transition. Recharts morphs
 * between old and new values when the shape of the data is stable, which is why
 * the series generators always emit every bucket — a chart whose points appear
 * and disappear cannot tween, it can only jump.
 */
export const ANIMATION = {
  isAnimationActive: true,
  animationDuration: 800,
  animationEasing: "ease-out",
} as const;

/** Axis and grid styling, in tokens. */
export const AXIS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_STROKE = "var(--border)";

/**
 * The tooltip body.
 *
 * Rendered as a card on `--popover`, so it inherits both themes and the elevation
 * scale. The swatch repeats the series colour because a tooltip listing three
 * numbers with no colours makes the reader map them back to the chart by memory.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  /** Formats a value for display. Defaults to the number itself. */
  format = (value) => String(value),
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  format?: (value: number | string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-elev-3">
      {label !== undefined && (
        <p className="mb-1 text-xs font-medium">{label}</p>
      )}
      <ul className="grid gap-0.5">
        {payload.map((entry, index) => (
          <li
            key={`${entry.name ?? index}`}
            className="flex items-center gap-2 text-xs"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="flex-1 text-muted-foreground">{entry.name}</span>
            <span className="font-medium tabular-nums">
              {format(entry.value ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A chart with a heading and an empty state.
 *
 * The empty state is the reason this wrapper exists. Recharts given no data
 * renders axes around nothing, which reads as a broken widget — and "no tickets
 * in this range" is a real, correct answer that deserves to be said in words.
 */
export function ChartCard({
  title,
  hint,
  action,
  empty,
  children,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  /** True renders the message instead of the chart. */
  empty?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`grid gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1 ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {hint && (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        {action}
      </header>

      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Für diesen Zeitraum liegen keine Daten vor.
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/** `41 Min`, `5:10 Std`, `–` — the shapes a duration takes on a dashboard. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "–";
  if (minutes < 60) return `${minutes} Min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest === 0
      ? `${hours} Std`
      : `${hours}:${String(rest).padStart(2, "0")} Std`;
  }

  // Past two days, hours stop being a unit anybody reads.
  return `${Math.round(hours / 24)} Tage`;
}
