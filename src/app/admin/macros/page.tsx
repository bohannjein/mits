import type { Metadata } from "next";
import Link from "next/link";
import { PowerOffIcon, TriangleAlertIcon } from "lucide-react";

import { MacrosForm } from "@/components/admin/macros-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { getFeatureFlags } from "@/lib/features";
import { listMacros } from "@/lib/macros";

export const metadata: Metadata = {
  title: "Makros — MITS",
};

export default async function MacrosPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/macros");

  const flags = getFeatureFlags();
  const cannedResponses = listCannedResponses();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Makros
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Ein Klick erledigt mehrere Schritte am Ticket: Status, Priorität,
                Zuweisung und Textbaustein.
              </p>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {/* Editable while the module is off — configuring first and switching on
              later is the normal order. */}
          {!flags.feature_macros && (
            <Alert
              variant="destructive"
              className="mb-6 rounded-2xl border-destructive px-4 py-3"
            >
              <PowerOffIcon strokeWidth={1.5} />
              <AlertTitle>Modul abgeschaltet</AlertTitle>
              <AlertDescription>
                Unter <Link href="/admin/settings/features">Module</Link> ist
                „Makros“ aus. Die Liste lässt sich pflegen, im Ticket erscheinen
                aber keine Schaltflächen.
              </AlertDescription>
            </Alert>
          )}

          {/* Said before the form rather than inside a disabled picker: a macro
              without a template is perfectly legal, so an empty list is only a
              problem for somebody who came here to build a reply macro. */}
          {cannedResponses.length === 0 && (
            <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertTitle>Keine Textbausteine hinterlegt</AlertTitle>
              <AlertDescription>
                Makros können Felder setzen, aber noch keine Antwort einsetzen.
                Bausteine werden unter{" "}
                <Link href="/admin/canned-responses">Textbausteine</Link> gepflegt.
              </AlertDescription>
            </Alert>
          )}

          <MacrosForm macros={listMacros()} cannedResponses={cannedResponses} />
        </div>
      </main>
    </>
  );
}
