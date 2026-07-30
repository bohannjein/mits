"use client";

import { CheckCircle2Icon, CodeIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
import { resolveFields } from "@/lib/forms/schema-to-zod";
import type { MITSFormSchema, MITSTicket, MITSTicketDraft } from "@/types/mits";
import { formatTicketNumber } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Confirmation after a ticket was filed.

   A reporter gets their ticket number, a readable summary and two next steps.
   The raw payload is not what someone who just described a broken printer needs
   to see — it is behind a toggle, opt-in, for whoever is debugging a schema.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketReceipt({
  ticket,
  schema,
  onAnother,
}: {
  ticket: MITSTicket;
  /** Supplies field labels. Absent for a schema that has since been deleted. */
  schema?: MITSFormSchema;
  onAnother: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  // Same label resolution the form renderer uses, so the confirmation names a
  // field exactly the way the person just saw it named.
  const labels = new Map(
    schema ? resolveFields(schema).map((field) => [field.name, field.label]) : [],
  );

  const rows = Object.entries(ticket.payload)
    .map(([name, value]) => ({
      name,
      label: labels.get(name) ?? name,
      text: formatValue(value),
    }))
    .filter((row) => row.text !== "");

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
      <CardHeader>
        <span className="grid size-11 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2Icon className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <CardTitle className="mt-4 text-lg font-medium">
          Ticket {formatTicketNumber(ticket.ticket_number)} erfolgreich erstellt
        </CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          {ticket.title} — die Technik hat die Meldung erhalten. Über die
          Ticket-Nummer lässt sie sich jederzeit wiederfinden.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {rows.length > 0 && (
          <dl className="grid gap-0 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {rows.map((row) => (
              <div
                key={row.name}
                className="grid gap-0.5 p-3 sm:grid-cols-[14rem_1fr]"
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="text-sm break-words whitespace-pre-wrap">
                  {row.text}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* Opt-in, for schema debugging. Not something a reporter has to step past. */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-muted-foreground"
            aria-expanded={showRaw}
            onClick={() => setShowRaw((open) => !open)}
          >
            <CodeIcon className="size-3.5" strokeWidth={1.5} />
            {showRaw ? "Technische Details ausblenden" : "Technische Details"}
          </Button>

          {showRaw && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-border bg-muted p-4 font-mono text-xs">
              {JSON.stringify(
                {
                  id: ticket.id,
                  ticket_number: ticket.ticket_number,
                  form_schema_id: ticket.form_schema_id,
                  source: ticket.source,
                  priority: ticket.priority,
                  location_id: ticket.location_id,
                  payload: ticket.payload,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-wrap justify-end gap-2 rounded-b-3xl border-t border-border bg-transparent">
        <Button
          className="rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
          onClick={onAnother}
        >
          Neues Ticket erstellen
        </Button>
        <Button
          asChild
          className="rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
        >
          <Link href={`/customer/tickets/${ticket.id}`}>
            <TicketIcon strokeWidth={1.5} />
            Ticket anzeigen
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    // Attachment lists carry objects; show the file names people recognise.
    return value
      .map((entry) =>
        entry && typeof entry === "object" && "name" in entry
          ? String((entry as { name: unknown }).name)
          : String(entry),
      )
      .join(", ");
  }
  if (typeof value === "object") return "";
  return String(value).trim();
}

/**
 * The old developer receipt: a validated draft rendered as JSON.
 *
 * Kept for the schema builder's preview, where the raw shape *is* the point.
 * The intake no longer uses it — see `TicketReceipt` above.
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
