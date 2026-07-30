import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/branding/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";

import "./globals.css";

/*
 * Roboto throughout, including the digits.
 *
 * The variable names keep the `--font-*` shape that `globals.css` maps into the
 * Tailwind theme, so the switch is one place. `Roboto_Mono` is the numeric half of
 * the same family — ticket numbers and timestamps sit in tabular columns, and a
 * proportional font makes those ragged.
 */
const robotoSans = Roboto({
  variable: "--font-sans-family",
  subsets: ["latin", "latin-ext"],
  // The weights the design system actually uses: body, medium labels, headings.
  weight: ["300", "400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono-family",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "MITS — Modular IT Ticketing System",
  description:
    "KI-first IT-Service-Portal mit drei Ticket-Eingängen: klassisch, geführter Wizard und KI-Chat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `className="dark"` matches the ThemeProvider default so the first paint is
    // already dark; suppressHydrationWarning covers next-themes rewriting it.
    <html
      lang="de"
      className={`dark ${robotoSans.variable} ${robotoMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
