"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * MITS theme host.
 *
 * **`defaultTheme="system"`.** Somebody who has never touched the switch gets
 * whatever their operating system is set to — a laptop in light mode opens MITS
 * in light mode. It used to default to `dark`, which is the product's own look
 * but is a decision the browser had already made and MITS was overriding.
 *
 * `enableSystem` is what makes that value mean anything: it registers the
 * `prefers-color-scheme` listener, so the page also follows a machine that
 * switches at sunset. Picking Hell or Dunkel explicitly writes to
 * `localStorage` and pins it — the OS then stops being consulted until somebody
 * chooses *System* again.
 *
 * `next-themes` resolves all of this from a blocking script before the first
 * paint rather than after hydration, which is why `<html>` carries
 * `suppressHydrationWarning` and no longer carries a hard-coded `dark`: a
 * static class in the markup is a guess, and it was the wrong one for every
 * light-mode machine.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
