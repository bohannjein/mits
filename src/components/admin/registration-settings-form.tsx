"use client";

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useActionState } from "react";

import { updateAuthSettingsAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SESSION_LIFETIME_DAYS,
  SESSION_LIFETIME_LABELS,
  type AuthSettings,
} from "@/types/mits";

/**
 * Registration policy editor.
 *
 * A plain `<form>` driven by a server action: the policy is enforced server-side
 * anyway, so there is nothing to gain from validating it in the browser first.
 */
export function RegistrationSettingsForm({
  settings,
}: {
  settings: AuthSettings;
}) {
  const [result, formAction, pending] = useActionState(
    updateAuthSettingsAction,
    null,
  );

  return (
    <form action={formAction}>
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Anmeldung</CardTitle>
          <CardDescription>
            Wer sich selbst anlegen darf, aus welchen E-Mail-Domains, und wie lange
            eine Anmeldung gilt.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
            <Switch
              id="registrationEnabled"
              name="registrationEnabled"
              defaultChecked={settings.registrationEnabled}
              disabled={pending}
            />
            <div className="grid gap-1">
              <Label htmlFor="registrationEnabled">Selbstregistrierung erlauben</Label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="allowedEmailDomains">Erlaubte E-Mail-Domains</Label>
            <Textarea
              id="allowedEmailDomains"
              name="allowedEmailDomains"
              rows={3}
              disabled={pending}
              defaultValue={settings.allowedEmailDomains.join("\n")}
              placeholder={"firma.de\ntochtergesellschaft.de"}
              className="rounded-xl font-mono"
            />
          </div>

          {/*
            Die Obergrenze für „Angemeldet bleiben".

            Ein `<select>` und kein Zahlenfeld: der Wert wird zur Lebensdauer eines
            Cookies, und eine frei getippte Zahl ist eine Instanz, auf der niemand
            erklären kann, warum er stündlich fliegt. Ohne Haken endet die Sitzung
            weiterhin mit dem Browser — das entscheidet die Person, nicht diese
            Maske.
          */}
          <div className="grid gap-2">
            <Label htmlFor="sessionLifetimeDays">Angemeldet bleiben</Label>
            <Select
              name="sessionLifetimeDays"
              defaultValue={String(settings.sessionLifetimeDays)}
              disabled={pending}
            >
              <SelectTrigger id="sessionLifetimeDays" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_LIFETIME_DAYS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {SESSION_LIFETIME_LABELS[days]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {result && (
            <Alert
              variant={result.ok ? "default" : "destructive"}
              className="rounded-2xl border-border px-4 py-3"
            >
              {result.ok ? <CheckCircle2Icon /> : <TriangleAlertIcon />}
              <AlertDescription>
                {result.ok ? result.message : result.error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="justify-end rounded-b-3xl border-t border-border bg-transparent">
          <Button
            type="submit"
            className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            disabled={pending}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {pending ? "Speichern …" : "Speichern"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
