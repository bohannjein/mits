"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  MailCheckIcon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveSmtpSettingsAction, sendTestMailAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SmtpSettings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   SMTP settings.

   Two independent forms: saving and testing. Testing before saving would verify
   the stored values rather than the typed ones, so the button is deliberately
   labelled as testing what is saved.
   ────────────────────────────────────────────────────────────────────────── */

export function EmailSettingsForm({
  settings,
  hasStoredPassword,
  configured,
}: {
  settings: SmtpSettings;
  hasStoredPassword: boolean;
  configured: boolean;
}) {
  const [secure, setSecure] = useState(settings.secure);
  const [result, saveAction, saving] = useActionState(
    saveSmtpSettingsAction,
    null,
  );
  const [testResult, testAction, testing] = useActionState(
    sendTestMailAction,
    null,
  );

  return (
    <div className="grid gap-6">
      <form action={saveAction}>
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-medium">SMTP-Zugang</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Ohne Host und Absenderadresse versendet MITS nichts — die
                  Benachrichtigungen bleiben dann stumm, ohne Fehler.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="h-auto rounded-full px-3 py-1 font-normal"
              >
                {configured ? "versandbereit" : "nicht konfiguriert"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="grid gap-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  name="host"
                  defaultValue={settings.host}
                  placeholder="smtp.firma.de"
                  disabled={saving}
                  className="h-10 rounded-xl font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  name="port"
                  type="number"
                  min={1}
                  max={65535}
                  defaultValue={settings.port}
                  disabled={saving}
                  className="h-10 rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
              {/* Hidden companion so an off switch posts something; a switch that
                  is off submits no field at all. */}
              <Switch
                id="secure"
                name="secure"
                checked={secure}
                onCheckedChange={setSecure}
                disabled={saving}
              />
              <div className="grid gap-1">
                <Label htmlFor="secure">Implizites TLS (Port 465)</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Aus lassen für 587 — dort wird STARTTLS benutzt, sobald der
                  Server es anbietet. Nur für 465 einschalten.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="user">Benutzer</Label>
                <Input
                  id="user"
                  name="user"
                  defaultValue={settings.user}
                  autoComplete="off"
                  disabled={saving}
                  className="h-10 rounded-xl font-mono"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    hasStoredPassword ? "gespeichert — leer lassen zum Behalten" : ""
                  }
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  {hasStoredPassword
                    ? "Ein leeres Feld behält das gespeicherte Passwort. Zum Löschen ein Leerzeichen eintragen."
                    : "Noch keines gespeichert."}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="from">Absenderadresse</Label>
              <Input
                id="from"
                name="from"
                defaultValue={settings.from}
                placeholder="it-service@firma.de"
                disabled={saving}
                className="h-10 rounded-xl font-mono"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="public_url">Öffentliche Adresse dieser Instanz</Label>
              <Input
                id="public_url"
                name="public_url"
                defaultValue={settings.public_url}
                placeholder="https://mits.firma.de"
                disabled={saving}
                className="h-10 rounded-xl font-mono"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ohne diesen Wert geht die Mail ohne Ticket-Link raus.
              </p>
            </div>
          </CardContent>

          <CardFooter className="grid gap-3 rounded-b-3xl border-t border-border bg-transparent">
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
              {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
              {saving ? "Speichern …" : "SMTP speichern"}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Test-Mail</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Prüft erst die Verbindung inklusive Anmeldung, dann den Versand. Die
            Nachricht geht an die eigene Adresse.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form action={testAction}>
            <Button
              type="submit"
              className="h-10 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
              disabled={testing || !configured}
            >
              {testing ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <MailCheckIcon strokeWidth={1.5} />
              )}
              {testing ? "Wird gesendet …" : "Test-Mail senden"}
            </Button>
          </form>

          {!configured && (
            <p className="text-xs text-muted-foreground">
              Erst Host und Absenderadresse speichern.
            </p>
          )}

          {testResult && (
            <Alert
              variant={testResult.ok ? "default" : "destructive"}
              className="rounded-2xl border-border px-4 py-3"
            >
              {testResult.ok ? (
                <CheckCircle2Icon strokeWidth={1.5} />
              ) : (
                <TriangleAlertIcon strokeWidth={1.5} />
              )}
              <AlertDescription>
                {testResult.ok ? testResult.message : testResult.error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
