import type { Metadata } from "next";
import Link from "next/link";
import { InfoIcon, PowerOffIcon } from "lucide-react";

import { EmailSettingsForm } from "@/components/admin/email-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import {
  getEffectiveSmtpSettings,
  getStoredSmtpSettings,
} from "@/lib/smtp";
import { isSmtpConfigured } from "@/types/mits";

export const metadata: Metadata = {
  title: "E-Mail — MITS",
};

export default async function EmailSettingsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/settings/email");

  const effective = getEffectiveSmtpSettings();
  const stored = getStoredSmtpSettings();
  const flags = getFeatureFlags();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                E-Mail
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Versand für Eingangsbestätigungen und Antworten der Agenten.
              </p>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {/* The settings stay editable while the module is off — configuring in
              advance and switching on later is the normal order. */}
          {!flags.feature_email_notifications && (
            <Alert
              variant="destructive"
              className="mb-6 rounded-2xl border-destructive px-4 py-3"
            >
              <PowerOffIcon strokeWidth={1.5} />
              <AlertTitle>Modul abgeschaltet</AlertTitle>
              <AlertDescription>
                Unter <Link href="/admin/settings/features">Module</Link> ist
                „E-Mail-Benachrichtigungen“ aus. Diese Einstellungen lassen sich
                pflegen, es wird aber nichts automatisch versendet. Die Test-Mail
                unten funktioniert weiterhin.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
            <InfoIcon strokeWidth={1.5} />
            <AlertTitle>Was versendet wird</AlertTitle>
            <AlertDescription>
              Eine Bestätigung an den Melder, wenn ein Ticket eingeht, und eine
              Nachricht, wenn ein Agent <em>öffentlich</em> antwortet. Interne
              Notizen verlassen MITS nie. Ein fehlgeschlagener Versand lässt weder
              ein Ticket noch eine Antwort scheitern — er landet im Server-Log.
            </AlertDescription>
          </Alert>

          <EmailSettingsForm
            settings={effective}
            hasStoredPassword={stored.password !== ""}
            configured={isSmtpConfigured(effective)}
          />
        </div>
      </main>
    </>
  );
}
