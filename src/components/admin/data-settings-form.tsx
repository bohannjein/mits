"use client";

import {
  CheckCircle2Icon,
  HistoryIcon,
  Loader2Icon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState } from "react";

import { applyRetentionAction, saveDataSettingsAction } from "@/app/admin/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  RETENTION_YEAR_CHOICES,
  UPLOAD_SIZE_CHOICES,
  type DataSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Upload limit and retention policy.

   The retention half is the only place in MITS that destroys data, so the count of
   affected tickets and the cut-off date are stated *before* the button, and the button
   says what it does rather than "Anwenden".
   ────────────────────────────────────────────────────────────────────────── */

export function DataSettingsForm({
  settings,
  candidates,
  cutoff,
}: {
  settings: DataSettings;
  /** How many tickets the current policy would anonymise right now. */
  candidates: number;
  /** The cut-off as a formatted date, resolved server-side in the configured zone. */
  cutoff: string;
}) {
  const [saveResult, saveAction, saving] = useActionState(
    saveDataSettingsAction,
    null,
  );
  const [runResult, runAction, running] = useActionState(applyRetentionAction, null);

  return (
    <div className="grid gap-6">
      <form action={saveAction}>
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Grenzen</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Gilt für Ticket-Anhänge und FAQ-Dateien.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="maxUploadMb">Maximale Anhanggröße</Label>
                <Select
                  name="maxUploadMb"
                  defaultValue={String(settings.maxUploadMb)}
                  disabled={saving}
                >
                  <SelectTrigger id="maxUploadMb" className="h-10 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPLOAD_SIZE_CHOICES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} MB
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="retentionYears">Aufbewahrung</Label>
                <Select
                  name="retentionYears"
                  defaultValue={String(settings.retentionYears)}
                  disabled={saving}
                >
                  <SelectTrigger id="retentionYears" className="h-10 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_YEAR_CHOICES.map((years) => (
                      <SelectItem key={years} value={String(years)}>
                        {years} {years === 1 ? "Jahr" : "Jahre"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {saveResult && (
              <Alert
                variant={saveResult.ok ? "default" : "destructive"}
                className="rounded-2xl border-border px-4 py-3"
              >
                {saveResult.ok ? (
                  <CheckCircle2Icon strokeWidth={1.5} />
                ) : (
                  <TriangleAlertIcon strokeWidth={1.5} />
                )}
                <AlertDescription>
                  {saveResult.ok ? saveResult.message : saveResult.error}
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={saving} className="w-fit rounded-full px-4">
              {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
              {saving ? "Speichern …" : "Speichern"}
            </Button>
          </CardContent>
        </Card>
      </form>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
        <CardHeader>
          <HistoryIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
          <CardTitle className="mt-4 text-lg font-medium">
            Anonymisieren nach Aufbewahrungsfrist
          </CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Entfernt Name und Adresse des Melders aus geschlossenen Tickets, die vor
            dem {cutoff} erfasst wurden. Ticket, Angaben und Historie bleiben — das ist
            der Unterschied zum Löschen.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertTitle>Nicht umkehrbar, und nicht automatisch</AlertTitle>
            <AlertDescription>
              MITS hat keinen Zeitplaner: der Durchlauf passiert, wenn Sie ihn hier
              starten. Die entfernten Angaben sind danach nicht wiederherstellbar, auch
              nicht über den Papierkorb.
            </AlertDescription>
          </Alert>

          <Separator className="bg-border" />

          <p className="text-sm">
            Betroffen wären derzeit{" "}
            <span className="font-medium tabular-nums">{candidates}</span>{" "}
            {candidates === 1 ? "Ticket" : "Tickets"}.
          </p>

          {runResult && (
            <Alert
              variant={runResult.ok ? "default" : "destructive"}
              className="rounded-2xl border-border px-4 py-3"
            >
              {runResult.ok ? (
                <CheckCircle2Icon strokeWidth={1.5} />
              ) : (
                <TriangleAlertIcon strokeWidth={1.5} />
              )}
              <AlertDescription>
                {runResult.ok ? runResult.message : runResult.error}
              </AlertDescription>
            </Alert>
          )}

          <form action={runAction}>
            <Button
              type="submit"
              disabled={running || candidates === 0}
              className="w-fit rounded-full bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90"
            >
              {running ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <HistoryIcon strokeWidth={1.5} />
              )}
              {running
                ? "Läuft …"
                : `${candidates} ${candidates === 1 ? "Ticket" : "Tickets"} anonymisieren`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
