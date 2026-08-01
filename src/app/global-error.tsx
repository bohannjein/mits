"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";

import "./globals.css";

/**
 * The boundary for failures in the root layout itself.
 *
 * `error.tsx` lives *inside* the layout, so it cannot catch the layout throwing —
 * that case bypasses every other boundary and produces the bare "A server error
 * occurred" with no way back. Only this file catches it, and it has to render its
 * own `<html>` and `<body>` because the ones it would have inherited are exactly
 * what failed.
 *
 * It should almost never be reached: the layout's two data reads are wrapped so
 * they degrade instead of throwing. This is the net under that, and the digest it
 * prints is the only thing that would identify such a failure at all.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        <ErrorPanel
          error={error}
          reset={reset}
          title="MITS konnte nicht geladen werden."
        />
      </body>
    </html>
  );
}
