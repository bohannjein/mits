"use client";

import { CheckCircle2Icon, Loader2Icon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { saveFeatureFlagsAction } from "@/app/admin/actions";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_META,
  INERT_FEATURE_FLAGS,
  type FeatureFlagKey,
  type FeatureFlags,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Feature toggles.

   Order comes from FEATURE_FLAG_META rather than from this file, so a flag added
   to the schema shows up here without a second edit — and cannot ship unlabelled,
   because the meta entry is what makes it renderable at all.
   ────────────────────────────────────────────────────────────────────────── */

const KEYS = Object.keys(FEATURE_FLAG_META) as FeatureFlagKey[];

export function FeatureFlagsForm({ flags }: { flags: FeatureFlags }) {
  const [current, setCurrent] = useState(flags);
  const [result, formAction, saving] = useActionState(
    saveFeatureFlagsAction,
    null,
  );

  const changed = KEYS.some((key) => current[key] !== flags[key]);
  const activeCount = KEYS.filter((key) => current[key]).length;

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-medium">Module</CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                Ausgeschaltete Module verschwinden aus der Oberfläche und ihre
                Server-Endpunkte antworten nicht mehr. Bereits erfasste Daten
                bleiben unangetastet.
              </CardDescription>
            </div>
            <Badge variant="outline" className="h-auto rounded-full px-3 py-1">
              {activeCount} von {KEYS.length} aktiv
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {KEYS.map((key) => {
            const meta = FEATURE_FLAG_META[key];
            const isDefault = current[key] === DEFAULT_FEATURE_FLAGS[key];

            return (
              <div
                key={key}
                className={cn(
                  "flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-background px-4 py-3.5",
                  !current[key] && "opacity-70",
                )}
              >
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={key} className="text-sm font-medium">
                      {meta.label}
                    </Label>
                    {/* A switch that does nothing is worse than a missing switch:
                        an admin flips it, waits, and concludes MITS is broken. */}
                    {INERT_FEATURE_FLAGS.includes(key) && (
                      <Badge
                        variant="outline"
                        className="h-auto rounded-full border-warning/40 px-2 py-0.5 text-[11px] font-normal text-warning"
                      >
                        geplant, noch ohne Funktion
                      </Badge>
                    )}
                    {!isDefault && (
                      <Badge
                        variant="outline"
                        className="h-auto rounded-full px-2 py-0.5 text-[11px] font-normal"
                      >
                        vom Standard abweichend
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {meta.description}
                  </p>
                  <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                    {key}
                  </span>
                </div>

                <Switch
                  id={key}
                  checked={current[key]}
                  onCheckedChange={(value) =>
                    setCurrent((flags) => ({ ...flags, [key]: value }))
                  }
                  disabled={saving}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="flags" value={JSON.stringify(current)} />
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || !changed}
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
          {saving ? "Speichern …" : changed ? "Module speichern" : "Keine Änderung"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-full px-4"
          disabled={saving}
          onClick={() => setCurrent(DEFAULT_FEATURE_FLAGS)}
        >
          Auf Standard zurücksetzen
        </Button>
      </form>

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
    </div>
  );
}
