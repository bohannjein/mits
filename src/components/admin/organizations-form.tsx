"use client";

import {
  BuildingIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  deleteOrganizationAction,
  saveOrganizationAction,
} from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLatestResult } from "@/hooks/use-latest-result";
import { MITSOrganizationSchema, type MITSOrganization } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Companies.

   A list plus a dialog, not an editable table like the locations mask. Thirteen fields
   do not fit a row, and submitting the whole list would mean a form that lost a row
   deletes a customer with their assets attached.

   Deleting is refused server-side while anything still points at the company; the
   counts in each row are what makes that predictable instead of a surprise.
   ────────────────────────────────────────────────────────────────────────── */

const EMPTY: MITSOrganization = MITSOrganizationSchema.parse({
  id: "",
  name: "",
});

export function OrganizationsForm({
  organizations,
  counts,
}: {
  organizations: MITSOrganization[];
  counts: Record<string, { items: number; users: number }>;
}) {
  const [draft, setDraft] = useState<MITSOrganization | null>(null);
  const [saveResult, saveAction, saving] = useActionState(
    saveOrganizationAction,
    null,
  );
  const [deleteResult, deleteAction, deleting] = useActionState(
    deleteOrganizationAction,
    null,
  );

  const patch = (next: Partial<MITSOrganization>) =>
    setDraft((current) => (current ? { ...current, ...next } : current));

  /*
   * Close the dialog once the server confirmed. Not on submit: a rejected name — a
   * duplicate, a bad website — has to leave the entered values on screen, and a dialog
   * that closes on click would drop them and show the error somewhere the user is no
   * longer looking.
   */
  useEffect(() => {
    if (saveResult?.ok) setDraft(null);
  }, [saveResult]);

  const result = useLatestResult(saveResult, deleteResult);

  return (
    <div className="grid gap-6">
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

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-medium">Firmen</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Eigentümer von Objekten und Zuordnung für Anwender. Eine inaktive Firma
              bleibt an bestehenden Datensätzen erhalten, wird aber nicht mehr
              angeboten.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setDraft({ ...EMPTY })}
            className="h-9 shrink-0 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            <PlusIcon strokeWidth={1.5} />
            Firma anlegen
          </Button>
        </CardHeader>

        <CardContent className="grid gap-3">
          {organizations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Firma. Ohne Firmen bleibt die Eigentümerspalte in der CMDB
              leer.
            </p>
          )}

          {organizations.map((organization) => {
            const count = counts[organization.id] ?? { items: 0, users: 0 };
            const blocked = count.items > 0 || count.users > 0;

            return (
              <div
                key={organization.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4"
              >
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted-foreground"
                  aria-hidden
                >
                  <BuildingIcon strokeWidth={1.5} className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate">{organization.name}</span>
                    {organization.code && (
                      <Badge variant="outline" className="rounded-full font-normal">
                        {organization.code}
                      </Badge>
                    )}
                    {!organization.active && (
                      <Badge
                        variant="outline"
                        className="rounded-full font-normal text-muted-foreground"
                      >
                        Inaktiv
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      organization.customer_number,
                      organization.domain,
                      organization.city,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Keine weiteren Angaben"}
                  </p>
                </div>

                <span className="text-xs text-muted-foreground tabular-nums">
                  {count.items} Objekte · {count.users} Personen
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${organization.name} bearbeiten`}
                  onClick={() => setDraft(organization)}
                  className="rounded-full"
                >
                  <PencilIcon strokeWidth={1.5} />
                </Button>

                <form action={deleteAction} className="contents">
                  <input
                    type="hidden"
                    name="organizationId"
                    value={organization.id}
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${organization.name} löschen`}
                    // Not hidden when blocked: the server refuses and names what is in
                    // the way, which is more useful than a button that is simply gone.
                    title={
                      blocked
                        ? "Erst Objekte und Personen umziehen"
                        : "Firma löschen"
                    }
                    disabled={deleting}
                    className="rounded-full"
                  >
                    <Trash2Icon strokeWidth={1.5} />
                  </Button>
                </form>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-elev-3 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Firma bearbeiten" : "Firma anlegen"}</DialogTitle>
            <DialogDescription>
              Die Domain ordnet neue Anwender dieser Firma vorschlagsweise zu.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <form action={saveAction} className="grid gap-4">
              <input
                type="hidden"
                name="organization"
                value={JSON.stringify(draft)}
              />

              <div className="grid gap-2">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={draft.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  placeholder="z. B. Weller GmbH"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="org-code">Kurzcode</Label>
                  <Input
                    id="org-code"
                    value={draft.code}
                    onChange={(event) => patch({ code: event.target.value })}
                    placeholder="WG"
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="org-number">Kundennummer</Label>
                  <Input
                    id="org-number"
                    value={draft.customer_number}
                    onChange={(event) =>
                      patch({ customer_number: event.target.value })
                    }
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="org-domain">Mail-Domain</Label>
                  <Input
                    id="org-domain"
                    value={draft.domain}
                    onChange={(event) => patch({ domain: event.target.value })}
                    placeholder="firma.de"
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div className="grid gap-2">
                  <Label htmlFor="org-street">Straße und Hausnummer</Label>
                  <Input
                    id="org-street"
                    value={draft.street}
                    onChange={(event) => patch({ street: event.target.value })}
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="org-postal">PLZ</Label>
                  <Input
                    id="org-postal"
                    value={draft.postal_code}
                    onChange={(event) => patch({ postal_code: event.target.value })}
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="org-city">Stadt</Label>
                  <Input
                    id="org-city"
                    value={draft.city}
                    onChange={(event) => patch({ city: event.target.value })}
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="org-country">Land</Label>
                  <Input
                    id="org-country"
                    value={draft.country}
                    onChange={(event) => patch({ country: event.target.value })}
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="org-phone">Telefon</Label>
                  <Input
                    id="org-phone"
                    type="tel"
                    value={draft.phone}
                    onChange={(event) => patch({ phone: event.target.value })}
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="org-website">Website</Label>
                  <Input
                    id="org-website"
                    value={draft.website}
                    onChange={(event) => patch({ website: event.target.value })}
                    placeholder="firma.de"
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="org-note">Hinweis</Label>
                <Textarea
                  id="org-note"
                  value={draft.note}
                  onChange={(event) => patch({ note: event.target.value })}
                  rows={3}
                  disabled={saving}
                  className="rounded-xl"
                />
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
                <Switch
                  id="org-active"
                  checked={draft.active}
                  onCheckedChange={(value) => patch({ active: value })}
                  disabled={saving}
                />
                <Label htmlFor="org-active" className="font-normal">
                  Auswählbar
                </Label>
              </div>

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
                  {saving ? "Speichern …" : "Firma speichern"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
