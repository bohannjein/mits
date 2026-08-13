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
import type { MITSFormSchema, MITSTicket } from "@/types/mits";
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
          {ticket.title} — die Agenten haben die Meldung erhalten. Über die
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

/*
 * There was a second export here: `DraftReceipt`, the Phase-2 developer receipt.
 *
 * Removed rather than repaired. Nothing imported it — its own docstring claimed the
 * schema builder needed it for a raw-shape preview, and the builder does not
 * reference it — so it had been dead through three phases while still saying
 * "Persistenz und Versand folgen mit dem Backend" over three `font-mono` badges of
 * raw enum values (`source: legacy`, `priority: medium`). Two confirmation cards in
 * one file is an invitation to wire up the wrong one, and the wrong one told the
 * reporter their ticket had not been stored.
 *
 * Its `jsonReplacer` went with it: `TicketReceipt` stringifies a flat object of
 * scalars and never needed the File branch.
 */
