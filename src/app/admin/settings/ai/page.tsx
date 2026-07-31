import type { Metadata } from "next";
import { InfoIcon } from "lucide-react";

import { AISettingsForm } from "@/components/admin/ai-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  describeAISettingsSource,
  getEffectiveAISettings,
  getStoredAISettings,
} from "@/lib/ai-settings";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "KI-Einstellungen — MITS",
};

export default async function AISettingsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/settings/ai");

  const stored = getStoredAISettings();
  const effective = getEffectiveAISettings();
  const source = describeAISettingsSource();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                KI-Einstellungen
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Ollama-Adresse und Modelle werden hier gepflegt, nicht in
                Umgebungsvariablen. Änderungen greifen ab der nächsten Anfrage.
              </p>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
            <InfoIcon />
            <AlertTitle>Wie die Werte gelesen werden</AlertTitle>
            <AlertDescription>
              Pro Feld gilt: Wert aus dieser Maske → sonst Umgebungsvariable →
              sonst eingebauter Standard. Ein leeres Feld ist also kein Fehler,
              sondern heißt „Fallback nutzen“. Das KI-Backend hält selbst keine
              Konfiguration; es bekommt beide Modelle und die URL mit jeder
              Anfrage übergeben.
            </AlertDescription>
          </Alert>

          <AISettingsForm
            stored={stored}
            effective={effective}
            source={source}
          />
        </div>
      </main>
    </>
  );
}
