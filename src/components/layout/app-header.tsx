import Link from "next/link";

import { UserMenu } from "@/components/auth/user-menu";
import { MITSLogo } from "@/components/branding/mits-logo";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { NotificationWatcher } from "@/components/feedback/notification-watcher";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { ShortcutHelp } from "@/components/layout/shortcut-help";
import { TicketSearch } from "@/components/tickets/ticket-search";
import { TicketSearchDialog } from "@/components/tickets/ticket-search-dialog";
import { Button } from "@/components/ui/button";
import { canViewBoard, homeFor } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { listLocations } from "@/lib/locations";
import { getNotificationSettings } from "@/lib/notification-settings";
import { visibleAreas } from "@/lib/role-visibility";
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
  /*
   * Zwei Achsen, und beide müssen zustimmen: das Modul für die Instanz, die
   * Sichtbarkeit für diese Rolle. Ein Aufruf für alle Bereiche, weil das
   * Benutzermenü darunter drei davon braucht — `getRoleVisibility` ist ein
   * indizierter Read, aber ein synchroner, und der blockiert für alle.
   */
  const areas = user ? visibleAreas(user.role) : null;

  const showSearch =
    user !== null &&
    !user.mustChangePassword &&
    isFeatureEnabled("feature_ticket_search") &&
    areas?.ticket_search === true;

  const staff = user !== null && canViewBoard(user.role);

  // Modul und Bereich hier aufgelöst; das Menü bekommt ein Boolean.
  const showTeam =
    staff &&
    isFeatureEnabled("feature_team_overview") &&
    areas?.mits_team !== false;

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
    <header className="shrink-0 border-b border-border bg-card print:hidden">
      {trackPresence && <PresenceHeartbeat />}
      {/* The channel switches and the poll interval come from the admin settings;
          the watcher applies them client-side to decide what is shown, never to
          decide what it is allowed to know — see the note in notifications.ts. */}
      {watchNotifications && (
        <NotificationWatcher settings={getNotificationSettings()} />
      )}
      {/*
        So breit wie die breiteste Seite darunter — das ist die Regel, und sie hat
        eine Richtung.

        Bei `max-w-6xl` war der Header 128 px schmaler als Queue, Statistiken und
        beide Ticketansichten; auf einem breiten Schirm saß das Logo sichtbar
        eingerückt gegenüber der Überschrift darunter. Schmalere Seiten zentrieren
        sich dagegen darin, was eine Kopfleiste tun soll — der Defekt war
        ausschließlich der Header als der *schmalere* von beiden.

        `96rem` seit die Queue ihre Spalten frei stellt: dort passen mehr davon
        neben die Sidebar. Die übrigen Seitenhüllen bleiben bei `7xl`, und das ist
        Absicht — eine Chatspalte auf 1200 px wäre eine Zeilenlänge, die niemand
        liest. Sie zentrieren sich hierin, und genau das ist erlaubt.
      */}
      <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center justify-between gap-3 px-6 py-3">
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
            {/*
              The live-connection dot used to sit here, and the theme switch
              beside it. Both are gone from the bar:

              - The dot announced a working stream on every page, all day, to
                every role. It answers a question that is only asked when
                something feels wrong, and most of the people looking at it
                could do nothing either way. It now sits on /admin/status,
                beside every other subsystem, which is where somebody actually
                goes with that question.
              - The theme is a property of this browser, set once. It lives
                under Erscheinungsbild in /settings/profile, which is where the
                rest of the personal settings already are.
            */}
            {/* Renders nothing until `?` is pressed. Here so every page has it
                without knowing about it — same as the watcher above. */}
            {!user.mustChangePassword && <ShortcutHelp />}
            {/* Die Bereichsschalter werden hier aufgelöst und nicht im Menü: das
                Menü ist eine Client-Komponente und hätte sonst einen zweiten Weg
                zu einer Regel, die auf dem Server steht. */}
            <UserMenu
              user={user}
              showOwnTickets={areas?.customer_tickets !== false}
              showAnalytics={areas?.mits_analytics !== false}
              showTeam={showTeam}
            />
          </>
        ) : (
          <div className="flex items-center gap-2">
            {/*
              No theme switch here either. Signed out there is no profile to
              keep the choice in, and `next-themes` runs with
              `defaultTheme="system"` — a visitor at the login form already gets
              what their device asked for.
            */}
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
