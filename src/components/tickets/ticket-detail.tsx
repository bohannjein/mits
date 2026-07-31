import { MapPinIcon } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { SplitView } from "@/components/layout/split-view";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { getSystemTimezone } from "@/lib/system-settings";
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
  const timezone = getSystemTimezone();
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
    /*
     * `overflow-hidden` on the frame: the thread and the metadata each scroll, the page
     * does not. Before this the answers sat *below* the conversation, so a reporter with
     * a long thread had to scroll past all of it to check what they had submitted.
     */
    <main className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-6 py-8">
      <div className="flex min-h-0 w-full max-w-6xl flex-1 flex-col">
        <SplitView
          sidebarLabel="Angaben"
          sidebarWidth="20rem"
          header={
            <>
              <BackLink href={backHref} label={backLabel} />
              <span className="mt-3 block font-mono text-sm text-muted-foreground">
                {formatTicketNumber(ticket.ticket_number)}
              </span>
              <h1 className="mt-1 text-2xl font-normal tracking-tight sm:text-3xl">
                {ticket.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-auto rounded-full px-3 py-1">
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
                <Badge
                  variant={isElevatedPriority(ticket.priority) ? "default" : "outline"}
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
            </>
          }
          main={children}
          sidebar={
            <div className="grid gap-4">
              <div className="grid gap-2">
                <span className="label-industrial">{schema?.title ?? "Angaben"}</span>
                {fields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Keine strukturierten Angaben.
                  </p>
                ) : (
                  <dl className="grid gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                    {fields.map((field) => (
                      <div key={field.name} className="grid gap-0.5">
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="text-sm break-words whitespace-pre-wrap">
                          {field.text}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Gemeldet von {ticket.created_by_email}
              </p>

              {assigneeName !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Bearbeitung: {assigneeName ?? "noch nicht zugewiesen"}
                </p>
              )}
            </div>
          }
        />
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
