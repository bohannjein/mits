import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { ROLE_LABELS, canViewBoard, homeFor } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Kein Zugriff — MITS",
};

/**
 * Where an authenticated but under-privileged user lands. Deliberately not the
 * login form: re-authenticating would not grant the role and reads as a broken
 * login loop.
 */
export default async function ForbiddenPage() {
  const user = await getSessionUser();

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
          <CardHeader>
            <span className="grid size-11 place-items-center rounded-full bg-destructive/15 text-destructive">
              <ShieldAlertIcon className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <CardTitle className="mt-4 font-medium">Kein Zugriff</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              {user
                ? `Dein Konto hat die Rolle „${ROLE_LABELS[user.role]}“ und darf diesen Bereich nicht öffnen.`
                : "Für diesen Bereich fehlen die Rechte."}
            </CardDescription>
          </CardHeader>
          {/* Back to the visitor's own area, not a fixed target: a reporter belongs
              in the portal, a agent who overreached into `/admin` belongs in the
              queue. Sending everyone to `/customer/new` would answer "wrong rights"
              with "here, file a ticket". */}
          <CardContent className="flex flex-wrap gap-2">
            <Button
              asChild
              className="rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              <Link href={homeFor(user?.role)}>
                {user && canViewBoard(user.role) ? "Zur Queue" : "Zum Portal"}
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              <Link href="/customer/tickets">Meine Tickets</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
