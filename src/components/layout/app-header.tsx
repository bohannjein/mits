import Link from "next/link";

import { UserMenu } from "@/components/auth/user-menu";
import { MITSLogo } from "@/components/branding/mits-logo";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { RefreshControl } from "@/components/layout/refresh-control";
import { TicketSearch } from "@/components/tickets/ticket-search";
import { TicketSearchDialog } from "@/components/tickets/ticket-search-dialog";
import { Button } from "@/components/ui/button";
import { canViewBoard, homeFor } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { listLocations } from "@/lib/locations";

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
   * The heartbeat lives here so every page a technician opens counts as a sign of
   * life, without each page having to know about presence. Gated on the role as
   * well as the flag: a reporter's whereabouts are not tracked, and rendering the
   * component for them would send requests the API answers with 204 anyway.
   */
  const trackPresence =
    user !== null &&
    !user.mustChangePassword &&
    canViewBoard(user.role) &&
    isFeatureEnabled("feature_presence_sidebar");

  return (
    <header className="border-b border-border bg-card">
      {trackPresence && <PresenceHeartbeat />}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
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

        {user ? (
          <div className="flex items-center gap-1">
            {/* Not for an account still behind the password gate: every page
                redirects to the profile form, so refreshing it changes nothing. */}
            {!user.mustChangePassword && <RefreshControl />}
            <UserMenu user={user} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
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
