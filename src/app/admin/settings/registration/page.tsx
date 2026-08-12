import type { Metadata } from "next";

import { RegistrationSettingsForm } from "@/components/admin/registration-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { ensureAuthSchema } from "@/lib/auth/server";
import { getAuthSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Anmeldung & Registrierung — MITS",
};

/**
 * Wer sich anlegen darf, wie lange eine Anmeldung gilt, und wer einen zweiten
 * Faktor braucht.
 *
 * Eigene Seite, obwohl das Formular vorher auf dem Desk stand. Der Desk trug
 * damit genau ein Formular und siebenundzwanzig Links — entweder Index oder
 * Seite, beides gleichzeitig ließ das eine Formular willkürlich aussehen. Jetzt
 * ist er ein Index, und diese Einstellung liegt da, wo die anderen liegen.
 *
 * `ensureAuthSchema` wie vorher auf dem Desk: die Maske schreibt in Werte, die
 * Better Auth beim nächsten Kontextaufbau liest, und ein Admin, der hier landet,
 * ist der wahrscheinlichste erste Besucher einer frischen Instanz.
 */
export default async function RegistrationSettingsPage() {
  await requireRole("admin", "/admin/settings/registration");
  await ensureAuthSchema();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Anmeldung &amp; Registrierung
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Wer sich selbst anlegen darf, wie lange eine Anmeldung gilt, und für
              wen ein zweiter Faktor Pflicht ist.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          <RegistrationSettingsForm settings={getAuthSettings()} />
        </div>
      </main>
    </>
  );
}
