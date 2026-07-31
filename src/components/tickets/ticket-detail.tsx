import { MapPinIcon } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { MITSFormSchema, MITSLocation, MITSTicket } from "@/types/mits";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketNumber,
  isElevatedPriority,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The shared half of a ticket page: header, badges, structured answers.

   Both worlds render this; what differs is what they put around it. The
   reporter's page adds only the thread, the agent's page adds the workflow panel
   and internal notes. That split lives in the two routes rather than in an
   `isAgent` branch here — two guarded routes are harder to open by accident than
   one page with a condition inside it.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketDetail({
  ticket,
  schema,
  location,
  backHref,
  backLabel,
  assigneeName,
  children,
}: {
  ticket: MITSTicket;
  schema?: MITSFormSchema;
  location: MITSLocation | null;
  backHref: string;
  backLabel: string;
  /** Omitted on the reporter's page — who works on it is not their business. */
  assigneeName?: string | null;
  children: React.ReactNode;
}) {
  // `resolveFields` is the same label resolution the renderer and the AI preview
  // use, so a field is named identically wherever it appears.
  const labels = new Map(
    schema ? resolveFields(schema).map((field) => [field.name, field.label]) : [],
  );

  const fields = Object.entries(ticket.payload)
    .map(([name, value]) => ({
      name,
      label: labels.get(name) ?? name,
      text: formatValue(value),
    }))
    .filter((row) => row.text !== "");

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-10">
      <div className="grid w-full max-w-4xl gap-8">
        <div>
          <BackLink href={backHref} label={backLabel} />

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="font-mono text-sm text-muted-foreground">
                {formatTicketNumber(ticket.ticket_number)}
              </span>
              <h1 className="mt-1 text-2xl font-normal tracking-tight sm:text-3xl">
                {ticket.title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Gemeldet von {ticket.created_by_email} am{" "}
                {ticket.created_at.toLocaleString("de-DE", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-auto rounded-full px-3 py-1">
                {TICKET_STATUS_LABELS[ticket.status]}
              </Badge>
              <Badge
                variant={
                  isElevatedPriority(ticket.priority)
                    ? "default"
                    : "outline"
                }
                className="h-auto rounded-full px-3 py-1"
              >
                {TICKET_PRIORITY_LABELS[ticket.priority]}
              </Badge>
              {location && (
                <Badge
                  variant="outline"
                  className="h-auto rounded-full px-3 py-1 font-normal"
                >
                  <MapPinIcon className="size-3" strokeWidth={1.5} />
                  {location.name}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator className="bg-border" />

        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              {schema?.title ?? "Angaben"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine strukturierten Angaben.
              </p>
            ) : (
              <dl className="grid gap-0 divide-y divide-border overflow-hidden rounded-2xl border border-border">
                {fields.map((field) => (
                  <div
                    key={field.name}
                    className="grid gap-0.5 p-3 sm:grid-cols-[14rem_1fr]"
                  >
                    <dt className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </dt>
                    <dd className="text-sm break-words whitespace-pre-wrap">
                      {field.text}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {assigneeName !== undefined && (
              <p className="mt-4 text-xs text-muted-foreground">
                Bearbeitung: {assigneeName ?? "noch nicht zugewiesen"}
              </p>
            )}
          </CardContent>
        </Card>

        {children}
      </div>
    </main>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
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
