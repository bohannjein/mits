"use client";

import { CheckCircle2Icon } from "lucide-react";

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
import type { MITSTicketDraft } from "@/types/mits";

/**
 * What a validated draft looks like after submit. There is no persistence yet, so
 * this shows the exact payload that will be POSTed once the backend exists —
 * which is also the quickest way to eyeball whether a schema validates as
 * intended.
 */
export function DraftReceipt({
  draft,
  onDismiss,
}: {
  draft: MITSTicketDraft;
  onDismiss: () => void;
}) {
  return (
    <Card className="rounded-sm border-2 border-border shadow-brutal ring-0">
      <CardHeader>
        <CheckCircle2Icon className="size-5 text-primary" aria-hidden />
        <CardTitle className="mt-2 uppercase">Entwurf validiert</CardTitle>
        <CardDescription>
          Das Schema hat die Eingaben akzeptiert. Persistenz und Versand folgen mit
          dem Backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-sm font-mono">
            source: {draft.source}
          </Badge>
          <Badge variant="outline" className="rounded-sm font-mono">
            schema: {draft.form_schema_id ?? "—"}
          </Badge>
          <Badge className="rounded-sm font-mono">
            priority: {draft.priority}
          </Badge>
        </div>
        <pre className="max-h-72 overflow-auto rounded-sm border-2 border-border bg-muted p-3 font-mono text-xs">
          {JSON.stringify(draft.payload, jsonReplacer, 2)}
        </pre>
      </CardContent>
      <CardFooter className="justify-end rounded-none border-t-2">
        <Button variant="outline" className="rounded-sm" onClick={onDismiss}>
          Weiteres Ticket erfassen
        </Button>
      </CardFooter>
    </Card>
  );
}

/** File objects serialise to `{}` — show name and size instead. */
function jsonReplacer(_key: string, value: unknown) {
  if (typeof File !== "undefined" && value instanceof File) {
    return `${value.name} (${Math.max(1, Math.round(value.size / 1024))} KB)`;
  }
  return value;
}
