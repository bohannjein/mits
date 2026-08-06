import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CIForm } from "@/components/cmdb/ci-form";
import { SeatBar } from "@/components/cmdb/seat-bar";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireArea, requireRole } from "@/lib/auth/session";
import { listLicences } from "@/lib/cmdb";
import { isFeatureEnabled } from "@/lib/features";
import { formatDate } from "@/lib/format";
import { listActiveLocations } from "@/lib/locations";
import { listActiveOrganizations, listOrganizations } from "@/lib/organizations";
import { getSystemTimezone } from "@/lib/system-settings";
import { listUsers } from "@/lib/users";
import {
  LICENCE_EXPIRY_WARN_DAYS,
  expiryState,
  formatInventoryNumber,
} from "@/types/mits";

export const metadata: Metadata = {
  title: "Lizenzen — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Licence manager.

   The same items as the CMDB overview, filtered to `license` and enriched with the seat
   count. Its own page rather than a column on the overview because the questions are
   different: the inventory asks "which device", this asks "are we compliant and what
   runs out next".

   Sorted by how much attention a row needs — overbooked, then expired, then expiring,
   then the rest. A licence page ordered alphabetically makes the reader do the triage
   the page exists to do.
   ────────────────────────────────────────────────────────────────────────── */

export default async function LicencesPage() {
  const viewer = await requireRole("agent", "/mits/cmdb/licenses");
  requireArea("mits_cmdb", viewer.role);

  if (!isFeatureEnabled("feature_cmdb")) notFound();

  const timezone = getSystemTimezone();
  const now = new Date();
  const organizationNames = Object.fromEntries(
    listOrganizations().map((organization) => [organization.id, organization.name]),
  );
  const people = listUsers().map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
  }));

  const records = listLicences().map((record) => ({
    ...record,
    expiry: expiryState(record.item.expires_at, now),
  }));

  const rank = (record: (typeof records)[number]): number => {
    if (record.seats.overbooked) return 0;
    if (record.expiry === "expired") return 1;
    if (record.expiry === "soon") return 2;
    return 3;
  };
  records.sort(
    (a, b) => rank(a) - rank(b) || a.item.name.localeCompare(b.item.name, "de"),
  );

  const overbooked = records.filter((record) => record.seats.overbooked).length;
  const expiring = records.filter(
    (record) => record.expiry === "soon" || record.expiry === "expired",
  ).length;
  const seatsTotal = records.reduce((sum, record) => sum + record.seats.total, 0);
  const seatsUsed = records.reduce((sum, record) => sum + record.seats.used, 0);

  return (
    <>
      <AppHeader />
      {/*
        Bounded from `lg` up only. Below that SplitView stacks the sidebar under
        the content instead of making it a column, and that stack lives outside
        both inner scroll zones — clipping it on a phone would put it out of
        reach entirely. There the page scrolls the way a page does.
      */}
      <main className="flex flex-1 flex-col items-center px-6 py-8 lg:min-h-0 lg:overflow-hidden">
        <div className="flex w-full max-w-5xl flex-1 flex-col lg:min-h-0">
          <div className="shrink-0">
            <BackLink href="/mits/cmdb" label="Zurück zur CMDB" />

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                  Lizenzen
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {records.length} {records.length === 1 ? "Lizenz" : "Lizenzen"} ·{" "}
                  {seatsUsed} von {seatsTotal} Plätzen belegt.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {overbooked > 0 && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-destructive/40 text-destructive"
                  >
                    {overbooked} überbelegt
                  </Badge>
                )}
                {expiring > 0 && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-warning/40 text-warning"
                  >
                    {expiring} laufen ab
                  </Badge>
                )}

                <CIForm
                  organizations={listActiveOrganizations()}
                  locations={listActiveLocations()}
                  people={people}
                  trigger={
                    <Button
                      size="sm"
                      className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                    >
                      <PlusIcon strokeWidth={1.5} />
                      Objekt anlegen
                    </Button>
                  }
                />
              </div>
            </div>

            <Separator className="my-6 bg-border" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {records.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Noch keine Lizenz erfasst. Ein Objekt der Art „Lizenz“ erscheint hier.
              </p>
            ) : (
              <ul className="grid gap-3">
                {records.map(({ item, seats, expiry }) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/mits/cmdb/${item.id}`}
                          className="block truncate text-sm font-medium hover:underline"
                        >
                          {item.name}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[
                            formatInventoryNumber(item.inventory_number),
                            item.manufacturer,
                            item.organization_id
                              ? organizationNames[item.organization_id]
                              : null,
                            item.asset_tag,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Keine weiteren Angaben"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {seats.overbooked && (
                          <Badge
                            variant="outline"
                            className="rounded-full border-destructive/40 font-normal text-destructive"
                          >
                            Überbelegt
                          </Badge>
                        )}
                        {expiry === "expired" && (
                          <Badge
                            variant="outline"
                            className="rounded-full border-destructive/40 font-normal text-destructive"
                          >
                            Abgelaufen
                          </Badge>
                        )}
                        {expiry === "soon" && (
                          <Badge
                            variant="outline"
                            className="rounded-full border-warning/40 font-normal text-warning"
                          >
                            Läuft in unter {LICENCE_EXPIRY_WARN_DAYS} Tagen ab
                          </Badge>
                        )}
                        {item.expires_at && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(
                              new Date(`${item.expires_at}T00:00:00Z`),
                              timezone,
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <SeatBar seats={seats} className="mt-3" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
