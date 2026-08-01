"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

import { ANIMATION } from "@/components/charts/chart-kit";
import { sharePercent } from "@/lib/chart";

/* ──────────────────────────────────────────────────────────────────────────
   Today's opened-versus-closed ratio, as a donut.

   A client component now, where the previous version was a server-rendered SVG.
   That is a real cost — a hydration boundary for two numbers — and it buys the
   two things the old one could not do: the sweep on load and on every data
   change, and the hover that pushes a segment out. Both matter here because this
   sits on the queue and the queue auto-refreshes; a chart that jumps between two
   ratios every three minutes is a chart people learn to ignore.

   **A donut, not a pie.** The hole is not decoration: it is where the total goes,
   and the total is the number an agent actually wants. A pie forces the same
   figure into a legend line beside two percentages.

   Colour is still not the only carrier. Every value appears as a figure in the
   legend beside its swatch, and the graphic carries an `aria-label` naming both
   counts — a donut read as two similar greys is no worse off than the screen
   reader.
   ────────────────────────────────────────────────────────────────────────── */

/** How far a hovered segment pushes out. Enough to notice, not enough to reflow. */
const HOVER_GROW = 6;

export function OpenClosedPie({
  opened,
  closed,
}: {
  opened: number;
  closed: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = opened + closed;
  const closedShare = sharePercent(closed, total);

  const data = [
    { key: "opened", label: "Eröffnet", value: opened, color: "var(--chart-1)" },
    { key: "closed", label: "Erledigt", value: closed, color: "var(--chart-2)" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1">
      <div
        className="relative size-28 shrink-0"
        role="img"
        aria-label={
          total === 0
            ? "Heute wurden keine Tickets eröffnet oder erledigt."
            : `Heute ${opened} eröffnet und ${closed} erledigt, das sind ${closedShare} Prozent erledigt.`
        }
      >
        {total === 0 ? (
          /*
           * No data: a dashed outline, not a filled ring. A full ring in either
           * colour would assert a ratio, and "no tickets today" is not "nothing
           * was closed".
           */
          <svg viewBox="0 0 112 112" className="size-full" aria-hidden>
            <circle
              cx={56}
              cy={56}
              r={44}
              className="fill-none stroke-border"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          </svg>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="92%"
                // Twelve o'clock, clockwise — how a pie is read. Recharts counts
                // anticlockwise from three o'clock by default, so both have to be
                // stated or the first segment starts on the right and goes the
                // wrong way.
                startAngle={90}
                endAngle={-270}
                paddingAngle={total > 0 && opened > 0 && closed > 0 ? 2 : 0}
                stroke="none"
                /*
                 * Recharts 3 dropped `activeIndex` from `Pie` and tracks the
                 * hovered sector itself, so `activeShape` is the whole mechanism:
                 * the hovered segment is re-rendered through this and grows.
                 * Driving it from state is no longer possible, which is why the
                 * legend link below works by dimming rather than by growing.
                 */
                activeShape={(props: PieSectorDataItem) => (
                  <Sector {...props} outerRadius={(props.outerRadius ?? 0) + HOVER_GROW} />
                )}
                onMouseEnter={(_, index) => setActive(index)}
                onMouseLeave={() => setActive(null)}
                {...ANIMATION}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.key}
                    fill={entry.color}
                    // Hovering one legend row fades the other segment. Opacity
                    // rather than a colour change: a swapped colour would make the
                    // reader re-check the legend they are already pointing at.
                    fillOpacity={active === null || active === index ? 1 : 0.35}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}

        {/*
          The total, in the hole. Absolutely positioned rather than a recharts
          `<Label>`: a label inside the chart re-renders with the sweep and
          animates its own font size, which reads as a wobble on every refresh.
          `pointer-events-none` so it does not eat the hover the segments need.
        */}
        {total > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <span className="block text-xl leading-none font-medium tabular-nums">
                {total}
              </span>
              <span className="block text-[10px] text-muted-foreground">
                heute
              </span>
            </div>
          </div>
        )}
      </div>

      <dl className="grid min-w-32 flex-1 gap-2.5">
        {data.map((entry, index) => (
          <Legend
            key={entry.key}
            color={entry.color}
            label={entry.label}
            value={entry.value}
            share={sharePercent(entry.value, total)}
            // Hovering the legend lights the segment, which is what makes a
            // two-colour chart legible for somebody who cannot separate them.
            active={active === index}
            onHover={(on) => setActive(on ? index : null)}
          />
        ))}
      </dl>
    </div>
  );
}

function Legend({
  color,
  label,
  value,
  share,
  active,
  onHover,
}: {
  color: string;
  label: string;
  value: number;
  /** Null when there is nothing to divide — then no percentage is claimed. */
  share: number | null;
  active: boolean;
  onHover: (on: boolean) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-1 py-0.5 transition-colors ${
        active ? "bg-accent" : ""
      }`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <dt className="flex-1 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-sm font-medium tabular-nums">{value}</span>
        {share !== null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {share} %
          </span>
        )}
      </dd>
    </div>
  );
}
