import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteCIButton } from "@/components/cmdb/delete-ci-button";
import { CIForm } from "@/components/cmdb/ci-form";
import { CIRelations } from "@/components/cmdb/ci-relations";
import { SeatBar } from "@/components/cmdb/seat-bar";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { SidebarSections } from "@/components/layout/sidebar-section";
import { SplitView } from "@/components/layout/split-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireArea, requireRole } from "@/lib/auth/session";
import {
  getConfigurationItem,
  listConfigurationItems,
  listRelationsFor,
  seatUsageFor,
  ticketIdsForCI,
} from "@/lib/cmdb";
import { isFeatureEnabled } from "@/lib/features";
import { formatDate, formatDateTime } from "@/lib/format";
import { listActiveLocations, listLocations } from "@/lib/locations";
import { listActiveOrganizations, listOrganizations } from "@/lib/organizations";
import { getSystemTimezone } from "@/lib/system-settings";
import { getTicketFor } from "@/lib/tickets";
import { listUsers } from "@/lib/users";
import {
  CI_STATUS_LABELS,
  CI_TYPE_LABELS,
  TICKET_STATUS_LABELS,
  expiryState,
  formatInventoryNumber,
  formatTicketNumber,
} from "@/types/mits";

export const metadata: Metadata = {
  title: "Objekt — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   One configuration item.

   Split view, same frame as the ticket detail: the record on the left, everything about
   its context — relations, licence seats, tickets — on the right. The two columns scroll
   independently, so reading a long attribute list does not push the relation panel away.

   Tickets are resolved through `getTicketFor` per id rather than joined. The page is
   already behind `requireRole("agent")`, so the scope is the same either way; going
   through the one function that knows the visibility rule means it stays that way if the
   page is ever opened wider.
   ────────────────────────────────────────────────────────────────────────── */

export default async function CIDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("agent", `/mits/cmdb/${id}`);
  requireArea("mits_cmdb", user.role);

  if (!isFeatureEnabled("feature_cmdb")) notFound();

  const item = getConfigurationItem(id);
  if (!item) notFound();

  const timezone = getSystemTimezone();
  const relations = listRelationsFor(id);
  const candidates = listConfigurationItems().filter(
    (candidate) => candidate.id !== id,
  );

  const organizations = listOrganizations();
  const locations = listLocations();
  const people = listUsers().map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
  }));

  const organization = item.organization_id
    ? organizations.find((entry) => entry.id === item.organization_id)
    : undefined;
  const location = item.location_id
    ? locations.find((entry) => entry.id === item.location_id)
    : undefined;
  const holder = item.assigned_user_id
    ? people.find((entry) => entry.id === item.assigned_user_id)
    : undefined;

  const tickets = ticketIdsForCI(id)
    .map((ticketId) => getTicketFor(ticketId, user))
    .filter((ticket) => ticket !== null);

  const seats = item.type === "license" ? seatUsageFor(id, item.seats_total) : null;
  const expiry = expiryState(item.expires_at, new Date());

  const facts: { label: string; value: string }[] = [
    { label: "Art", value: CI_TYPE_LABELS[item.type] },
    { label: "Zustand", value: CI_STATUS_LABELS[item.status] },
    // Two numbers, and they answer different questions: the first is the one MITS
    // gave the object, the second whatever was already written on it.
    {
      label: "Inventarnummer",
      value: formatInventoryNumber(item.inventory_number),
    },
    { label: "Fremdnummer", value: item.asset_tag || "—" },
    { label: "Hersteller", value: item.manufacturer || "—" },
    { label: "Modell", value: item.model || "—" },
    { label: "Seriennummer", value: item.serial_number || "—" },
    { label: "Firma", value: organization?.name ?? "—" },
    { label: "Standort", value: location?.name ?? "—" },
    { label: "Zugeordnet an", value: holder?.name ?? "—" },
    {
      label: "Angeschafft",
      value: item.purchased_on
        ? formatDate(new Date(`${item.purchased_on}T00:00:00Z`), timezone)
        : "—",
    },
    {
      label: "Garantie bis",
      value: item.warranty_until
        ? formatDate(new Date(`${item.warranty_until}T00:00:00Z`), timezone)
        : "—",
    },
  ];

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
          <SplitView
            sidebarLabel="Kontext"
            header={
              <>
                <BackLink href="/mits/cmdb" label="Zurück zur CMDB" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full font-normal">
                    {CI_TYPE_LABELS[item.type]}
                  </Badge>
                  <Badge variant="outline" className="rounded-full font-normal">
                    {CI_STATUS_LABELS[item.status]}
                  </Badge>
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
                      Läuft ab
                    </Badge>
                  )}
                  {seats?.overbooked && (
                    <Badge
                      variant="outline"
                      className="rounded-full border-destructive/40 font-normal text-destructive"
                    >
                      Überbelegt
                    </Badge>
                  )}
                </div>
                <h1 className="mt-2 text-2xl font-normal tracking-tight sm:text-3xl">
                  {item.name}
                </h1>
              </>
            }
            main={
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
                <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-border p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {facts.map((fact) => (
                    <div key={fact.label} className="grid gap-0.5">
                      <dt className="label-industrial">{fact.label}</dt>
                      <dd className="truncate text-sm">{fact.value}</dd>
                    </div>
                  ))}
                </dl>

                {Object.keys(item.attributes).length > 0 && (
                  <div className="rounded-2xl border border-border p-5">
                    <span className="label-industrial">Eigenschaften</span>
                    <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      {Object.entries(item.attributes).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0"
                        >
                          <dt className="text-xs text-muted-foreground">{key}</dt>
                          <dd className="truncate text-right text-sm">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {item.note && (
                  <div className="rounded-2xl border border-border p-5">
                    <span className="label-industrial">Notiz</span>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                      {item.note}
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-border p-5">
                  <span className="label-industrial">
                    Tickets ({tickets.length})
                  </span>
                  {tickets.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Noch kein Ticket zu diesem Objekt.
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-2">
                      {tickets.map((ticket) => (
                        <li key={ticket.id}>
                          <Link
                            href={`/mits/tickets/${ticket.id}`}
                            className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 hover:border-foreground/20"
                          >
                            <span className="font-mono text-xs text-muted-foreground">
                              {ticket.ticket_number
                                ? formatTicketNumber(ticket.ticket_number)
                                : "—"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {ticket.title}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {TICKET_STATUS_LABELS[ticket.status]}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Angelegt {formatDateTime(item.created_at, timezone)} · geändert{" "}
                  {formatDateTime(item.updated_at, timezone)}
                </p>
              </div>
            }
            sidebar={
              <SidebarSections
                defaultOpen={["actions", "relations"]}
                sections={[
                  {
                    id: "actions",
                    title: "Objekt",
                    content: (
                      <div className="grid gap-2">
                        <CIForm
                          item={item}
                          organizations={listActiveOrganizations()}
                          locations={listActiveLocations()}
                          people={people}
                          trigger={
                            <Button
                              size="sm"
                              className="w-full rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                            >
                              <PencilIcon strokeWidth={1.5} />
                              Bearbeiten
                            </Button>
                          }
                        />
                        <DeleteCIButton itemId={item.id} name={item.name} />
                      </div>
                    ),
                  },
                  ...(seats
                    ? [
                        {
                          id: "seats",
                          title: "Lizenzplätze",
                          badge: (
                            <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                              {seats.untracked
                                ? "—"
                                : `${seats.used}/${seats.total}`}
                            </span>
                          ),
                          content: (
                            <div className="grid gap-2">
                              <SeatBar seats={seats} />
                              {item.expires_at && (
                                <p className="text-xs text-muted-foreground">
                                  Läuft ab am{" "}
                                  {formatDate(
                                    new Date(`${item.expires_at}T00:00:00Z`),
                                    timezone,
                                  )}
                                </p>
                              )}
                            </div>
                          ),
                        },
                      ]
                    : []),
                  {
                    id: "relations",
                    title: "Beziehungen",
                    badge: (
                      <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                        {relations.length}
                      </span>
                    ),
                    content: (
                      <CIRelations
                        itemId={item.id}
                        relations={relations.map((entry) => ({
                          id: entry.relation.id,
                          kind: entry.relation.kind,
                          inverted: entry.inverted,
                          other: entry.other,
                        }))}
                        candidates={candidates}
                      />
                    ),
                  },
                ]}
              />
            }
          />
        </div>
      </main>
    </>
  );
}
