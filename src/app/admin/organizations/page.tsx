import type { Metadata } from "next";

import { OrganizationsForm } from "@/components/admin/organizations-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { listOrganizations, organizationCounts } from "@/lib/organizations";

export const metadata: Metadata = {
  title: "Firmen — MITS",
};

export default async function AdminOrganizationsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/organizations");

  const organizations = listOrganizations();
  const counts = organizationCounts();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">Firmen</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Eigentümer von Objekten in der CMDB und Zuordnung für Anwender.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          <OrganizationsForm organizations={organizations} counts={counts} />
        </div>
      </main>
    </>
  );
}
