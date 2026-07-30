import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, KeyRoundIcon, ShieldAlertIcon } from "lucide-react";

import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { AppHeader } from "@/components/layout/app-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireUserForPasswordChange } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Profil — MITS",
};

/**
 * Own profile and password.
 *
 * The one page that uses `requireUserForPasswordChange` instead of `requireUser`:
 * an account with `must_change_password` is redirected here by every other
 * guard, so this page must be reachable while the gate is closed — otherwise the
 * redirect would loop.
 */
export default async function ProfilePage() {
  const user = await requireUserForPasswordChange();

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Profil
              </h1>
              <p className="mt-2 text-muted-foreground">
                {user.email} ·{" "}
                <Badge
                  variant="outline"
                  className="h-auto rounded-full px-2.5 py-0.5 align-middle font-normal"
                >
                  {ROLE_LABELS[user.role]}
                </Badge>
              </p>
            </div>
            {/* Hidden while the gate is closed: there is nowhere else to go. */}
            {!user.mustChangePassword && (
              <Button
                asChild
                size="sm"
                className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
              >
                <Link href="/">
                  <ArrowLeftIcon strokeWidth={1.5} />
                  Portal
                </Link>
              </Button>
            )}
          </div>

          <Separator className="my-8 bg-border" />

          {user.mustChangePassword && (
            <Alert
              variant="destructive"
              className="mb-6 rounded-2xl border-destructive px-4 py-3"
            >
              <ShieldAlertIcon strokeWidth={1.5} />
              <AlertTitle>Passwort muss geändert werden</AlertTitle>
              <AlertDescription>
                Dieses Konto wurde automatisch angelegt und benutzt noch das
                dokumentierte Standardpasswort — das ist öffentlich bekannt.
                Bis ein neues Passwort gesetzt ist, kann das Konto nichts
                anderes tun: keine Tickets, kein Board, keine Administration.
              </AlertDescription>
            </Alert>
          )}

          <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
            <CardHeader>
              <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                <KeyRoundIcon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <CardTitle className="mt-4 text-lg font-medium">
                Passwort ändern
              </CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                Andere Sitzungen dieses Kontos werden dabei beendet — wer sich
                mit dem alten Passwort angemeldet hat, ist danach ausgeloggt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordChangeForm forced={user.mustChangePassword} />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
