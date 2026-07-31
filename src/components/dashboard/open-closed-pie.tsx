import { pieSlice, sharePercent } from "@/lib/chart";

/* ──────────────────────────────────────────────────────────────────────────
   Today's opened-versus-closed ratio as a pie.

   A server component: two numbers in, static SVG out, nothing to hydrate.

   Colour is not the only carrier. Every value appears as a figure in the legend
   beside its swatch, and the whole graphic has an `aria-label` naming both counts —
   a pie read as two similar greys is no worse off than the screen reader.
   ────────────────────────────────────────────────────────────────────────── */

const SIZE = 132;
const CENTRE = SIZE / 2;
const RADIUS = CENTRE - 2;

export function OpenClosedPie({
  opened,
  closed,
}: {
  opened: number;
  closed: number;
}) {
  const total = opened + closed;
  const closedShare = sharePercent(closed, total);
  const slice = pieSlice(total > 0 ? closed / total : 0, RADIUS, CENTRE);

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-28 shrink-0"
        role="img"
        aria-label={
          total === 0
            ? "Heute wurden keine Tickets eröffnet oder erledigt."
            : `Heute ${opened} eröffnet und ${closed} erledigt, das sind ${closedShare} Prozent erledigt.`
        }
      >
        {total === 0 ? (
          /* No data: an outline, not a filled circle. A full circle in either
             colour would assert a ratio, and "no tickets today" is not "nothing
             was closed". */
          <circle
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS - 1}
            className="fill-none stroke-border"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        ) : (
          <>
            {/* Opened is the ground the closed slice is drawn on, so the two
                always add up to the whole circle with no seam between them. */}
            <circle cx={CENTRE} cy={CENTRE} r={RADIUS} className="fill-primary" />

            {/* A slice covering everything has no drawable arc — see `pieSlice`. */}
            {slice.full ? (
              <circle cx={CENTRE} cy={CENTRE} r={RADIUS} className="fill-success" />
            ) : (
              slice.path && <path d={slice.path} className="fill-success" />
            )}
          </>
        )}
      </svg>

      <dl className="grid min-w-32 flex-1 gap-2.5">
        <Legend
          swatch="bg-primary"
          label="Eröffnet"
          value={opened}
          share={sharePercent(opened, total)}
        />
        <Legend
          swatch="bg-success"
          label="Erledigt"
          value={closed}
          share={closedShare}
        />
      </dl>
    </div>
  );
}

function Legend({
  swatch,
  label,
  value,
  share,
}: {
  swatch: string;
  label: string;
  value: number;
  /** Null when there is nothing to divide — then no percentage is claimed. */
  share: number | null;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`size-2.5 shrink-0 rounded-full ${swatch}`} aria-hidden />
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
