/* ──────────────────────────────────────────────────────────────────────────
   Pie geometry.

   Hand-rolled rather than pulled in with a chart library. `shadcn add chart` brings
   recharts, which is a substantial dependency for two numbers and no axes; the
   segments here are arithmetic and an SVG path.

   Separate from the component so the degenerate cases can be tested. They are the
   whole reason this file exists: a slice covering the full circle has a start point
   identical to its end point, and an SVG arc between two identical points draws
   *nothing*. A pie showing "everything closed" would render as an empty box, which
   reads as a broken widget rather than as 100%.
   ────────────────────────────────────────────────────────────────────────── */

export interface PieSlice {
  /** Zero when the slice covers the whole circle — draw a plain circle instead. */
  path: string | null;
  /** True when this slice is the entire pie. */
  full: boolean;
  fraction: number;
}

/**
 * A pie slice starting at twelve o'clock and running clockwise.
 *
 * `fraction` outside 0…1 is clamped rather than rejected: the caller derives it
 * from two counters, and a rounding artefact should not produce a path that loops
 * back on itself.
 */
export function pieSlice(
  fraction: number,
  radius: number,
  centre: number,
): PieSlice {
  const clamped = Math.min(1, Math.max(0, fraction));

  if (clamped <= 0) return { path: null, full: false, fraction: 0 };
  if (clamped >= 1) return { path: null, full: true, fraction: 1 };

  const angle = clamped * 360;
  const start = pointOnCircle(centre, radius, 0);
  const end = pointOnCircle(centre, radius, angle);
  // A slice larger than a semicircle needs the long way round, or the arc renders
  // as its own complement — a 70% slice would come out as 30%.
  const largeArc = angle > 180 ? 1 : 0;

  return {
    path: [
      `M ${centre} ${centre}`,
      `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
      "Z",
    ].join(" "),
    full: false,
    fraction: clamped,
  };
}

/** Angle measured in degrees from the top, clockwise — how a pie is read. */
function pointOnCircle(centre: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: centre + radius * Math.sin(radians),
    y: centre - radius * Math.cos(radians),
  };
}

/**
 * Whole-percent share, or null when there is nothing to divide.
 *
 * Null rather than 0: with no tickets at all, "0 %" is a claim about a ratio that
 * does not exist, and a widget that states one is worse than a widget that says it
 * has no data.
 */
export function sharePercent(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}
