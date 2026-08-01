"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { saveConfigurationItemAction } from "@/app/mits/cmdb/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CIStatus,
  CIType,
  CI_ATTRIBUTE_LIMIT,
  CI_STATUS_LABELS,
  CI_TYPE_LABELS,
  NO_LOCATION,
  NO_ORGANIZATION,
  type MITSConfigurationItem,
  type MITSLocation,
  type MITSOrganization,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Create or edit one item.

   One mask for every asset kind, because there is one table. The licence block appears
   for `license` only — a seat count on a monitor is a field somebody will eventually
   fill in, and then the licence page counts a monitor.

   Attributes are edited as key/value pairs rather than as raw JSON. The builder has a
   JSON escape hatch because a form schema is a document; an asset is a record, and
   asking a agent to write JSON to note a MAC address is asking for a parse error.
   ────────────────────────────────────────────────────────────────────────── */

type Draft = Omit<MITSConfigurationItem, "created_at" | "updated_at">;

interface AttributeRow {
  key: string;
  value: string;
}

const EMPTY: Draft = {
  id: "",
  asset_tag: "",
  name: "",
  type: "hardware",
  status: "active",
  organization_id: null,
  location_id: null,
  assigned_user_id: null,
  manufacturer: "",
  model: "",
  serial_number: "",
  purchased_on: "",
  warranty_until: "",
  seats_total: 0,
  expires_at: "",
  note: "",
  attributes: {},
};

