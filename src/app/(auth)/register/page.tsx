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
import { getSessionUser } from "@/lib/auth/session";
import { ensureAuthSchema } from "@/lib/auth/server";
import { countUsers } from "@/lib/users";
import { getAuthSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Registrieren — MITS",
};

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/tickets/new");

  // The user table has to exist before it can be counted.
  await ensureAuthSchema();

  const settings = getAuthSettings();
  const isBootstrap = countUsers() === 0;
  // The first account always gets through and becomes admin — otherwise an
  // instance shipped with registration disabled could never gain an administrator.
  const registrationOpen = settings.registrationEnabled || isBootstrap;

  if (!registrationOpen) {
    return (
      <Card className="rounded-sm border-2 border-border shadow-brutal ring-0">
        <CardHeader>
          <LockIcon className="size-5 text-muted-foreground" aria-hidden />
          <CardTitle className="mt-2 uppercase">Registrierung geschlossen</CardTitle>
          <CardDescription>
            Die Selbstregistrierung wurde von der Administration deaktiviert.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Alert className="rounded-sm border-2">
            <InfoIcon />
            <AlertTitle>Konto nötig?</AlertTitle>
            <AlertDescription>
              Wende dich an die IT-Administration — Konten werden dort angelegt.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="w-fit rounded-sm">
            <Link href="/login">Zur Anmeldung</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-sm border-2 border-border shadow-brutal ring-0">
      <CardHeader>
        <CardTitle className="uppercase">Konto erstellen</CardTitle>
        <CardDescription>
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
