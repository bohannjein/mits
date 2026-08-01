import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/branding/theme-provider";
import { ToastProvider } from "@/components/feedback/toast";
import { QueryProvider } from "@/components/providers/query-provider";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { getSystemTimezone } from "@/lib/system-settings";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved once per request and handed to the client tree, so both halves format
  // timestamps in the same zone — see TimezoneProvider.
  const timezone = getSystemTimezone();

  return (
    // `className="dark"` matches the ThemeProvider default so the first paint is
    // already dark; suppressHydrationWarning covers next-themes rewriting it.
    <html
      lang="de"
      className={`dark ${robotoSans.variable} ${robotoMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/*
        `h-full`, not `min-h-full`.

        Six pages — both ticket detail views, the three CMDB views and the FAQ
        reader — are app shells: they bound a region with `min-h-0` and let the
        conversation or the columns inside it scroll. That only works if some
        ancestor has a *definite* height to divide up. `min-height: 100%` is not
        one: the body still grows to fit its content, so `flex-1` had no fixed
        leftover to hand out, the bounded region silently sized itself to its
        content, and the whole page scrolled after all. It looked like the layout
        working right up until a ticket had enough replies to prove it did not.

        Ordinary pages are unaffected. Their `main` keeps the default
        `min-height: auto`, so it still refuses to shrink below its content, grows
        past the viewport and gives the window its usual scrollbar — padding and
        all. Only a `main` that explicitly opted into `min-h-0` is bounded, and
        those are exactly the six that want to be.
      */}
      <body className="flex h-full flex-col">
        <ThemeProvider>
          <TimezoneProvider timezone={timezone}>
            {/*
              Inside QueryProvider, because the watcher that feeds it polls with
              TanStack Query — and at the root rather than per page, so a toast
              raised by a Server Action has somewhere to land whichever page the
              agent is on.
            */}
            <QueryProvider>
              <ToastProvider>{children}</ToastProvider>
            </QueryProvider>
          </TimezoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
