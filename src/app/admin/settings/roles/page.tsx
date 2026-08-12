import type { Metadata } from "next";
import Link from "next/link";
import { EyeIcon, InfoIcon } from "lucide-react";

import {
  RoleVisibilityForm,
  type FormEntry,
} from "@/components/admin/role-visibility-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RESTRICTABLE_ROLES } from "@/types/mits";
import { requireRole } from "@/lib/auth/session";
import { listSchemaInfos } from "@/lib/form-schemas";
import { QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
import { getRoleVisibility } from "@/lib/role-visibility";
import { listVisibilityPresets } from "@/lib/visibility-presets";

export const metadata: Metadata = {
  title: "Sichtbarkeit — MITS",
};

export default async function RoleVisibilitySettingsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/settings/roles");

  /*
   * Der volle Bestand, nicht nur der Katalog: das Freitext-Formular ist der
   * Reiter „Schnellerstellung", und ohne es in dieser Liste gäbe es keinen Weg,
   * ihn einer Rolle abzunehmen.
   */
  const forms: FormEntry[] = listSchemaInfos().map((info) => ({
    id: info.schema.id,
    title: info.schema.title,
    category: info.schema.category,
    fallback: info.schema.id === QUICK_TICKET_SCHEMA.id,
  }));

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Sichtbarkeit
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Was Benutzer und Agenten zu sehen bekommen. Voreingestellt ist
                alles sichtbar; hier wird weggenommen.
              </p>
            </div>

            {/*
              Der Weg zum Ergebnis. Das war die Einstellung mit dem größten
              Abstand zwischen Klick und Wirkung: prüfen konnte man sie nur, indem
              man sich ein Testkonto anlegte.
            */}
            <div className="flex flex-wrap gap-2">
              {RESTRICTABLE_ROLES.map((role) => (
                <Button
                  key={role}
                  asChild
                  size="sm"
                  className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                >
                  <Link href={`/customer?preview=${role}`}>
                    <EyeIcon strokeWidth={1.5} />
                    Portal als {role === "user" ? "Anwender" : "Agent"}
                  </Link>
                </Button>
              ))}
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
            <InfoIcon strokeWidth={1.5} />
            <AlertTitle>Die Administration steht nicht zur Wahl</AlertTitle>
            <AlertDescription>
              Diese Maske liegt selbst unter /admin. Eine Rolle, die sich den Weg
              hierher nehmen könnte, würde die Instanz aussperren — deshalb sieht
              die Administration immer alles.
            </AlertDescription>
          </Alert>

          <RoleVisibilityForm
            visibility={getRoleVisibility()}
            forms={forms}
            presets={listVisibilityPresets()}
          />
        </div>
      </main>
    </>
  );
}
