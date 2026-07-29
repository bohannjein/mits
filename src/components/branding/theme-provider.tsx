"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * MITS theme host. Dark is the product's default look, not a user preference we
 * discover — `enableSystem` stays off so a light-mode OS does not flip the
 * industrial dark UI on first paint. `next-themes` writes the `class` on <html>,
 * which is what the `.dark` block in globals.css hangs off.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
