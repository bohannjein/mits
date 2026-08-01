"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  SaveIcon,
  SlidersIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState } from "react";

import { saveAnalyticsSettingsAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import {
  ANALYTICS_REFRESH_CHOICES,
  ANALYTICS_REFRESH_LABELS,
  ANALYTICS_WIDGETS,
  ANALYTICS_WIDGET_META,
  type AnalyticsSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Which widgets the statistics panel offers.

   One form, submitted whole. A checkbox that is not posted is indistinguishable
   from one that is off, so splitting the refresh interval and the eight toggles
   across two forms would make each save clear the other — the same trap the mail
   and AI masks document.

   A switched-off widget is not computed at all: `collectAnalytics` skips it. The
   switches are there for an instance whose data does not support a figure — a
   fresh install has no audit history, so its resolution times are honest and thin
   — not to save the browser from rendering a card.
   ────────────────────────────────────────────────────────────────────────── */

export function AnalyticsSettingsForm({
  settings,
}: {
  settings: AnalyticsSettings;
}) {
  const [result, action, saving] = useActionState(
    saveAnalyticsSettingsAction,
    null,
  );

  return (
    <form action={action} className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <SlidersIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
          <CardTitle className="mt-4 text-lg font-medium">
            Statistik-Panel
          </CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Sichtbar für Agenten und Administration unter{" "}
            <code>/mits/analytics</code>. Anwender haben keinen Zugriff.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="defaultRefreshSeconds">
              Voreingestellte Aktualisierung
            </Label>
            <Select
              name="defaultRefreshSeconds"
              defaultValue={String(settings.defaultRefreshSeconds)}
              disabled={saving}
            >
              <SelectTrigger
                id="defaultRefreshSeconds"
                className="h-10 w-full rounded-xl sm:w-64"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANALYTICS_REFRESH_CHOICES.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {ANALYTICS_REFRESH_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Womit das Panel startet. Im Panel selbst lässt sich der Wert für die
              laufende Sitzung ändern.
            </p>
          </div>

          <Separator className="bg-border" />

          <div className="grid gap-4">
            {ANALYTICS_WIDGETS.map((widget) => (
              <div
                key={widget}
                className="flex items-start gap-3 rounded-2xl border border-border p-4"
              >
                <Switch
                  id={widget}
                  name={widget}
                  defaultChecked={settings[widget]}
                  disabled={saving}
                />
                <div className="grid gap-1">
                  <Label htmlFor={widget} className="font-normal">
                    {ANALYTICS_WIDGET_META[widget].label}
                  </Label>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {ANALYTICS_WIDGET_META[widget].description}
                  </span>
                </div>
              </div>
            ))}
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
            size="lg"
            className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            disabled={saving}
          >
            {saving ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SaveIcon strokeWidth={1.5} />
            )}
            {saving ? "Speichern …" : "Speichern"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
