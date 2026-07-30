"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveLocationsAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MITSLocation } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Locations master data.

   Submitted as the complete list; the server deletes rows that are gone. A
   deleted branch does not take its tickets with it — those keep the id and simply
   render without a site.
   ────────────────────────────────────────────────────────────────────────── */

export function LocationsForm({
  locations: initial,
  ticketCounts,
}: {
  locations: MITSLocation[];
  ticketCounts: Record<string, number>;
}) {
  const [locations, setLocations] = useState<MITSLocation[]>(initial);
  const [result, formAction, saving] = useActionState(saveLocationsAction, null);

  const patch = (id: string, next: Partial<MITSLocation>) =>
    setLocations((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)),
    );

  const unnamed = locations.filter((location) => !location.name.trim()).length;

  const duplicates = new Set(
    locations
      .map((location) => location.name.trim().toLowerCase())
      .filter((name, index, all) => name && all.indexOf(name) !== index),
  );

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Standorte</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Filialen und Betriebsstätten. Der Kurzcode erscheint in Listen und in
            der Heatmap. Ein inaktiver Standort ist für neue Tickets nicht mehr
            wählbar, bleibt aber an bestehenden erhalten.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch kein Standort. Ohne Standorte entfällt die Standort-Auswahl im
              Ticket und die Heatmap bleibt leer.
            </p>
          )}

          {locations.map((location) => {
            const count = ticketCounts[location.id] ?? 0;
            const isDuplicate = duplicates.has(
              location.name.trim().toLowerCase(),
            );

            return (
              <div
                key={location.id}
                className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end"
              >
                <div className="grid gap-2">
                  <Label htmlFor={`loc-name-${location.id}`}>Name</Label>
                  <Input
                    id={`loc-name-${location.id}`}
                    value={location.name}
                    onChange={(event) =>
                      patch(location.id, { name: event.target.value })
                    }
                    placeholder="z. B. Zentrale Hamburg"
                    aria-invalid={isDuplicate}
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`loc-code-${location.id}`}>Code</Label>
                  <Input
                    id={`loc-code-${location.id}`}
                    value={location.code}
                    onChange={(event) =>
                      patch(location.id, { code: event.target.value })
                    }
                    placeholder="HH"
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`loc-city-${location.id}`}>Ort</Label>
                  <Input
                    id={`loc-city-${location.id}`}
                    value={location.city}
                    onChange={(event) =>
                      patch(location.id, { city: event.target.value })
                    }
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={location.active}
                    onCheckedChange={(value) =>
                      patch(location.id, { active: value })
                    }
                    disabled={saving}
                    aria-label={`${location.name || "Standort"} auswählbar`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`„${location.name || "Standort"}“ entfernen`}
                    disabled={saving}
                    onClick={() =>
                      setLocations((current) =>
                        current.filter((entry) => entry.id !== location.id),
                      )
                    }
                    className="rounded-full"
                  >
                    <Trash2Icon strokeWidth={1.5} />
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground sm:col-span-4">
                  {count === 0
                    ? "Noch keine Tickets."
                    : `${count} Ticket(s) an diesem Standort — beim Entfernen bleiben sie erhalten, verlieren aber die Zuordnung.`}
                </p>
              </div>
            );
          })}

          <Button
            type="button"
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={saving}
            onClick={() =>
              setLocations((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  code: "",
                  city: "",
                  active: true,
                },
              ])
            }
          >
            <PlusIcon strokeWidth={1.5} />
            Standort hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input
          type="hidden"
          name="locations"
          value={JSON.stringify(locations)}
        />
        {result && (
          <Alert
            variant={result.ok ? "default" : "destructive"}
            className="rounded-2xl border-border px-4 py-3"
          >
            {result.ok ? (
              <CheckCircle2Icon strokeWidth={1.5} />
            ) : (
              <TriangleAlertIcon strokeWidth={1.5} />
            )}
            <AlertDescription>
              {result.ok ? result.message : result.error}
            </AlertDescription>
          </Alert>
        )}
        {(unnamed > 0 || duplicates.size > 0) && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>
              {unnamed > 0 && `${unnamed} Standort(e) ohne Namen. `}
              {duplicates.size > 0 &&
                `Doppelte Namen: ${[...duplicates].join(", ")}.`}
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || unnamed > 0 || duplicates.size > 0}
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
          {saving ? "Speichern …" : "Standorte speichern"}
        </Button>
      </form>
    </div>
  );
}
