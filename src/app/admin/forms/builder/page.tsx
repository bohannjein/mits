import type { Metadata } from "next";

import { SchemaBuilder } from "@/components/admin/schema-builder";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { listSchemaInfos } from "@/lib/form-schemas";
import { listActiveLocations } from "@/lib/locations";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Formular-Builder — MITS",
};

export default async function FormBuilderPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/forms/builder");

  const infos = listSchemaInfos();
  const existing = infos.map((info) => ({
    id: info.schema.id,
    title: info.schema.title,
    builtIn: info.builtIn,
  }));
  const stored = infos.filter((info) => info.overridden).length;

  // Gates authoring of conditions and cascades, not their evaluation — see the
  // note the inspector renders when it is off.
  const advanced = isFeatureEnabled("feature_advanced_form_builder");

  // Same choices the intake hands its pickers, so the preview shows the dropdowns
  // a reporter will actually see rather than two empty selects. Users are reduced
  // to id and name; a form preview has no business carrying the staff directory.
  const fieldOptions = {
    locations: listActiveLocations().map((location) => ({
      value: location.id,
      label: location.code ? `${location.name} (${location.code})` : location.name,
    })),
    users: listUsers().map((candidate) => ({
      value: candidate.id,
      label: candidate.name,
    })),
  };

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-7xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Formular-Builder
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Ticket-Typen sind Daten, kein Code. Was hier gespeichert wird,
                erscheint sofort im Service-Katalog und wird der KI-Triage als
                Zielschema angeboten.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {infos.length} Formulare · {stored} aus der Datenbank
              </Badge>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <SchemaBuilder
            existing={existing}
            advanced={advanced}
            fieldOptions={fieldOptions}
          />
        </div>
      </main>
    </>
  );
}
