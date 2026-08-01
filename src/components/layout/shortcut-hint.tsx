import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   A keystroke, rendered as one.

   `<kbd>` because that is what the element is for, and because a `<span>` styled
   to look like a key tells a screen reader nothing. The styling matches the two
   badges that already existed — the `/` in the snippet button and `Strg+Enter`
   in the composer — which is why this exists at all: three hand-rolled copies
   were already drifting on padding.

   **Hidden below `sm` by default.** A phone has no Ctrl key, and a badge naming
   one is furniture on the screen with the least room for it. `always` overrides
   that for the help dialog, where the badges *are* the content.
   ────────────────────────────────────────────────────────────────────────── */

export function Kbd({
  keys,
  always = false,
  className,
}: {
  /** One entry per key. `["Strg", "K"]` renders as two badges with a plus. */
  keys: string[];
  always?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "items-center gap-0.5 text-muted-foreground",
        always ? "inline-flex" : "hidden sm:inline-flex",
        className,
      )}
    >
      {keys.map((key, index) => (
        <span key={key} className="inline-flex items-center gap-0.5">
          {index > 0 && <span aria-hidden>+</span>}
          <kbd className="rounded border border-border px-1 font-mono text-[10px] leading-4">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}
