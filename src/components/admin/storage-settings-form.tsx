"use client";

import {
  CheckCircle2Icon,
  HardDriveIcon,
  Loader2Icon,
  PlugZapIcon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState } from "react";

import { saveS3SettingsAction, testS3Action } from "@/app/admin/actions";
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
import { KEEP_S3_SECRET, type S3Settings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   S3 configuration.

   The secret is never sent back to the browser. The field posts the
   `KEEP_S3_SECRET` sentinel until somebody types in it, so an unrelated save of
   this mask cannot wipe the credentials — the same arrangement the SMTP password
   uses, and `resolveSmtpPassword` is the shared rule.
   ────────────────────────────────────────────────────────────────────────── */

export function StorageSettingsForm({
  settings,
  /** Whether a secret is on file. The value itself never leaves the server. */
  hasSecret,
  /** What new uploads would actually do right now — flag and config combined. */
  activeBackendLabel,
}: {
  settings: S3Settings;
  hasSecret: boolean;
  activeBackendLabel: string;
}) {
  const [saveResult, saveAction, saving] = useActionState(
    saveS3SettingsAction,
    null,
  );
  const [testResult, testAction, testing] = useActionState(testS3Action, null);

  return (
    <div className="grid gap-6">
      <Alert className="rounded-2xl border-border px-4 py-3">
        <HardDriveIcon strokeWidth={1.5} />
        <AlertDescription>
          Neue Anhänge landen derzeit im <strong>{activeBackendLabel}</strong>.
          Bereits gespeicherte Dateien bleiben, wo sie sind — jede Datei merkt
          sich ihren Speicherort.
        </AlertDescription>
      </Alert>

      <form action={saveAction}>
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">S3-Zugang</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Funktioniert mit MinIO, AWS S3 und Hetzner Object Storage.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="s3-endpoint">Endpunkt</Label>
              <Input
                id="s3-endpoint"
                name="endpoint"
                defaultValue={settings.endpoint}
                placeholder="s3.eu-central-1.amazonaws.com"
                disabled={saving}
                className="h-10 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Nur der Host, bei Bedarf mit Port. Ohne https:// und ohne Pfad.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="s3-bucket">Bucket</Label>
                <Input
                  id="s3-bucket"
                  name="bucket"
                  defaultValue={settings.bucket}
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="s3-region">Region</Label>
                <Input
                  id="s3-region"
                  name="region"
                  defaultValue={settings.region}
                  placeholder="us-east-1"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="s3-key">Access Key ID</Label>
                <Input
                  id="s3-key"
                  name="accessKeyId"
                  defaultValue={settings.accessKeyId}
                  autoComplete="off"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="s3-secret">Secret Access Key</Label>
                <Input
                  id="s3-secret"
                  name="secretAccessKey"
                  type="password"
                  // The sentinel, not the secret. Leaving the field blank would
                  // also keep the stored value, but a visibly filled field is what
                  // tells the admin one is on file.
                  defaultValue={hasSecret ? KEEP_S3_SECRET : ""}
                  autoComplete="new-password"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  {hasSecret
                    ? "Hinterlegt. Leer lassen behält den gespeicherten Schlüssel."
                    : "Noch keiner hinterlegt."}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="s3-prefix">Präfix</Label>
              <Input
                id="s3-prefix"
                name="prefix"
                defaultValue={settings.prefix}
                placeholder="mits/"
                disabled={saving}
                className="h-10 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Ordner im Bucket. Leer legt die Dateien direkt in die Wurzel.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <Switch
                id="s3-secure"
                name="secure"
                defaultChecked={settings.secure}
                disabled={saving}
              />
              <Label
                htmlFor="s3-secure"
                className="text-sm font-normal text-muted-foreground"
              >
                HTTPS verwenden
              </Label>
            </div>

            <div className="flex items-center gap-2.5">
              <Switch
                id="s3-path-style"
                name="forcePathStyle"
                defaultChecked={settings.forcePathStyle}
                disabled={saving}
              />
              <Label
                htmlFor="s3-path-style"
                className="text-sm font-normal text-muted-foreground"
              >
                Pfad-Adressierung (Bucket im Pfad statt im Hostnamen)
              </Label>
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
              size="lg"
              className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
              disabled={saving}
            >
              {saving ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SaveIcon strokeWidth={1.5} />
              )}
              {saving ? "Speichern …" : "Zugang speichern"}
            </Button>
          </CardContent>
        </Card>
      </form>

      <form action={testAction}>
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Verbindung testen</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Schreibt eine kleine Testdatei, liest sie zurück und löscht sie
              wieder — geprüft wird der gespeicherte Zugang, nicht die Eingaben
              oben.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
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
            <Button
              type="submit"
              className="h-10 w-fit rounded-full bg-surface-elevated px-5 text-foreground hover:bg-accent hover:text-accent-foreground"
              disabled={testing}
            >
              {testing ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PlugZapIcon strokeWidth={1.5} />
              )}
              {testing ? "Wird geprüft …" : "Test durchführen"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
