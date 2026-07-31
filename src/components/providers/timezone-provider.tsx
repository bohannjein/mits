"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_TIMEZONE } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────────────
   The configured display timezone, available to client components.

   Server components read `getSystemTimezone()` directly. Client components cannot —
   `lib/system-settings.ts` is `server-only` — so the root layout resolves it once
   and hands it down through here.

   Both halves therefore format with the *same* zone. Before this, every timestamp
   used the renderer's own zone: the container's during the server render and the
   visitor's laptop afterwards. For a UTC container and a user in Berlin that is a
   hydration mismatch plus a ticket that claims to have arrived two hours early.
   ────────────────────────────────────────────────────────────────────────── */

const TimezoneContext = createContext<string>(DEFAULT_TIMEZONE);

export function TimezoneProvider({
  timezone,
  children,
}: {
  timezone: string;
  children: ReactNode;
}) {
  return (
    <TimezoneContext.Provider value={timezone}>
      {children}
    </TimezoneContext.Provider>
  );
}

/**
 * The zone to format in.
 *
 * Falls back to the default rather than throwing when no provider is above: a
 * component rendered outside the layout — a preview, a test — should show a
 * plausible time, not crash the tree.
 */
export const useTimezone = (): string => useContext(TimezoneContext);
