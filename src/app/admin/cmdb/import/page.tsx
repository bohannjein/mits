import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CMDBImportForm } from "@/components/admin/cmdb-import-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { listLocations } from "@/lib/locations";
import { listOrganizations } from "@/lib/organizations";
import { InfoIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "CMDB-Import — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Bulk import.

   Admin, not agent: the import rewrites existing records in one go, which is a
   different act from correcting one asset.

   The note about companies and sites is there because it is the one thing that silently
   halves the value of an import: references resolve by name or code, so an export naming
   companies MITS does not know yet imports assets with no owner. It is fixable
   afterwards, but knowing beforehand saves the second run.
   ────────────────────────────────────────────────────────────────────────── */

export default async function CMDBImportPage() {
  await requireRole("admin", "/admin/cmdb/import");

  if (!isFeatureEnabled("feature_cmdb")) notFound();

  const organizations = listOrganizations().length;
  const locations = listLocations().length;

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              CMDB-Import
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Bestandsdaten aus OTRS oder einer Tabelle übernehmen.
            </p>

            {/*
              Named here because it is a workflow nobody guesses: the CSV the CMDB
              exports is this page's own input format, so „exportieren, in Excel
              korrigieren, zurückspielen" is the way to fix four hundred rows. Not a
              field hint — it is what the page is for on the second visit.
            */}
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Ein CSV-Export aus der CMDB lässt sich unverändert wieder einlesen.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          <div className="grid gap-6">
            <Alert className="rounded-2xl border-border px-4 py-3">
              <InfoIcon strokeWidth={1.5} />
              <AlertDescription>
                Zeilen mit bekannter Inventarnummer werden aktualisiert, nicht doppelt
                angelegt. Firma und Standort werden über Name oder Kurzcode zugeordnet —
                zurzeit sind {organizations} Firma/Firmen und {locations} Standort(e)
                hinterlegt.
              </AlertDescription>
            </Alert>

            <CMDBImportForm />
          </div>
        </div>
      </main>
    </>
  );
}
