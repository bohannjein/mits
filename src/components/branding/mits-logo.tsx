import { cn } from "@/lib/utils";

/**
 * MITS wordmark. Colour comes from `currentColor` and the surrounding text
 * classes only, so the mark works on any themed surface without a second asset.
 */
export function MITSLogo({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* Squircle mark with an accent-tinted glow edge instead of the old hard
          border. shadow-glow-primary derives its rim from --primary, so the
          mark still needs no second asset per theme. */}
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold leading-none text-primary-foreground shadow-glow-primary"
      >
        M
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-heading text-lg font-semibold tracking-tight">
          MITS
        </span>
        {showTagline && (
          <span className="label-industrial mt-1.5">Modular IT Ticketing</span>
        )}
      </span>
    </span>
  );
}
