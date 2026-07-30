"use client";

import { FilterXIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TicketPriority,
  TicketPriorityValues,
  TicketStatus,
  type MITSLocation,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Deep filters.

   A client component only because the shadcn Select is one. It still submits as a
   plain GET form — Radix renders a hidden native select for the `name` prop — so
   the filtered view stays a shareable URL rather than client state.

   "Any" needs a sentinel: an empty string is not a legal Radix Select value, and
   an unset filter has to be distinguishable from one set to the empty string.
   ────────────────────────────────────────────────────────────────────────── */

const ANY = "__any";
const UNASSIGNED = "__unassigned";

export interface TicketFilterValues {
  q?: string;
  locationId?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  from?: string;
  to?: string;
}

export function TicketFilters({
  action,
  values,
  locations,
  /** Empty for a reporter — they have no assignee to filter by. */
  agents = [],
  activeCount,
}: {
  action: string;
  values: TicketFilterValues;
  locations: MITSLocation[];
  agents?: { id: string; name: string }[];
  activeCount: number;
}) {
  return (
    <form
      action={action}
      method="get"
      className="grid gap-4 rounded-2xl border border-border bg-card px-5 py-4"
    >
      {/* Carried along so filtering does not silently drop the search term. */}
      <input type="hidden" name="q" value={values.q ?? ""} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontalIcon className="size-4 text-muted-foreground" strokeWidth={1.5} />
          Filter
        </span>
        {activeCount > 0 && (
          <Badge variant="outline" className="h-auto rounded-full px-2.5 py-0.5 font-normal">
            {activeCount} aktiv
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locations.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="filter-location">Standort</Label>
            <Select name="locationId" defaultValue={values.locationId || ANY}>
              <SelectTrigger id="filter-location" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Alle</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.code ? `${location.code} — ${location.name}` : location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="filter-status">Status</Label>
          <Select name="status" defaultValue={values.status || ANY}>
            <SelectTrigger id="filter-status" className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Alle</SelectItem>
              {TicketStatus.options.map((status) => (
                <SelectItem key={status} value={status}>
                  {TICKET_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="filter-priority">Priorität</Label>
          <Select name="priority" defaultValue={values.priority || ANY}>
            <SelectTrigger id="filter-priority" className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Alle</SelectItem>
              {TicketPriorityValues.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {TICKET_PRIORITY_LABELS[priority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {agents.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="filter-agent">Bearbeitung</Label>
            <Select name="assignedTo" defaultValue={values.assignedTo || ANY}>
              <SelectTrigger id="filter-agent" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Alle</SelectItem>
                <SelectItem value={UNASSIGNED}>Nicht zugewiesen</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="filter-from">Erstellt ab</Label>
          <Input
            id="filter-from"
            name="from"
            type="date"
            defaultValue={values.from ?? ""}
            className="h-10 rounded-xl"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="filter-to">Erstellt bis</Label>
          <Input
            id="filter-to"
            name="to"
            type="date"
            defaultValue={values.to ?? ""}
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
        >
          Anwenden
        </Button>
        {(activeCount > 0 || values.q) && (
          <Button
            asChild
            variant="ghost"
            className="h-10 rounded-full px-4 text-muted-foreground"
          >
            {/* A link, not a reset button: reset would restore the form's defaults,
                which are the currently applied filters. */}
            <Link href={action}>
              <FilterXIcon strokeWidth={1.5} />
              Zurücksetzen
            </Link>
          </Button>
        )}
      </div>
    </form>
  );
}
