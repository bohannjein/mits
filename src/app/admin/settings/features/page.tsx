import type { Metadata } from "next";
import { InfoIcon } from "lucide-react";

import { FeatureFlagsForm } from "@/components/admin/feature-flags-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";

export const metadata: Metadata = {
  title: "Module — MITS",
};

export default async function FeatureSettingsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/settings/features");

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
                Module
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Jede optionale Funktion einzeln an- oder abschaltbar. Änderungen
                greifen ab der nächsten Anfrage, ohne Neustart.
              </p>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
            <InfoIcon strokeWidth={1.5} />
            <AlertTitle>Ein Schalter blendet nicht nur aus</AlertTitle>
            <AlertDescription>
              Ein abgeschaltetes Modul verschwindet aus der Oberfläche <em>und</em>{" "}
              seine Server-Aktionen verweigern die Arbeit. Ein Client, der den
              Endpunkt direkt aufruft, kommt damit ebenfalls nicht durch — sonst
              wäre der Schalter reine Kosmetik.
            </AlertDescription>
          </Alert>

          <FeatureFlagsForm flags={flags} />
        </div>
      </main>
    </>
  );
}
