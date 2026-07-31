"use client";

import { MapPinIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MITSLocation } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Site selector, once above the intake tabs.

   Not a schema field: it is the same question whichever of the three modes
   produced the ticket, and putting it in every form schema would mean every
   admin-authored form had to remember it.

   Renders nothing when no location exists, so an instance that never set up
   branches does not show an empty dropdown.
   ────────────────────────────────────────────────────────────────────────── */

/** Radix Select has no empty-string value, so "unspecified" needs a sentinel. */
const NONE = "__none";

export function LocationPicker({
  locations,
  value,
  onChange,
  disabled,
}: {
  locations: MITSLocation[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  if (locations.length === 0) return null;

  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-card px-4 py-3.5">
      <Label htmlFor="ticket-location" className="flex items-center gap-2">
        <MapPinIcon className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
        Standort
      </Label>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger id="ticket-location" className="h-10 w-full rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Keine Angabe</SelectItem>
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.code ? `${location.code} — ${location.name}` : location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
