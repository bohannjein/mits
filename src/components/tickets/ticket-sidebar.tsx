"use client";

import {
  BuildingIcon,
  CheckCircle2Icon,
  GlobeIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserCheckIcon,
} from "lucide-react";
import { useActionState, useRef } from "react";

import {
  assignTicketAction,
  setTicketPriorityAction,
  setTicketStatusAction,
  softDeleteTicketAction,
} from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  SidebarSections,
  type SidebarSection,
} from "@/components/layout/sidebar-section";
import { AuditTrail } from "@/components/tickets/audit-trail";
import { TicketAssets, type AssetRow } from "@/components/tickets/ticket-assets";
import { TicketLinks, type LinkRow } from "@/components/tickets/ticket-links";
import {
  TicketWorklog,
  type WorklogRow,
} from "@/components/tickets/ticket-worklog";
import { formatMinutes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TicketPriorityValues,
  TicketStatus,
  type MITSLocation,
  type MITSTicket,
  type AuditEntry,
  type MITSUserProfile,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket metadata sidebar.

   Every dropdown applies on change — no confirm button. The three server actions
   validate independently and each one is a single field, so there is nothing to
   batch and nothing half-entered to lose. A "Setzen" button next to a select is a
   second click for a decision the agent already made.

   The trade-off: no undo. Acceptable because each field is one value from a fixed
   list and immediately visible in the same control.
   ────────────────────────────────────────────────────────────────────────── */

const UNASSIGNED = "__none";

export function TicketSidebar({
  ticket,
  agents,
  currentUserId,
  location,
  fields,
  /**
   * The reporter's own contact details from their settings, or null when they have
   * filled in none. Read by the page, not here — this is a client component.
   */
  reporter = null,
  /** Admin-only history. Null hides the section entirely rather than showing it empty. */
  auditEntries = null,
  /** Resolved server-side; the sidebar is a client component and cannot read it. */
  timezone,
  /** Null when the linking module is off — the section then does not exist. */
  links = null,
  /** Null when the CMDB module is off. Same rule as `links`. */
  assets = null,
  /** Null when time tracking is off — the section then does not exist. */
  worklog = null,
}: {
  ticket: MITSTicket;
  agents: { id: string; name: string }[];
  currentUserId: string;
  location: MITSLocation | null;
  /** Resolved form answers — label plus rendered value. */
  fields: { name: string; label: string; text: string }[];
  reporter?: MITSUserProfile | null;
  auditEntries?: AuditEntry[] | null;
  timezone: string;
  links?: LinkRow[] | null;
  assets?: {
    attached: AssetRow[];
    suggestions: AssetRow[];
    candidates: AssetRow[];
  } | null;
  worklog?: { entries: WorklogRow[]; today: string } | null;
}) {
  /*
   * Assembled here so the card can decide whether there is an address at all. A
   * reporter who filled in only a city should see that city, not a line of stray
   * commas around empty fields.
   */
  const postalAddress = [
    reporter?.street,
    [reporter?.postal_code, reporter?.city].filter(Boolean).join(" "),
    reporter?.country,
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const [statusResult, statusAction, changingStatus] = useActionState(
    setTicketStatusAction,
    null,
  );
  const [priorityResult, priorityAction, changingPriority] = useActionState(
    setTicketPriorityAction,
    null,
  );
  const [assignResult, assignAction, assigning] = useActionState(
    assignTicketAction,
    null,
  );
  const [deleteResult, deleteAction, deleting] = useActionState(
    softDeleteTicketAction,
    null,
  );

  const statusForm = useRef<HTMLFormElement>(null);
  const priorityForm = useRef<HTMLFormElement>(null);
  const assignForm = useRef<HTMLFormElement>(null);

  const busy = changingStatus || changingPriority || assigning;
  const result = statusResult ?? priorityResult ?? assignResult;
  const mine = ticket.assigned_to === currentUserId;

  const sections: SidebarSection[] = [
    {
      id: "workflow",
      title: "Status & Zuweisung",
      content: (
        <div className="grid gap-4">
          <form ref={statusForm} action={statusAction} className="grid gap-1.5">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <Label htmlFor="sb-status" className="text-xs text-muted-foreground">
                        Status
                      </Label>
                      <Select
                        name="status"
                        defaultValue={ticket.status}
                        disabled={busy}
                        // Submitting from the change handler is what makes it apply without
                        // a button; the hidden native select Radix renders carries the value.
                        onValueChange={() => statusForm.current?.requestSubmit()}
                      >
                        <SelectTrigger id="sb-status" className="h-10 w-full rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TicketStatus.options.map((status) => (
                            <SelectItem key={status} value={status}>
                              {TICKET_STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </form>
          
                    <form ref={priorityForm} action={priorityAction} className="grid gap-1.5">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <Label htmlFor="sb-priority" className="text-xs text-muted-foreground">
                        Priorität
                      </Label>
                      <Select
                        name="priority"
                        defaultValue={ticket.priority}
                        disabled={busy}
                        onValueChange={() => priorityForm.current?.requestSubmit()}
                      >
                        <SelectTrigger id="sb-priority" className="h-10 w-full rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TicketPriorityValues.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {TICKET_PRIORITY_LABELS[priority]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </form>
          
                    <form ref={assignForm} action={assignAction} className="grid gap-1.5">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <Label htmlFor="sb-assignee" className="text-xs text-muted-foreground">
                        Zuweisung
                      </Label>
                      <Select
                        name="assigneeId"
                        defaultValue={ticket.assigned_to ?? UNASSIGNED}
                        disabled={busy}
                        onValueChange={() => assignForm.current?.requestSubmit()}
                      >
                        <SelectTrigger id="sb-assignee" className="h-10 w-full rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Nicht zugewiesen</SelectItem>
                          {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </form>
          
                    {/* Self-assign stays a button: it is the common case and should not
                        require finding your own name in a list. */}
                    <form action={assignAction}>
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <input type="hidden" name="assigneeId" value={currentUserId} />
                      <Button
                        type="submit"
                        className="h-9 w-full rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                        disabled={busy || mine}
                      >
                        {assigning ? (
                          <Loader2Icon className="animate-spin" />
                        ) : (
                          <UserCheckIcon strokeWidth={1.5} />
                        )}
                        {mine ? "Dir zugewiesen" : "Mir zuweisen"}
                      </Button>
                    </form>
          
                    {result && (
                      <Alert
                        variant={result.ok ? "default" : "destructive"}
                        className="rounded-xl border-border px-3 py-2"
                      >
                        {result.ok ? (
                          <CheckCircle2Icon strokeWidth={1.5} />
                        ) : (
                          <TriangleAlertIcon strokeWidth={1.5} />
                        )}
                        <AlertDescription className="text-xs">
                          {result.ok ? result.message : result.error}
                        </AlertDescription>
                      </Alert>
                    )}
        </div>
      ),
    },
    {
      id: "reporter",
      title: "Melder",
      content: (
        <div className="grid gap-2 text-sm">
          <span className="flex items-center gap-2 break-all">
                      <MailIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      {ticket.created_by_email}
                    </span>
                    <span className="flex items-center gap-2">
                      <MapPinIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      {location ? location.name : "Kein Standort angegeben"}
                    </span>
                    {/*
                     * The reporter's own details, maintained in their settings. Only the rows
                     * they actually filled in: a card of "nicht erfasst" placeholders is noise
                     * on every ticket, and an absent phone number is not information.
                     */}
                    {reporter?.phone && (
                      <span className="flex items-center gap-2">
                        <PhoneIcon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <a
                          href={`tel:${reporter.phone}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {reporter.phone}
                        </a>
                      </span>
                    )}
          
                    {postalAddress && (
                      <span className="flex items-start gap-2">
                        <BuildingIcon
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <span className="whitespace-pre-line">{postalAddress}</span>
                      </span>
                    )}
          
                    {reporter?.website && (
                      <span className="flex items-center gap-2 break-all">
                        <GlobeIcon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        {/* Stored only after `isWebsiteUrl` confirmed http(s) with a host, so
                            linking it is safe — but it still leaves our origin, hence noopener. */}
                        <a
                          href={reporter.website}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="underline-offset-4 hover:underline"
                        >
                          {reporter.website.replace(/^https?:\/\//, "")}
                        </a>
                      </span>
                    )}
          
                    {reporter?.note && (
                      <span className="rounded-xl border border-border bg-background px-3 py-2 text-xs whitespace-pre-line text-muted-foreground">
                        {reporter.note}
                      </span>
                    )}
        </div>
      ),
    },
  ];

  if (fields.length > 0) {
    sections.push({
      id: "fields",
      title: "Angaben",
      badge: (
        <Badge
          variant="secondary"
          className="h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
        >
          {fields.length}
        </Badge>
      ),
      content: (
        <dl className="grid gap-3">
          {fields.map((field) => (
            <div key={field.name} className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="text-sm break-words whitespace-pre-wrap">
                {field.text}
              </dd>
            </div>
          ))}
        </dl>
      ),
    });
  }

  if (worklog !== null) {
    const total = worklog.entries.reduce((sum, entry) => sum + entry.minutes, 0);
    sections.push({
      id: "worklog",
      title: "Zeiterfassung",
      // The total in the collapsed header, so an agent does not have to open the
      // section to answer "how long has this taken".
      badge:
        total > 0 ? (
          <Badge
            variant="secondary"
            className="h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
          >
            {formatMinutes(total)}
          </Badge>
        ) : undefined,
      content: (
        <TicketWorklog
          ticketId={ticket.id}
          entries={worklog.entries}
          today={worklog.today}
        />
      ),
    });
  }

  if (links !== null) {
    sections.push({
      id: "links",
      title: "Verknüpfungen",
      badge:
        links.length > 0 ? (
          <Badge
            variant="secondary"
            className="h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
          >
            {links.length}
          </Badge>
        ) : undefined,
      content: <TicketLinks compact bare ticketId={ticket.id} links={links} />,
    });
  }

  if (assets !== null) {
    sections.push({
      id: "assets",
      title: "Betroffene Objekte",
      badge:
        assets.attached.length > 0 ? (
          <Badge
            variant="secondary"
            className="h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
          >
            {assets.attached.length}
          </Badge>
        ) : undefined,
      content: (
        <TicketAssets
          ticketId={ticket.id}
          attached={assets.attached}
          suggestions={assets.suggestions}
          candidates={assets.candidates}
        />
      ),
    });
  }

  if (auditEntries !== null) {
    sections.push({
      id: "audit",
      title: "Historie",
      badge: (
        <Badge
          variant="secondary"
          className="h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
        >
          {auditEntries.length}
        </Badge>
      ),
      content: <AuditTrail bare entries={auditEntries} timezone={timezone} />,
    });
  }

  return (
    <div className="grid gap-4">
      {/*
        Workflow and reporter start open — those are what an agent reaches for. The rest
        collapses, which is what keeps a long sidebar from becoming its own scroll
        marathon on a ticket with many answers and a long history.
      */}
      <SidebarSections sections={sections} defaultOpen={["workflow", "reporter"]} />

      {/*
        Deleting is a soft delete: `deleted_at` is set, every read filters on it, and
        the row stays for the trash view. Said out loud in the button's own text,
        because "Löschen" that is reversible and "Löschen" that is not are different
        promises and the agent is entitled to know which one this is.
      */}
      <form action={deleteAction} className="grid gap-2">
        <input type="hidden" name="ticketId" value={ticket.id} />
        {deleteResult && !deleteResult.ok && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-3 py-2"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription className="text-xs">
              {deleteResult.error}
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={deleting}
          className="h-9 w-full justify-start rounded-xl px-3 text-xs text-muted-foreground hover:text-destructive"
        >
          {deleting ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <Trash2Icon strokeWidth={1.5} />
          )}
          In den Papierkorb
        </Button>
        <p className="px-3 text-[11px] text-muted-foreground">
          Wiederherstellbar unter Daten &amp; Aufbewahrung.
        </p>
      </form>
    </div>
  );
}
