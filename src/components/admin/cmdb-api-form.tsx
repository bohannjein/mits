"use client";

import {
  CheckCircle2Icon,
  KeyRoundIcon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState } from "react";

import { clearCMDBTokenAction, rotateCMDBTokenAction } from "@/app/admin/cmdb/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/* ──────────────────────────────────────────────────────────────────────────
   The API token.

   Shown in full after generating, and only then. The stored value is not rendered on a
   page load: a secret that sits in the HTML of a page somebody leaves open is a secret in
   every screenshot and every browser cache of it. Whether one exists is enough to know
   afterwards — a lost token is rotated, not recovered.
   ────────────────────────────────────────────────────────────────────────── */

export function CMDBApiForm({ configured }: { configured: boolean }) {
  const [rotateResult, rotateAction, rotating] = useActionState(
    rotateCMDBTokenAction,
    null,
  );
  const [clearResult, clearAction, clearing] = useActionState(
    clearCMDBTokenAction,
    null,
  );

  const result = rotateResult ?? clearResult;

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium">
          <KeyRoundIcon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
          REST-Schnittstelle
        </CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Ohne Token beantwortet die Schnittstelle nur Anfragen angemeldeter Agenten.
          Skripte senden den Token im Kopf <code>X-MITS-API-Token</code>.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="grid gap-1 rounded-2xl border border-border p-4">
          <span className="label-industrial">Endpunkte</span>
          <code className="font-mono text-xs">GET /api/v1/cmdb/items</code>
          <code className="font-mono text-xs">POST /api/v1/cmdb/items</code>
          <code className="font-mono text-xs">POST /api/v1/cmdb/sync</code>
        </div>

        {rotateResult?.ok && rotateResult.token && (
          <Alert className="rounded-2xl border-border px-4 py-3">
            <CheckCircle2Icon strokeWidth={1.5} />
            <AlertDescription className="grid gap-2">
              <span>Jetzt kopieren — danach wird er nicht mehr angezeigt.</span>
              <code className="block overflow-x-auto rounded-xl bg-surface-elevated p-3 font-mono text-xs">
                {rotateResult.token}
              </code>
            </AlertDescription>
          </Alert>
        )}

        {result && !result.ok && (
          <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        {clearResult?.ok && (
          <Alert className="rounded-2xl border-border px-4 py-3">
            <CheckCircle2Icon strokeWidth={1.5} />
            <AlertDescription>Token entfernt.</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <form action={rotateAction}>
            <Button
              type="submit"
              size="sm"
              disabled={rotating}
              className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              {rotating ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RefreshCwIcon strokeWidth={1.5} />
              )}
              {configured ? "Neuen Token erzeugen" : "Token erzeugen"}
            </Button>
          </form>

          {configured && (
            <form action={clearAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={clearing}
                className="h-9 rounded-full px-4 text-muted-foreground"
              >
                Token entfernen
              </Button>
            </form>
          )}

          <span className="text-xs text-muted-foreground">
            {configured ? "Ein Token ist hinterlegt." : "Kein Token hinterlegt."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
