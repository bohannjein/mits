import { InfoIcon } from "lucide-react";
import type { Metadata } from "next";

import {
  TeamSettingsForm,
  type TeamAgentRow,
} from "@/components/admin/team-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { getTeamSettings, listAgentCapacities } from "@/lib/team-settings";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Team-Übersicht — MITS",
};

export default async function TeamSettingsPage() {
  await requireRole("admin", "/admin/settings/team");

  const flags = getFeatureFlags();
  const capacities = listAgentCapacities();

  // Nur Konten, die die Übersicht füllen — ein Melder hat keine Zuweisungen.
  const agents: TeamAgentRow[] = listUsers()
    .filter((account) => canViewBoard(account.role))
    .map((account) => ({
      id: account.id,
      name: account.name,
      email: account.email,
      capacity: capacities.get(account.id) ?? null,
    }));

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Team-Übersicht
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Welche Angaben auf der Seite stehen und woran die Auslastung
              gemessen wird.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {!flags.feature_team_overview && (
            <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
              <InfoIcon strokeWidth={1.5} />
              <AlertTitle>Das Modul ist aus</AlertTitle>
              <AlertDescription>
                Unter „Module“ ist <code>Team-Übersicht</code> ausgeschaltet, die
                Seite antwortet also mit 404. Die Einstellungen hier lassen sich
                trotzdem vorbereiten.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
            <InfoIcon strokeWidth={1.5} />
            <AlertTitle>Wer die Seite sieht</AlertTitle>
            <AlertDescription>
              Ob eine Rolle die Team-Übersicht überhaupt bekommt, steht unter{" "}
              <a
                href="/admin/settings/roles"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Sichtbarkeit je Rolle
              </a>
              .
            </AlertDescription>
          </Alert>

          <TeamSettingsForm settings={getTeamSettings()} agents={agents} />
        </div>
      </main>
    </>
  );
}
