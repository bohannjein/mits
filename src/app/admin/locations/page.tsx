import type { Metadata } from "next";

import { LocationsForm } from "@/components/admin/locations-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { listLocations, ticketCountsByLocation } from "@/lib/locations";

export const metadata: Metadata = {
  title: "Standorte — MITS",
};

export default async function AdminLocationsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/locations");

  const locations = listLocations();
  const ticketCounts = ticketCountsByLocation();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Standorte
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Stammdaten für Ticket-Zuordnung, Filter und Heatmap.
              </p>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <LocationsForm locations={locations} ticketCounts={ticketCounts} />
        </div>
      </main>
    </>
  );
}
