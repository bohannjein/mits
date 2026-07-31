import { cn } from "@/lib/utils";
import type { SeatUsage } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Seat occupancy as a bar.

   Hand-rolled rather than a Progress primitive: the interesting state is *over* full,
   and a progress bar has no vocabulary for it — it clamps and looks the same as exactly
   full. Here the track turns destructive so overbooking reads at a glance.

   Width is an inline percentage. That is a computed geometry value, not a colour, so
   rule 2 does not apply; every colour comes from a token.
   ────────────────────────────────────────────────────────────────────────── */

export function SeatBar({
  seats,
  className,
}: {
  seats: SeatUsage;
  className?: string;
}) {
  if (seats.untracked) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Keine Platzzählung.
      </p>
    );
  }

  const percent = Math.round(seats.ratio * 100);

  return (
    <div className={cn("grid gap-1", className)}>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-elevated"
        role="meter"
        aria-valuenow={seats.used}
        aria-valuemin={0}
        aria-valuemax={seats.total}
        aria-label="Belegte Plätze"
      >
        <div
          className={cn(
            "h-full rounded-full",
            seats.overbooked
              ? "bg-destructive"
              : seats.free === 0
                ? "bg-warning"
                : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {seats.used} von {seats.total} belegt
        {seats.overbooked
          ? ` · ${seats.used - seats.total} zu viel`
          : seats.free > 0
            ? ` · ${seats.free} frei`
            : ""}
      </p>
    </div>
  );
}