export function CIForm({
  item,
  organizations,
  locations,
  people,
  /** Rendered as the dialog trigger. A pill button on the overview, a link in a panel. */
  trigger,
}: {
  item?: MITSConfigurationItem;
  organizations: MITSOrganization[];
  locations: MITSLocation[];
  people: { id: string; name: string; email: string }[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(item ? toDraft(item) : { ...EMPTY });
  const [rows, setRows] = useState<AttributeRow[]>(
    item ? Object.entries(item.attributes).map(([key, value]) => ({ key, value })) : [],
  );
  const [result, formAction, saving] = useActionState(
    saveConfigurationItemAction,
    null,
  );

  const patch = (next: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...next }));

  // Close once the server confirmed, so a refused name keeps its values on screen.
  useEffect(() => {
    if (result?.ok) setOpen(false);
  }, [result]);

  const attributes = Object.fromEntries(
    rows
      .filter((row) => row.key.trim() && row.value.trim())
      .map((row) => [row.key.trim(), row.value.trim()]),
  );

  const payload: Draft = { ...draft, attributes };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? "Objekt bearbeiten" : "Objekt anlegen"}</DialogTitle>
          <DialogDescription>
            Die Inventarnummer ist eindeutig, sofern eine vergeben wird.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="item" value={JSON.stringify(payload)} />

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="ci-name">Bezeichnung</Label>
              <Input
                id="ci-name"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="z. B. Notebook Vertrieb 04"
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-tag">Inventarnummer</Label>
              <Input
                id="ci-tag"
                value={draft.asset_tag}
                onChange={(event) => patch({ asset_tag: event.target.value })}
                disabled={saving}
                className="h-10 rounded-xl font-mono"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ci-type">Art</Label>
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  patch({ type: value as MITSConfigurationItem["type"] })
                }
                disabled={saving}
              >
                <SelectTrigger id="ci-type" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CIType.options.map((type) => (
                    <SelectItem key={type} value={type}>
                      {CI_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ci-status">Zustand</Label>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  patch({ status: value as MITSConfigurationItem["status"] })
                }
                disabled={saving}
              >
                <SelectTrigger id="ci-status" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CIStatus.options.map((status) => (
                    <SelectItem key={status} value={status}>
                      {CI_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="ci-org">Firma</Label>
              <Select
                value={draft.organization_id ?? NO_ORGANIZATION}
                onValueChange={(value) => patch({ organization_id: value })}
                disabled={saving}
              >
                <SelectTrigger id="ci-org" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ORGANIZATION}>Keine Angabe</SelectItem>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ci-location">Standort</Label>
              <Select
                value={draft.location_id ?? NO_LOCATION}
                onValueChange={(value) => patch({ location_id: value })}
                disabled={saving}
              >
                <SelectTrigger id="ci-location" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOCATION}>Keine Angabe</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ci-user">Zugeordnet an</Label>
              <Select
                value={draft.assigned_user_id ?? NO_ORGANIZATION}
                onValueChange={(value) => patch({ assigned_user_id: value })}
                disabled={saving}
              >
                <SelectTrigger id="ci-user" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ORGANIZATION}>Niemand</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="ci-manufacturer">Hersteller</Label>
              <Input
                id="ci-manufacturer"
                value={draft.manufacturer}
                onChange={(event) => patch({ manufacturer: event.target.value })}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-model">Modell</Label>
              <Input
                id="ci-model"
                value={draft.model}
                onChange={(event) => patch({ model: event.target.value })}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-serial">Seriennummer</Label>
              <Input
                id="ci-serial"
                value={draft.serial_number}
                onChange={(event) => patch({ serial_number: event.target.value })}
                disabled={saving}
                className="h-10 rounded-xl font-mono"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ci-purchased">Angeschafft am</Label>
              <Input
                id="ci-purchased"
                type="date"
                value={draft.purchased_on}
                onChange={(event) => patch({ purchased_on: event.target.value })}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-warranty">Garantie bis</Label>
              <Input
                id="ci-warranty"
                type="date"
                value={draft.warranty_until}
                onChange={(event) => patch({ warranty_until: event.target.value })}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          {/* Licence-only. Shown for the one type the numbers mean something on. */}
          {draft.type === "license" && (
            <div className="grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ci-seats">Plätze</Label>
                <Input
                  id="ci-seats"
                  type="number"
                  min={0}
                  value={draft.seats_total}
                  onChange={(event) =>
                    patch({ seats_total: Number(event.target.value) || 0 })
                  }
                  disabled={saving}
                  className="h-10 rounded-xl tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  0 zählt keine Plätze.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ci-expires">Läuft ab am</Label>
                <Input
                  id="ci-expires"
                  type="date"
                  value={draft.expires_at}
                  onChange={(event) => patch({ expires_at: event.target.value })}
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="ci-note">Notiz</Label>
            <Textarea
              id="ci-note"
              value={draft.note}
              onChange={(event) => patch({ note: event.target.value })}
              rows={3}
              disabled={saving}
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-3 rounded-2xl border border-border p-4">
            <span className="label-industrial">Eigenschaften</span>

            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={row.key}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, key: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Merkmal"
                  aria-label={`Merkmal ${index + 1}`}
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
                <Input
                  value={row.value}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, value: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Wert"
                  aria-label={`Wert ${index + 1}`}
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Eigenschaft ${index + 1} entfernen`}
                  onClick={() =>
                    setRows((current) => current.filter((_, i) => i !== index))
                  }
                  disabled={saving}
                  className="rounded-full"
                >
                  <Trash2Icon strokeWidth={1.5} />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              size="sm"
              onClick={() => setRows((current) => [...current, { key: "", value: "" }])}
              disabled={saving || rows.length >= CI_ATTRIBUTE_LIMIT}
              className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              <PlusIcon strokeWidth={1.5} />
              Eigenschaft
            </Button>
          </div>

          {result && !result.ok && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-border px-4 py-3"
            >
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          )}
          {result?.ok && (
            <Alert className="rounded-2xl border-border px-4 py-3">
              <CheckCircle2Icon strokeWidth={1.5} />
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={saving || !draft.name.trim()}
              className="h-11 rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              {saving ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SaveIcon strokeWidth={1.5} />
              )}
              {saving ? "Speichern …" : "Objekt speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toDraft(item: MITSConfigurationItem): Draft {
  const { created_at: _created, updated_at: _updated, ...rest } = item;
  return rest;
}
