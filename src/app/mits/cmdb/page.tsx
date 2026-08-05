import { DownloadIcon, KeyRoundIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CIFilters } from "@/components/cmdb/ci-filters";
import { CIForm } from "@/components/cmdb/ci-form";
import { CITable } from "@/components/cmdb/ci-table";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { cmdbCounts, listConfigurationItems, type CIFilter } from "@/lib/cmdb";
import { isFeatureEnabled } from "@/lib/features";
import { listActiveLocations, listLocations } from "@/lib/locations";
import { listActiveOrganizations, listOrganizations } from "@/lib/organizations";
import { listUsers } from "@/lib/users";
import { CIStatus, CIType, CI_TYPE_LABELS } from "@/types/mits";

export const metadata: Metadata = {
  title: "CMDB — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Asset overview.

   Agent role and above. Filters live in the URL, so the list is narrowed in SQL and a
   filtered view can be sent to a colleague as a link.

   Names for owner, site and assignee are resolved once into maps and handed to the
   table — the alternative is a lookup per row, which is the N+1 that only bites on an
   instance with a real inventory.
   ────────────────────────────────────────────────────────────────────────── */

export default async function CMDBPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("agent", "/mits/cmdb");

  // A switched-off module has no pages, not just no links.
  if (!isFeatureEnabled("feature_cmdb")) notFound();

  const params = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  /*
   * Unknown values are dropped rather than passed through. A hand-typed `?type=laptop`
   * has to mean "no type filter", not "filter on something that matches nothing" — an
   * empty list is indistinguishable from a working filter with no hits.
   */
  const type = CIType.safeParse(one(params.type));
  const status = CIStatus.safeParse(one(params.status));

  const filter: CIFilter = {
    q: one(params.q),
    ...(type.success ? { type: type.data } : {}),
    ...(status.success ? { status: status.data } : {}),
    ...(one(params.org) ? { organizationId: one(params.org) } : {}),
  };

  const items = listConfigurationItems(filter);
  const counts = cmdbCounts();

  /*
   * The download link, carrying the same filter the list was built from.
   *
   * Built from `filter` rather than by forwarding `params`, so the export cannot be
   * narrowed by a parameter the page itself dropped as invalid — a hand-typed
   * `?type=laptop` shows the full list here and would otherwise export nothing.
   *
   * `organization_id` and not `org`: the REST route names it in full, and the page's
   * short form is its own. One rename, spelled out here, beats a second alias in the
   * route that exists only for this link.
   */
  const exportParams = new URLSearchParams({ format: "csv" });
  if (filter.q) exportParams.set("q", filter.q);
  if (filter.type) exportParams.set("type", filter.type);
  if (filter.status) exportParams.set("status", filter.status);
  if (filter.organizationId) {
    exportParams.set("organization_id", filter.organizationId);
  }
  const exportHref = `/api/v1/cmdb/items?${exportParams.toString()}`;

  const organizationNames = Object.fromEntries(
    listOrganizations().map((organization) => [organization.id, organization.name]),
  );
  const locationNames = Object.fromEntries(
    listLocations().map((location) => [location.id, location.name]),
  );
  const people = listUsers().map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
  }));
  const userNames = Object.fromEntries(
    people.map((person) => [person.id, person.name]),
  );

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
        <div className="flex w-full max-w-7xl flex-1 flex-col lg:min-h-0">
          <div className="shrink-0">
            <BackLink href="/mits" label="Zurück zur Queue" />

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                  CMDB
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {counts.total} {counts.total === 1 ? "Objekt" : "Objekte"} im Bestand
                  {items.length !== counts.total && ` · ${items.length} gefiltert`}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {CIType.options
                  .filter((type) => (counts.byType[type] ?? 0) > 0)
                  .map((type) => (
                    <Badge key={type} variant="outline" className="rounded-full">
                      {CI_TYPE_LABELS[type]} {counts.byType[type]}
                    </Badge>
                  ))}

                <Button
                  asChild
                  size="sm"
                  className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                >
                  <Link href="/mits/cmdb/licenses">
                    <KeyRoundIcon strokeWidth={1.5} />
                    Lizenzen
                  </Link>
                </Button>

                {/*
                  Exports what is on screen, not the whole inventory.

                  A button that ignored the filter would be the more surprising of
                  the two: somebody who has just narrowed the list to one company's
                  laptops is exporting those. The link carries the same parameters
                  the page was rendered with — an `<a>` and not a fetch, so the
                  browser's own download handling applies and a large sheet does not
                  sit in a JavaScript string first.
                */}
                <Button
                  asChild
                  size="sm"
                  className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                >
                  <a href={exportHref} download>
                    <DownloadIcon strokeWidth={1.5} />
                    CSV
                  </a>
                </Button>

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

            <CIFilters organizations={listActiveOrganizations()} />
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            {items.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                {counts.total === 0
                  ? "Noch kein Objekt erfasst."
                  : "Kein Objekt passt zu diesen Filtern."}
              </p>
            ) : (
              <CITable
                items={items}
                organizationNames={organizationNames}
                locationNames={locationNames}
                userNames={userNames}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
