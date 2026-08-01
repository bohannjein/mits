import type { Metadata } from "next";
import Link from "next/link";
import { InfoIcon } from "lucide-react";

import { AnalyticsSettingsForm } from "@/components/admin/analytics-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { getAnalyticsSettings } from "@/lib/analytics/settings";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Statistik-Einstellungen — MITS",
};

export default async function AnalyticsSettingsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/settings/analytics");

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Statistiken
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Welche Kacheln das Panel zeigt und womit es startet.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {/*
            Two things worth saying before the switches, because both surprise
            people: the panel is agent territory, and two of the figures come out
            of the audit log rather than a column — so a fresh instance has an
            honest but small sample.
          */}
          <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
            <InfoIcon strokeWidth={1.5} />
            <AlertTitle>Woher die Zahlen kommen</AlertTitle>
            <AlertDescription>
              Lösungszeit und Erstreaktion werden aus der Ticket-Historie
              gerechnet, nicht aus einer gespeicherten Spalte. Tickets, die vor
              Einführung der Historie geschlossen wurden, zählen deshalb nicht
              mit — das Panel nennt jeweils die Datenbasis. Alle Zeiträume sind
              UTC. Das Panel liegt unter{" "}
              <Link href="/mits/analytics">/mits/analytics</Link> und ist für
              Anwender gesperrt.
            </AlertDescription>
          </Alert>

          <AnalyticsSettingsForm settings={getAnalyticsSettings()} />
        </div>
      </main>
    </>
  );
}
