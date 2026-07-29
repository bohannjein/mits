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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AuthSettings } from "@/types/mits";

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
      <Card className="rounded-sm border-2 border-border shadow-brutal ring-0">
        <CardHeader>
          <CardTitle className="uppercase">Registrierung</CardTitle>
          <CardDescription>
            Steuert, ob sich neue Nutzer selbst anlegen dürfen und aus welchen
            E-Mail-Domains.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5">
          <div className="flex items-start gap-3 rounded-sm border-2 border-border p-3">
            <Switch
              id="registrationEnabled"
              name="registrationEnabled"
              defaultChecked={settings.registrationEnabled}
              disabled={pending}
            />
            <div className="grid gap-1">
              <Label htmlFor="registrationEnabled">Selbstregistrierung erlauben</Label>
              <p className="text-xs text-muted-foreground">
                Aus: /register zeigt einen Hinweis und legt keine Konten mehr an.
                Das allererste Konto einer Instanz kommt immer durch.
              </p>
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
              className="rounded-sm font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Eine Domain pro Zeile, ohne „@“. Leer lassen für beliebige Domains.
              Der Vergleich ist exakt — <code>firma.de</code> lässt{" "}
              <code>nichtfirma.de</code> nicht zu.
            </p>
          </div>

          {result && (
            <Alert
              variant={result.ok ? "default" : "destructive"}
              className="rounded-sm border-2"
            >
              {result.ok ? <CheckCircle2Icon /> : <TriangleAlertIcon />}
              <AlertDescription>
                {result.ok ? result.message : result.error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="justify-end rounded-none border-t-2">
          <Button type="submit" className="rounded-sm" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {pending ? "Speichern …" : "Speichern"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
