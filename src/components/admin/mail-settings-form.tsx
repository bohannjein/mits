"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  MailIcon,
  SaveIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import { useActionState } from "react";

import {
  saveMailSettingsAction,
  testDefenderRuleAction,
} from "@/app/admin/actions";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  NO_ON_CALL,
  TICKET_PRIORITY_LABELS,
  type MailSettings,
  type TicketPriority,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Mail ingest and the Defender rule.

   The test box is the important half of this page. The rule's mistakes are expensive
   in both directions — a missed alert sits in the queue as ordinary mail, a false
   positive escalates a newsletter and pages the on-call admin at 03:00 — and with no
   transport wired up yet there is otherwise no way to try it at all. Paste a real alert
   from the tenant, see the verdict and the extracted fields, before any ticket exists.
   ────────────────────────────────────────────────────────────────────────── */

export function MailSettingsForm({
  settings,
  staff,
}: {
  settings: MailSettings;
  /** Candidates for on-call duty — only accounts that can work a queue. */
  staff: { id: string; name: string }[];
}) {
  const [saveResult, saveAction, saving] = useActionState(
    saveMailSettingsAction,
    null,
  );
  const [testResult, testAction, testing] = useActionState(
    testDefenderRuleAction,
    null,
  );

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <MailIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
          <CardTitle className="mt-4 text-lg font-medium">Posteingang</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Adresse, an die Tickets und Alerts gehen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="rounded-2xl border-border px-4 py-3">
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertTitle>Noch kein Abruf eingerichtet</AlertTitle>
            <AlertDescription>
              MITS holt derzeit keine Mails ab — der Transport (IMAP oder Microsoft
              Graph) ist noch nicht gebaut. Die Erkennung darunter ist vollständig und
              hier prüfbar; sie greift, sobald Nachrichten hereinkommen.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <form action={saveAction} className="grid gap-6">
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <ShieldAlertIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
            <CardTitle className="mt-4 text-lg font-medium">
              Defender Security Incident Handler
            </CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Erkennt Microsoft-Defender-Alerts an Absender oder Betreff, legt sie als
              Security Incident an und setzt die Priorität aus dem Schweregrad.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="supportAddress">Support-Adresse</Label>
              <Input
                id="supportAddress"
                name="supportAddress"
                type="email"
                defaultValue={settings.supportAddress}
                placeholder="support@firma.de"
                disabled={saving}
                className="h-10 rounded-xl font-mono"
              />
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
              <Switch
                id="defenderRuleEnabled"
                name="defenderRuleEnabled"
                defaultChecked={settings.defenderRuleEnabled}
                disabled={saving}
              />
              <div className="grid gap-1">
                <Label htmlFor="defenderRuleEnabled" className="font-normal">
                  Regel aktiv
                </Label>
                <span className="text-xs text-muted-foreground">
                  Aus: ein erkannter Alert wird ein gewöhnliches Ticket.
                </span>
              </div>
            </div>

            <Separator className="bg-border" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="onCallUserId">Bereitschaft</Label>
                <Select
                  name="onCallUserId"
                  defaultValue={settings.onCallUserId || NO_ON_CALL}
                  disabled={saving}
                >
                  <SelectTrigger id="onCallUserId" className="h-10 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ON_CALL}>Niemand — bleibt im Eingang</SelectItem>
                    {staff.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  MITS kennt keine Gruppen. Bis es sie gibt, ist das ein Konto — ohne
                  Angabe liegt der Vorfall unzugewiesen im Pool-Eingang.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="onCallEmail">Benachrichtigung an</Label>
                <Input
                  id="onCallEmail"
                  name="onCallEmail"
                  type="email"
                  defaultValue={settings.onCallEmail}
                  placeholder="security@firma.de"
                  disabled={saving}
                  className="h-10 rounded-xl font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Braucht eine SMTP-Konfiguration. Push gibt es in MITS nicht.
                </p>
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

            <Button
              type="submit"
              disabled={saving}
              className="w-fit rounded-full px-4"
            >
              {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
              {saving ? "Speichern …" : "Speichern"}
            </Button>
          </CardContent>
        </Card>
      </form>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
        <CardHeader>
          <ZapIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
          <CardTitle className="mt-4 text-lg font-medium">Regel prüfen</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Eine echte Mail einsetzen. Es wird nichts angelegt und nichts versendet —
            nur gezeigt, wie die Regel entscheiden würde.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={testAction} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="test-from">Absender</Label>
                <Input
                  id="test-from"
                  name="from"
                  placeholder="security-noreply@microsoft.com"
                  disabled={testing}
                  className="h-10 rounded-xl font-mono text-xs"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="test-subject">Betreff</Label>
                <Input
                  id="test-subject"
                  name="subject"
                  placeholder="[Defender Alert] High severity alert"
                  disabled={testing}
                  className="h-10 rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="test-text">Mail-Text</Label>
              <Textarea
                id="test-text"
                name="text"
                rows={7}
                placeholder={"Severity: High\nDevice name: NB-VERTRIEB-07\nAlert title: Suspicious PowerShell execution"}
                disabled={testing}
                className="rounded-xl font-mono text-xs"
              />
            </div>

            <Button
              type="submit"
              disabled={testing}
              className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              {testing ? <Loader2Icon className="animate-spin" /> : <ZapIcon strokeWidth={1.5} />}
              {testing ? "Wird geprüft …" : "Regel anwenden"}
            </Button>

            {testResult && <TestReport result={testResult} />}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function TestReport({
  result,
}: {
  result: NonNullable<Awaited<ReturnType<typeof testDefenderRuleAction>>>;
}) {
  if (!result.ok) {
    return (
      <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
        <TriangleAlertIcon strokeWidth={1.5} />
        <AlertDescription>{result.error}</AlertDescription>
      </Alert>
    );
  }

  if (!result.matched) {
    return (
      <Alert className="rounded-2xl border-border px-4 py-3">
        <MailIcon strokeWidth={1.5} />
        <AlertTitle>Kein Incident</AlertTitle>
        <AlertDescription>{result.note}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-background px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlertIcon className="size-4 text-destructive" strokeWidth={1.5} aria-hidden />
        <span className="text-sm font-medium">Security Incident</span>
        <Badge
          variant="outline"
          className={cn(
            "h-auto rounded-full px-2 py-0.5 text-[11px] font-normal",
            (result.priority === "critical" || result.priority === "high") &&
              "border-destructive/40 text-destructive",
          )}
        >
          {TICKET_PRIORITY_LABELS[result.priority as TicketPriority]}
          {result.priorityAssumed ? " (angenommen)" : ""}
        </Badge>
        <Badge
          variant="secondary"
          className="h-auto rounded-full px-2 py-0.5 text-[11px] font-normal"
        >
          {result.assigned ? "Bereitschaft" : "unzugewiesen"}
        </Badge>
      </div>

      <dl className="grid gap-1.5 text-sm">
        <Row label="Alert" value={result.alertTitle} />
        <Row label="Schweregrad" value={result.severity ?? "nicht lesbar"} />
        <Row label="Gerät oder Konto" value={result.host} />
        <Row label="Incident" value={result.incidentId} />
      </dl>

      <p className="text-xs leading-relaxed text-muted-foreground">{result.note}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={value ? "break-words" : "text-muted-foreground"}>
        {value || "nicht erkannt"}
      </dd>
    </div>
  );
}
