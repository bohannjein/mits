"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/* ──────────────────────────────────────────────────────────────────────────
   What an `error.tsx` shows.

   One component for every boundary, because the difference between them is the
   scope they cover and not what they say.

   **It prints the digest.** Next replaces a server-side error message with an
   opaque hash before it reaches the browser — deliberately, so a stack trace
   never leaves the server. The consequence is that "A server error occurred" is
   all anybody can report, and the same eight-digit number is sitting in
   `docker logs` next to the actual stack. Showing it turns an unanswerable bug
   report into a one-line lookup:

       docker logs mits-web 2>&1 | grep <digest>

   **`reset()` before anything else.** Most of what lands here is transient — a
   database busy for a moment, a request that raced a deploy. Retrying in place
   costs nothing and resolves it without losing where somebody was.
   ────────────────────────────────────────────────────────────────────────── */

export function ErrorPanel({
  error,
  reset,
  title = "Dieser Bereich konnte nicht geladen werden.",
  /** `false` inside a page region, so the card does not claim the whole screen. */
  full = true,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  full?: boolean;
}) {
  return (
    <div
      className={
        full
          ? "grid min-h-[50vh] place-items-center px-6 py-12"
          : "grid place-items-center px-4 py-8"
      }
    >
      <div className="grid max-w-md justify-items-center gap-4 rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-elev-1">
        <span className="grid size-12 place-items-center rounded-full bg-surface-elevated text-destructive">
          <TriangleAlertIcon className="size-6" strokeWidth={1.5} aria-hidden />
        </span>

        <div className="grid gap-1.5">
          <h2 className="text-base font-medium">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Erneut versuchen behebt das meistens. Bleibt es, hilft die Kennung
            unten beim Nachsehen im Server-Protokoll.
          </p>
        </div>

        {error.digest && (
          <code className="rounded-lg bg-surface-elevated px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {error.digest}
          </code>
        )}

        <Button
          type="button"
          onClick={reset}
          className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
        >
          <RefreshCwIcon strokeWidth={1.5} />
          Erneut versuchen
        </Button>
      </div>
    </div>
  );
}
