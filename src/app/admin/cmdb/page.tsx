import { UploadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CMDBApiForm } from "@/components/admin/cmdb-api-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getApiToken } from "@/lib/api-tokens";
import { requireRole } from "@/lib/auth/session";
import { cmdbCounts } from "@/lib/cmdb";
import { isFeatureEnabled } from "@/lib/features";
import { listOrganizations } from "@/lib/organizations";

export const metadata: Metadata = {
  title: "CMDB-Verwaltung — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   CMDB administration: bulk import and the REST token.

   Separate from `/mits/cmdb`, which is where the inventory is worked with. What lives
   here changes how data gets in, which is an admin decision, not a technician's.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AdminCMDBPage() {
  await requireRole("admin", "/admin/cmdb");

  if (!isFeatureEnabled("feature_cmdb")) notFound();

  const counts = cmdbCounts();
  const organizations = listOrganizations().length;

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                CMDB-Verwaltung
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Datenübernahme und Schnittstelle. Der Bestand selbst wird unter
                /mits/cmdb gepflegt.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {counts.total} Objekte · {organizations} Firmen
              </Badge>
              <Button
                asChild
                size="sm"
                className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
              >
                <Link href="/admin/cmdb/import">
                  <UploadIcon strokeWidth={1.5} />
                  Import
                </Link>
              </Button>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {/* Whether a token exists, not the token — see the note in the form. */}
          <CMDBApiForm configured={getApiToken() !== null} />
        </div>
      </main>
    </>
  );
}
