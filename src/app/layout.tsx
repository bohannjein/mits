import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";

import { unstable_rethrow } from "next/navigation";

import { ThemeProvider } from "@/components/branding/theme-provider";
import { ToastProvider } from "@/components/feedback/toast";
import { QueryProvider } from "@/components/providers/query-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { DetachedTicketProvider } from "@/components/tickets/detached-ticket-provider";
import { FloatingTicket } from "@/components/tickets/floating-ticket";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { getSessionUser } from "@/lib/auth/session";
import { getNotificationSettings } from "@/lib/notification-settings";
import { getSystemTimezone } from "@/lib/system-settings";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/types/mits";

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
  let timezone = "Europe/Berlin";
  try {
    timezone = getSystemTimezone();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[MITS] Zeitzone nicht lesbar:", error);
  }

  /*
   * One stream per tab, opened here rather than per page.
   *
   * Browsers cap concurrent connections per origin, and an event stream is a
   * connection that never returns — a provider per page would open a new one on
   * every navigation and leave the old one draining. At the root it survives
   * navigation, which is also what lets the ticket page hand it a ticket id
   * instead of reconnecting from scratch.
   *
   * Off for a signed-out visitor and while the password gate is closed: neither
   * has a session the stream could be scoped to, and the route would answer 401
   * on a loop.
   */
  /*
   * Both reads degrade rather than throw, and that is the point of the wrapper.
   *
   * A layout that throws takes the **whole application** with it: `error.tsx`
   * lives inside the layout, so it cannot catch its own parent, and what the
   * browser gets is the bare "A server error occurred" on every route at once —
   * with no retry and nothing that says which of the two reads failed.
   *
   * Neither is load-bearing. Without a session the stream stays off and the
   * page's own guard still redirects correctly; without the settings the toasts
   * use their defaults. Both are strictly better than an application that will
   * not render.
   *
   * **`unstable_rethrow` first in every catch.** Next signals control flow by
   * throwing — `DynamicServerError` when a static render touches `headers()`,
   * and the markers behind `redirect()` and `notFound()`. Swallowing one of those
   * does not make a page resilient, it breaks the framework: the first version of
   * this wrapper caught the dynamic-render bail-out and failed `next build`
   * outright. A broad catch around framework calls needs this line, always.
   */
  let streaming = false;
  try {
    const user = await getSessionUser();
    streaming = user !== null && !user.mustChangePassword;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[MITS] Sitzung im Layout nicht lesbar:", error);
  }

  let notifications = DEFAULT_NOTIFICATION_SETTINGS;
  try {
    notifications = getNotificationSettings();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[MITS] Benachrichtigungseinstellungen nicht lesbar:", error);
  }

  return (
    /*
     * No `dark` class in the markup any more.
     *
     * It used to be here to match a hard-coded dark default, so the first paint
     * agreed with what the theme script was about to set. Now the default is the
     * operating system's setting, which the server cannot know — and a static
     * `dark` would be a guess that is wrong on every light-mode machine, showing
     * them a dark flash on each cold load. `next-themes` resolves the class from a
     * blocking script instead, which is what `suppressHydrationWarning` covers.
     *
     * `color-scheme` follows along so the browser's own furniture — scrollbars,
     * form controls, the canvas behind the page — matches before any CSS of ours
     * has been applied.
     */
    <html
      lang="de"
      className={`${robotoSans.variable} ${robotoMono.variable} h-full antialiased`}
      style={{ colorScheme: "light dark" }}
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
            {/* The stack's corner, size and dwell time come from the admin
                settings, resolved here so the very first toast of a session is
                already where it belongs rather than moving after hydration. */}
            <QueryProvider>
              <RealtimeProvider enabled={streaming}>
                <ToastProvider settings={notifications}>
                  {/*
                    At the root, so a pinned ticket survives navigation — that is
                    the whole point of pinning it. The panel renders nothing until
                    something is detached.
                  */}
                  <DetachedTicketProvider>
                    {children}
                    <FloatingTicket />
                  </DetachedTicketProvider>
                </ToastProvider>
              </RealtimeProvider>
            </QueryProvider>
          </TimezoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
