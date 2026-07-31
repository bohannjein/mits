"use client";

import { CheckCircle2Icon, Loader2Icon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { changeOwnRefreshInterval } from "@/app/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REFRESH_FOLLOW_GLOBAL,
  REFRESH_INTERVALS,
  REFRESH_LABELS,
  type RefreshInterval,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Own refresh interval. Staff only — the card is not rendered for a reporter, and
   the action refuses one as well.

   "Vorgabe der Instanz" is a real option, not the absence of one: an agent who tried
   a short interval needs a way back to whatever the admin set, and that is not the
   same as picking today's global value by hand — the admin may change it later.
   ────────────────────────────────────────────────────────────────────────── */

export function RefreshPreferenceForm({
  own,
  global,
}: {
  /** The agent's override, or null when they follow the instance. */
  own: RefreshInterval | null;
  global: RefreshInterval;
}) {
  const [result, formAction, saving] = useActionState(
    changeOwnRefreshInterval,
    null,
  );
  const [value, setValue] = useState(
    own === null ? REFRESH_FOLLOW_GLOBAL : String(own),
  );

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="own-refresh">Intervall</Label>
        <Select name="refreshMinutes" value={value} onValueChange={setValue}>
          <SelectTrigger id="own-refresh" className="h-10 w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={REFRESH_FOLLOW_GLOBAL}>
              Vorgabe der Instanz ({REFRESH_LABELS[global].toLowerCase()})
            </SelectItem>
            {REFRESH_INTERVALS.map((interval) => (
              <SelectItem key={interval} value={String(interval)}>
                {REFRESH_LABELS[interval]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Gilt für Ihr Konto auf jedem Gerät. Pausiert, während der Tab im
          Hintergrund liegt.
        </p>
      </div>

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

      <Button
        type="submit"
        disabled={saving}
        className="w-fit rounded-full bg-surface-elevated px-5 text-foreground hover:bg-accent"
      >
        {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
        {saving ? "Speichern …" : "Intervall speichern"}
      </Button>
    </form>
  );
}
