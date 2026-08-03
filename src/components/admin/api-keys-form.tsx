"use client";

import {
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import {
  createApiKeyAction,
  deleteApiKeyAction,
} from "@/app/admin/settings/api-keys/actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiKeyRow } from "@/lib/api-keys";

/* ──────────────────────────────────────────────────────────────────────────
   API keys.

   The token appears once, in the panel that follows creation, and is never
   rendered again — the row holds only its hash. A secret re-rendered on every
   visit is a secret in every screenshot of the page and every cached copy of
   it.

   `last_used_at` is the column this table exists for. "Which of these six can
   I delete" is the question an admin actually arrives with, and a list of names
   and dates of creation cannot answer it.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * One row, with its two timestamps already rendered.
 *
 * Formatted by the page rather than here: the instance timezone is a server
 * setting, and formatting in the browser would print each admin's own zone —
 * two people reading the same "zuletzt genutzt" and disagreeing about it.
 */
export interface ApiKeyView extends ApiKeyRow {
  createdLabel: string;
  usedLabel: string;
}

export function ApiKeysForm({ keys }: { keys: ApiKeyView[] }) {
  const [createResult, createAction, creating] = useActionState(
    createApiKeyAction,
    null,
  );
  const [deleteResult, deleteAction, deleting] = useActionState(
    deleteApiKeyAction,
    null,
  );
  const [copied, setCopied] = useState(false);

  const failure =
    createResult && !createResult.ok
      ? createResult
      : deleteResult && !deleteResult.ok
        ? deleteResult
        : null;

  const issued = createResult?.ok ? createResult : null;

  const remove = (id: string) => {
    const data = new FormData();
    data.set("id", id);
    startTransition(() => deleteAction(data));
  };

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium">
          <KeyRoundIcon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
          API-Keys
        </CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Ein Key je System. Gesendet wird er als{" "}
          <code>Authorization: Bearer …</code>.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="grid gap-1 rounded-2xl border border-border p-4">
          <span className="label-industrial">Endpunkte</span>
          <code className="font-mono text-xs">POST /api/v1/tickets</code>
          <code className="font-mono text-xs">GET /api/v1/cmdb/items</code>
          <code className="font-mono text-xs">POST /api/v1/cmdb/items</code>
          <code className="font-mono text-xs">POST /api/v1/cmdb/sync</code>
        </div>

        {issued?.token && (
          <Alert className="rounded-2xl border-border px-4 py-3">
            <CheckCircle2Icon strokeWidth={1.5} />
            <AlertDescription className="grid gap-2">
              <span>Jetzt kopieren — danach wird er nicht mehr angezeigt.</span>
              <code className="block overflow-x-auto rounded-xl bg-surface-elevated p-3 font-mono text-xs">
                {issued.token}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 w-fit rounded-full px-4"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(issued.token as string)
                    .then(() => setCopied(true))
                    // Silent on failure, because the token is on screen: a
                    // clipboard the browser refuses is an inconvenience, not a
                    // lost key.
                    .catch(() => setCopied(false));
                }}
              >
                {copied ? (
                  <CheckCircle2Icon strokeWidth={1.5} />
                ) : (
                  <CopyIcon strokeWidth={1.5} />
                )}
                {copied ? "Kopiert" : "Kopieren"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {failure && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>{failure.error}</AlertDescription>
          </Alert>
        )}

        {deleteResult?.ok && (
          <Alert className="rounded-2xl border-border px-4 py-3">
            <CheckCircle2Icon strokeWidth={1.5} />
            <AlertDescription>{deleteResult.message}</AlertDescription>
          </Alert>
        )}

        <form
          action={createAction}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-border p-4"
        >
          <div className="grid min-w-56 flex-1 gap-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              name="name"
              placeholder="Zabbix Monitoring"
              maxLength={120}
              required
              disabled={creating}
              className="h-10 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            disabled={creating}
            className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            {creating ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <PlusIcon strokeWidth={1.5} />
            )}
            Key erzeugen
          </Button>
        </form>

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Kein Key vergeben. Die Schnittstellen beantworten dann nur Anfragen
            angemeldeter Agenten.
          </p>
        ) : (
          <Table containerClassName="overflow-x-auto">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Angelegt</TableHead>
                <TableHead>Zuletzt genutzt</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {key.handle}…
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {key.createdLabel}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {key.usedLabel}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`„${key.name}“ löschen`}
                      disabled={deleting}
                      onClick={() => remove(key.id)}
                      className="rounded-full"
                    >
                      <Trash2Icon strokeWidth={1.5} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
