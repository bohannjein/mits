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
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-sm border-2 border-current bg-primary font-mono text-sm font-bold leading-none text-primary-foreground"
      >
        M
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-heading text-lg font-bold uppercase tracking-[0.14em]">
          MITS
        </span>
        {showTagline && (
          <span className="label-industrial mt-1 tracking-[0.12em]">
            Modular IT Ticketing
          </span>
        )}
      </span>
    </span>
  );
}
