import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InfoIcon, LockIcon } from "lucide-react";

import { RegisterForm } from "@/components/auth/register-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { homeFor } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { ensureAuthSchema } from "@/lib/auth/server";
import { countUsers } from "@/lib/users";
import { getAuthSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Registrieren — MITS",
};

export default async function RegisterPage() {
  const signedIn = await getSessionUser();
  if (signedIn) redirect(homeFor(signedIn.role));

  // The user table has to exist before it can be counted.
  await ensureAuthSchema();

  const settings = getAuthSettings();
  const isBootstrap = countUsers() === 0;
  // The first account always gets through and becomes admin — otherwise an
  // instance shipped with registration disabled could never gain an administrator.
  const registrationOpen = settings.registrationEnabled || isBootstrap;

  if (!registrationOpen) {
    return (
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
        <CardHeader>
          <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
            <LockIcon className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <CardTitle className="mt-4 text-lg font-medium">
            Registrierung geschlossen
          </CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Die Selbstregistrierung wurde von der Administration deaktiviert.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Alert className="rounded-2xl border-border px-4 py-3">
            <InfoIcon strokeWidth={1.5} />
            <AlertTitle>Konto nötig?</AlertTitle>
            <AlertDescription>
              Wende dich an die IT-Administration — Konten werden dort angelegt.
            </AlertDescription>
          </Alert>
          <Button
            asChild
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
          >
            <Link href="/login">Zur Anmeldung</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Konto erstellen</CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          {isBootstrap
            ? "Erstes Konto dieser Instanz — es erhält automatisch Administrationsrechte."
            : "Registriere dich, um Tickets zu erfassen und ihren Stand zu verfolgen."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm allowedDomains={settings.allowedEmailDomains} />
      </CardContent>
    </Card>
  );
}
