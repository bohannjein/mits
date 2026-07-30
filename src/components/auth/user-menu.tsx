"use client";

import {
  ChevronDownIcon,
  HeadsetIcon,
  LayoutDashboardIcon,
  LogOutIcon,
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
import { ROLE_LABELS, canAdminister, canViewBoard } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Header identity block.
 *
 * The user is passed in from the server rather than fetched with `useSession`:
 * the header is server-rendered, so there is no loading flash and no second
 * round-trip. The client is only needed to end the session.
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
          <Link href={showAdmin ? "/admin" : "/board"}>
            {showAdmin ? (
              <ShieldIcon strokeWidth={1.5} />
            ) : (
              <LayoutDashboardIcon strokeWidth={1.5} />
            )}
            {showAdmin ? "Admin-Desk" : "Ticket-Board"}
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
            <Link href="/tickets">
              <TicketIcon />
              Meine Tickets
            </Link>
          </DropdownMenuItem>

          {showBoard && (
            <>
              <DropdownMenuItem asChild>
                <Link href="/agent">
                  <HeadsetIcon />
                  Agenten-Desk
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/board">
                  <LayoutDashboardIcon />
                  Ticket-Board
                </Link>
              </DropdownMenuItem>
            </>
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
