"use client";

import {
  BarChart3Icon,
  ChevronDownIcon,
  HeadsetIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  TicketIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/client";
import {
  AGENT_HOME,
  ROLE_LABELS,
  canAdminister,
  canViewBoard,
} from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Header identity block.
 *
 * The user is passed in from the server rather than fetched with `useSession`:
 * the header is server-rendered, so there is no loading flash and no second
 * round-trip. The client is only needed to end the session.
 *
 * This menu is the only place in MITS that offers a cross-area link, which makes
 * it the one place a reporter could be handed a way out of `/customer`. "Meine
 * Tickets" and "Einstellungen" are inside their own area and therefore ungated. Both
 * staff entries hang off `canViewBoard`/`canAdminister` — the same predicates the
 * server guard uses — so a `user` is offered nothing but their own tickets. Any
 * new entry here needs the same gate; an ungated one puts a dead-end link on the
 * customer portal, and the redirect that catches it is a worse answer than never
 * showing the link.
 */
export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const showBoard = canViewBoard(user.role);
  const showAdmin = canAdminister(user.role);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    // Drops the cached server render that still contains the old session.
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      {/* Elevated roles get a one-click switcher, not just a menu entry. */}
      {showBoard && (
        <Button
          asChild
          size="sm"
          className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
        >
          <Link href={showAdmin ? "/admin" : AGENT_HOME}>
            {showAdmin ? (
              <ShieldIcon strokeWidth={1.5} />
            ) : (
              <HeadsetIcon strokeWidth={1.5} />
            )}
            {showAdmin ? "Admin-Desk" : "Agenten-Desk"}
          </Link>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 rounded-full px-3">
            <span className="max-w-40 truncate">{user.name}</span>
            <Badge
              variant={showAdmin ? "default" : "outline"}
              className="rounded-full"
            >
              {ROLE_LABELS[user.role]}
            </Badge>
            <ChevronDownIcon strokeWidth={1.5} />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-60 rounded-2xl border border-border shadow-elev-2"
        >
          <DropdownMenuLabel className="grid gap-0.5">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/customer/tickets">
              <TicketIcon />
              Meine Tickets
            </Link>
          </DropdownMenuItem>

          {/* For every role, not gated. Until now nothing linked here at all and
              the page was reachable only through the forced password redirect —
              so a reporter had no way to change their own password. */}
          <DropdownMenuItem asChild>
            <Link href="/settings/profile">
              <SettingsIcon />
              Einstellungen
            </Link>
          </DropdownMenuItem>

          {showBoard && (
            <DropdownMenuItem asChild>
              <Link href={AGENT_HOME}>
                <HeadsetIcon />
                Agenten-Desk
              </Link>
            </DropdownMenuItem>
          )}

          {/*
            The reliable way to the statistics.

            The prominent one is the link beside the pie chart in the queue's
            sidebar, but that whole widget is behind `feature_stats_heatmap` — an
            instance with it switched off would otherwise have a panel with no way
            in. Gated on the same predicate as the desk entry, which is the guard
            `/mits/analytics` itself uses.
          */}
          {showBoard && (
            <DropdownMenuItem asChild>
              <Link href="/mits/analytics">
                <BarChart3Icon />
                Statistiken
              </Link>
            </DropdownMenuItem>
          )}

          {showAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldIcon />
                Admin-Desk
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={signingOut}
            onSelect={(event) => {
              // Keep the menu mounted while the request is in flight.
              event.preventDefault();
              void handleSignOut();
            }}
          >
            <LogOutIcon />
            {signingOut ? "Abmelden …" : "Abmelden"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
