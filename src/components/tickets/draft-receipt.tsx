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
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
      <CardHeader>
        <span className="grid size-11 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2Icon className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <CardTitle className="mt-4 text-lg font-medium">
          Entwurf validiert
        </CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Das Schema hat die Eingaben akzeptiert. Persistenz und Versand folgen mit
          dem Backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full font-mono">
            source: {draft.source}
          </Badge>
          <Badge variant="outline" className="rounded-full font-mono">
            schema: {draft.form_schema_id ?? "—"}
          </Badge>
          <Badge className="rounded-full font-mono">
            priority: {draft.priority}
          </Badge>
        </div>
        {/* Mono stays: this is raw JSON, and a proportional font would misalign
            the indentation that makes it readable. */}
        <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-muted p-4 font-mono text-xs">
          {JSON.stringify(draft.payload, jsonReplacer, 2)}
        </pre>
      </CardContent>
      <CardFooter className="justify-end rounded-b-3xl border-t border-border bg-transparent">
        <Button
          className="rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
          onClick={onDismiss}
        >
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
