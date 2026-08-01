import Link from "next/link";

import { UserMenu } from "@/components/auth/user-menu";
import { MITSLogo } from "@/components/branding/mits-logo";
import { ThemeToggle } from "@/components/branding/theme-toggle";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { NotificationWatcher } from "@/components/feedback/notification-watcher";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { TicketSearch } from "@/components/tickets/ticket-search";
import { TicketSearchDialog } from "@/components/tickets/ticket-search-dialog";
import { Button } from "@/components/ui/button";
import { canViewBoard, homeFor } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { listLocations } from "@/lib/locations";
import { resolveRefreshMinutes } from "@/lib/system-settings";

/**
 * Application header. A server component so the identity block renders with the
 * first paint instead of appearing after a client-side session fetch.
 */
export async function AppHeader() {
  const user = await getSessionUser();

  /*
   * Search only for a signed-in user: an anonymous visitor has no tickets to
   * find, and the field would submit to a page that redirects them to the login
   * form. Staff search the board, everyone else their own tickets — the target
   * decides the scope, and `searchTickets` enforces it again server-side.
   */
  const showSearch =
    user !== null &&
    !user.mustChangePassword &&
    isFeatureEnabled("feature_ticket_search");

  const staff = user !== null && canViewBoard(user.role);

  /*
   * The heartbeat lives here so every page anyone opens counts as a sign of life,
   * without each page having to know about presence. Every role beats — the queue's
   * panel has a tab for reporters, and one that could only ever say "offline" would
   * be a tab nobody trusts. Who may see the result is decided in `/mits`.
   */
  const trackPresence =
    user !== null &&
    !user.mustChangePassword &&
    isFeatureEnabled("feature_presence_sidebar");

  /*
   * Same placement, same reason: one poller in the header rather than one per
   * page. Not while the password gate is closed — that session may only reach the
   * settings form, and a toast linking into a ticket it cannot open is an
   * invitation to a redirect.
   */
  const watchNotifications =
    user !== null &&
    !user.mustChangePassword &&
    isFeatureEnabled("feature_toast_notifications");

  return (
    /*
     * `shrink-0` because the body is a flex column with a definite height: without
     * it the header is a shrinkable item, and on a page taller than the viewport
     * the flex algorithm has it as the only candidate to take the overflow out of.
     * Its own `min-height: auto` happens to save it today — that is not something
     * to rely on for the one element present on every page.
     */
    <header className="shrink-0 border-b border-border bg-card">
      {trackPresence && <PresenceHeartbeat />}
      {watchNotifications && <NotificationWatcher />}
      {/*
        `max-w-7xl`, matching the widest page shell below it. At `max-w-6xl` the
        header was 128 px narrower than the queue, the analytics panel and both
        ticket views, so on a wide screen the logo sat visibly inset from the
        heading underneath it and the user menu from the sidebar. Narrower pages
        centre inside it, which is what a chrome bar is supposed to do — the defect
        was only ever the header being the *narrower* of the two.
      */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        {/* Straight to the signed-in user's own area instead of through the `/`
            dispatcher: a reporter clicking the logo lands in their portal without
            a redirect hop that briefly resolves a staff route. */}
        <Link
          href={user ? homeFor(user.role) : "/"}
          className="rounded-xl outline-ring/50 focus-visible:outline-2"
        >
          <MITSLogo />
        </Link>

        {/*
          Staff get the dialog, reporters the plain GET form.

          The dialog carries filters an agent needs — location, status, priority,
          date — and binds Ctrl+K here so it works on every page rather than only in
          the queue. A reporter has none of that to filter and only their own
          tickets to find, so a field that submits to a shareable URL is the better
          answer for them than an overlay.
        */}
        {showSearch && staff && (
          <div className="order-last w-full sm:order-none sm:ml-auto sm:mr-3 sm:w-auto">
            <TicketSearchDialog locations={listLocations()} />
          </div>
        )}
        {showSearch && !staff && (
          <TicketSearch
            compact
            action="/customer/tickets"
            className="order-last w-full sm:order-none sm:ml-auto sm:mr-3 sm:w-auto"
          />
        )}

        {/*
          Available to anonymous visitors too. The login page is a full-screen
          surface in whichever theme is active, and somebody who cannot read dark
          text on dark should not have to sign in first to fix it.
        */}
        {user ? (
          <>
            {/*
              Renders nothing — it is the refresh timer, placed here because the
              header is on every page. The interval is resolved server-side: the
              instance-wide value for a reporter, the agent's own override for staff.
              There is deliberately no control next to it; reporters do not get to
              decide, and staff set theirs under Einstellungen.

              Not while the password gate is closed: every page redirects to the
              settings form, so refreshing would only re-fetch that redirect.
            */}
            {!user.mustChangePassword && (
              <AutoRefresh minutes={resolveRefreshMinutes(user)} />
            )}
            <ThemeToggle />
            <UserMenu user={user} />
          </>
        ) : (
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4"
            >
              <Link href="/login">Anmelden</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              <Link href="/register">Registrieren</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
