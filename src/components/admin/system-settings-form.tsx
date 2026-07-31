"use client";

import {
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  SaveIcon,
  ServerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { checkTimeSyncAction, saveSystemSettingsAction } from "@/app/admin/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  SYSTEM_TIMEZONES,
  formatDateTime,
  formatOffsetMs,
  timezoneOffsetLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SystemSettings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Timezone and time server.

   The preview is the point of the timezone half: an IANA name means nothing to
   most people, and "Europe/Berlin" versus "UTC" is a two-hour mistake that only
   shows up later in a ticket timestamp. So the current moment is rendered in the
   selected zone, live, before anything is saved.

   The sync check reports and does not fix. A container cannot set the kernel clock —
   that belongs to the host — and a button labelled "sync" that only measured would
   be worse than no button, because an admin would tick it and consider the matter
   closed.
   ────────────────────────────────────────────────────────────────────────── */

export function SystemSettingsForm({
  settings,
  /** Rendered on the server so the first paint already shows a time. */
  now,
}: {
  settings: SystemSettings;
  now: string;
}) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [ntpHost, setNtpHost] = useState(settings.ntpHost);
  const [saveResult, saveAction, saving] = useActionState(
    saveSystemSettingsAction,
    null,
  );
  const [syncResult, syncAction, syncing] = useActionState(
    checkTimeSyncAction,
    null,
  );

  // A zone the admin configured by hand may not be in the curated list; it still
  // has to be selectable, or opening the mask would silently change it.
  const options = SYSTEM_TIMEZONES.includes(
    timezone as (typeof SYSTEM_TIMEZONES)[number],
  )
    ? SYSTEM_TIMEZONES
    : [timezone, ...SYSTEM_TIMEZONES];

  const preview = new Date(now);
  const offset = timezoneOffsetLabel(timezone, preview);

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <ClockIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
          <CardTitle className="mt-4 text-lg font-medium">Zeitzone</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Gilt für jeden Zeitstempel im System — Tickets, Verlauf, Listen. Eine
            Anzeigeeinstellung: gespeichert wird weiterhin UTC, ein Wechsel
            verändert also keine vorhandenen Daten.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="timezone">Zeitzone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 rounded-2xl border border-border bg-background px-4 py-3">
            <span className="label-industrial">Vorschau</span>
            <span className="text-sm">
              {formatDateTime(preview, timezone)}
              {offset && (
                <Badge
                  variant="outline"
                  className="ml-2 h-auto rounded-full px-2 py-0.5 align-middle font-mono text-[11px] font-normal"
                >
                  {offset}
                </Badge>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              Sommerzeit ist berücksichtigt — der Versatz gilt für diesen Moment,
              nicht für das ganze Jahr.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <ServerIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
          <CardTitle className="mt-4 text-lg font-medium">Zeitserver</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Referenz für die Prüfung der Systemuhr. Nur Hostname oder IP, ohne
            Schema und ohne Port — die Abfrage läuft über UDP 123.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ntpHost">NTP-Server</Label>
            <Input
              id="ntpHost"
              value={ntpHost}
              onChange={(event) => setNtpHost(event.target.value)}
              placeholder="pool.ntp.org"
              spellCheck={false}
              className="h-10 rounded-xl font-mono"
            />
          </div>

          <Alert className="rounded-2xl border-border px-4 py-3">
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertTitle>MITS stellt die Uhr nicht</AlertTitle>
            <AlertDescription>
              Die Systemzeit gehört dem Host, nicht dem Container. Diese Prüfung
              misst den Versatz und meldet ihn; korrigiert wird er auf dem Host
              (etwa per <code>systemd-timesyncd</code> oder <code>chrony</code>).
            </AlertDescription>
          </Alert>

          <Separator className="bg-border" />

          <form action={syncAction} className="grid gap-3">
            {/* The field being tested, not the stored one: an admin types a host
                and checks it before committing. */}
            <input type="hidden" name="ntpHost" value={ntpHost} />
            <Button
              type="submit"
              disabled={syncing || !ntpHost.trim()}
              className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              {syncing ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <ClockIcon strokeWidth={1.5} />
              )}
              {syncing ? "Wird geprüft …" : "Zeit prüfen"}
            </Button>

            {syncResult && <SyncReport result={syncResult} />}
          </form>
        </CardContent>
      </Card>

      <form action={saveAction} className="grid gap-3">
        <input type="hidden" name="timezone" value={timezone} />
        <input type="hidden" name="ntpHost" value={ntpHost} />

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

        <Button
          type="submit"
          size="lg"
          disabled={saving}
          className="w-fit rounded-full px-4"
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          {saving ? "Speichern …" : "Speichern"}
        </Button>
      </form>
    </div>
  );
}

/** The measured result, or the reason there is none. */
function SyncReport({
  result,
}: {
  result: {
    ok: boolean;
    message?: string;
    error?: string;
    offsetMs?: number;
    roundTripMs?: number;
    health?: "ok" | "warn" | "critical";
    stratum?: number;
  };
}) {
  if (!result.ok) {
    return (
      <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
        <TriangleAlertIcon strokeWidth={1.5} />
        <AlertTitle>Prüfung fehlgeschlagen</AlertTitle>
        <AlertDescription>{result.error}</AlertDescription>
      </Alert>
    );
  }

  const health = result.health ?? "ok";

  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            health === "ok" && "bg-success",
            health === "warn" && "bg-warning",
            health === "critical" && "bg-destructive",
          )}
          aria-hidden
        />
        <span className="text-sm font-medium">
          {health === "ok"
            ? "Systemuhr ist synchron"
            : health === "warn"
              ? "Systemuhr weicht messbar ab"
              : "Systemuhr weicht deutlich ab"}
        </span>
        {result.offsetMs !== undefined && (
          <Badge
            variant="outline"
            className="h-auto rounded-full px-2 py-0.5 font-mono text-[11px] font-normal"
          >
            {formatOffsetMs(result.offsetMs)}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {result.message}
        {result.roundTripMs !== undefined &&
          ` · Laufzeit ${Math.round(result.roundTripMs)} ms`}
        {result.stratum !== undefined && ` · Stratum ${result.stratum}`}
      </p>
    </div>
  );
}
