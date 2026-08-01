"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * MITS theme host.
 *
 * `defaultTheme="dark"` and `enableSystem` are not in conflict, which is the
 * whole reason both are set. The default is what an account with no stored
 * choice gets — dark, because that is the product's look and because the
 * server renders `class="dark"` on <html>, so agreeing with it means no flash
 * on a first visit. `enableSystem` only adds *"System"* as something a person
 * can pick; it does not make the OS the default. Turning it off, as this file
 * did before, meant an account that wanted its laptop's setting had no way to
 * ask for it.
 *
 * `next-themes` writes the class on <html> from a blocking script in <head>, so
 * a stored light preference is applied before the first paint rather than after
 * hydration. That script is also why `suppressHydrationWarning` is on the
 * element in `layout.tsx`.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
