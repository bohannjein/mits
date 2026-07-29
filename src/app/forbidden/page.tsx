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
import { ROLE_LABELS } from "@/lib/auth/roles";

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
      <main className="bg-grid flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md rounded-sm border-2 border-border shadow-brutal ring-0">
          <CardHeader>
            <ShieldAlertIcon className="size-5 text-destructive" aria-hidden />
            <CardTitle className="mt-2 uppercase">Kein Zugriff</CardTitle>
            <CardDescription>
              {user
                ? `Dein Konto hat die Rolle „${ROLE_LABELS[user.role]}“ und darf diesen Bereich nicht öffnen.`
                : "Für diesen Bereich fehlen die Rechte."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="rounded-sm">
              <Link href="/tickets/new">Ticket erfassen</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-sm">
              <Link href="/tickets">Meine Tickets</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
