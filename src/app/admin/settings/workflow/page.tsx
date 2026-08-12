import type { Metadata } from "next";
import { InfoIcon } from "lucide-react";

import { WorkflowSettingsForm } from "@/components/admin/workflow-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getWorkflowSettings } from "@/lib/workflow-settings";
import { hasAutoClose } from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket-Ablauf — MITS",
};

export default async function WorkflowSettingsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/settings/workflow");

  const settings = getWorkflowSettings();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Ticket-Ablauf
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Was eine Antwort am Ticket bewegt, und was mit Tickets passiert, auf
              die niemand mehr reagiert.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {/*
            Die eine Auskunft, die nirgendwo sonst steht und ohne die eine
            eingestellte Frist scheinbar nichts tut: das Aufräumen braucht einen
            Anstoß von außen. Kein Erklärtext zur Architektur — der Satz ist die
            Antwort auf „ich habe sieben Tage eingestellt und es passiert nichts".
          */}
          {hasAutoClose(settings) && (
            <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
              <InfoIcon strokeWidth={1.5} />
              <AlertTitle>Braucht einen täglichen Aufruf</AlertTitle>
              <AlertDescription>
                Das Aufräumen läuft nicht von selbst. Ein Scheduler muss einmal
                täglich <code>POST /api/cron/workflow</code> aufrufen, mit dem
                Service-Token im Kopf <code>X-MITS-Service-Token</code>.
              </AlertDescription>
            </Alert>
          )}

          <WorkflowSettingsForm settings={settings} />
        </div>
      </main>
    </>
  );
}
