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
import {
  startTransition,
  useActionState,
  useEffect,
  useState,
} from "react";

import {
  assignTicketAction,
  setTicketPriorityAction,
  setTicketStatusAction,
  softDeleteTicketAction,
} from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  SidebarSections,
  type SidebarSection,
} from "@/components/layout/sidebar-section";
import { AuditTrail } from "@/components/tickets/audit-trail";
import { TicketAssets, type AssetRow } from "@/components/tickets/ticket-assets";
import { TicketLinks, type LinkRow } from "@/components/tickets/ticket-links";
import { MajorIncidentPanel } from "@/components/tickets/major-incident-panel";
import { TicketSummaryCard } from "@/components/tickets/ticket-summary";
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

/**
 * Fire a Server Action with fields built here rather than read out of the DOM.
 *
 * The dispatch returned by `useActionState` takes the same `FormData` a `<form>`
 * would have posted, so the action signature is untouched — what changes is where
 * the values come from. Read from the DOM they are one render behind whatever was
 * just clicked; built here they are the click itself.
 *
 * Wrapped in `startTransition` because this is called from an event handler rather
 * than from a form submission: without it React warns, and the `pending` flag that
 * disables the controls never turns on.
 */
/** What the three workflow actions answer with. */
type ActionFeedback =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

function dispatch(
  action: (payload: FormData) => void,
  fields: Record<string, string>,
): void {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  startTransition(() => action(data));
}

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
  /** Null when the summary feature is off or the thread is too short to need one. */
  summarisable = false,
  /** Null unless this ticket is a major incident with children parked behind it. */
  majorIncident = null,
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
  summarisable?: boolean;
  majorIncident?: {
    children: { id: string; number: string; title: string }[];
    resolved: boolean;
  } | null;
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

  const { toast } = useToast();

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

  /*
   * The three dropdowns apply on change, and getting that right is less obvious
   * than it looks.
   *
   * The first version rendered each select inside its own `<form>` and called
   * `form.requestSubmit()` from `onValueChange`. That is broken, and broken in the
   * way that is hardest to see: `requestSubmit` runs synchronously inside the
   * handler, *before* React has committed the render that writes the new value
   * into the hidden native `<select>` Radix keeps for form participation. So the
   * form posted the **previous** value every time — pick "In Bearbeitung" on an
   * open ticket and the server dutifully set it to "Offen" again. The control
   * snapped back, the action reported success, and nothing in the UI said why.
   *
   * There is no form now. The value is React state, and the action is dispatched
   * with a `FormData` built by hand — so what gets sent is exactly what was
   * clicked, with no DOM round-trip in between to be early for.
   */
  const [status, setStatus] = useState<MITSTicket["status"]>(ticket.status);
  const [priority, setPriority] = useState<MITSTicket["priority"]>(
    ticket.priority,
  );
  const [assignee, setAssignee] = useState(ticket.assigned_to ?? UNASSIGNED);

  /*
   * The server has the last word.
   *
   * On success the page revalidates and the prop arrives with the new value, so
   * this is a no-op. On rejection the prop is unchanged while the local state
   * holds the refused choice — `result` in the dependency list is what snaps the
   * control back, so the select never shows a value the ticket does not have.
   */
  useEffect(() => {
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setAssignee(ticket.assigned_to ?? UNASSIGNED);
  }, [ticket.status, ticket.priority, ticket.assigned_to, statusResult, priorityResult, assignResult]);

  const busy = changingStatus || changingPriority || assigning;
  const mine = ticket.assigned_to === currentUserId;

  /*
   * The feedback of the action that ran **last**, not of the first one that ever
   * ran.
   *
   * This was `statusResult ?? priorityResult ?? assignResult`, which is wrong the
   * moment two of them are used in one sitting: once a status change has left a
   * result behind, that result masks every later one, so a rejected reassignment
   * showed "Status geändert." in green. Each action writes into one slot instead,
   * and the newest write wins.
   */
  const [feedback, setFeedback] = useState<ActionFeedback>(null);
  useEffect(() => {
    if (statusResult) setFeedback(statusResult);
  }, [statusResult]);
  useEffect(() => {
    if (priorityResult) setFeedback(priorityResult);
  }, [priorityResult]);
  useEffect(() => {
    if (assignResult) setFeedback(assignResult);
  }, [assignResult]);

  const result = feedback;

  /*
   * A confirmation also goes to the toast stack, not only to the alert below the
   * controls.
   *
   * These sections collapse and the sidebar scrolls independently, so the alert is
   * regularly off-screen at the moment it appears — an agent who changed a status
   * from a scrolled-down sidebar got no feedback at all. The alert stays for the
   * error case, where being next to the control that refused is the point.
   */
  useEffect(() => {
    if (feedback?.ok) {
      toast({ kind: "system", tone: "success", title: feedback.message });
    }
  }, [feedback, toast]);

  const sections: SidebarSection[] = [
    {
      id: "workflow",
      title: "Status & Zuweisung",
      content: (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sb-status" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select
              value={status}
              disabled={busy}
              onValueChange={(next) => {
                const chosen = next as MITSTicket["status"];
                setStatus(chosen);
                dispatch(statusAction, { ticketId: ticket.id, status: chosen });
              }}
            >
              <SelectTrigger id="sb-status" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TicketStatus.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TICKET_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sb-priority" className="text-xs text-muted-foreground">
              Priorität
            </Label>
            <Select
              value={priority}
              disabled={busy}
              onValueChange={(next) => {
                const chosen = next as MITSTicket["priority"];
                setPriority(chosen);
                dispatch(priorityAction, {
                  ticketId: ticket.id,
                  priority: chosen,
                });
              }}
            >
              <SelectTrigger id="sb-priority" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TicketPriorityValues.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TICKET_PRIORITY_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sb-assignee" className="text-xs text-muted-foreground">
              Zuweisung
            </Label>
            <Select
              value={assignee}
              disabled={busy}
              onValueChange={(next) => {
                setAssignee(next);
                dispatch(assignAction, {
                  ticketId: ticket.id,
                  assigneeId: next,
                });
              }}
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
          </div>

          {/* Self-assign stays a button: it is the common case and should not
              require finding your own name in a list. Same dispatch, so it goes
              through the same pending state as the dropdown above it. */}
          <Button
            type="button"
            onClick={() => {
              setAssignee(currentUserId);
              dispatch(assignAction, {
                ticketId: ticket.id,
                assigneeId: currentUserId,
              });
            }}
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

  /*
   * Directly after the workflow panel, before the reporter's details: on a ticket
   * that is a major incident, "which tickets are waiting on me" is the second
   * thing an agent needs after status and assignment.
   */
  if (majorIncident !== null && majorIncident.children.length > 0) {
    sections.push({
      id: "major",
      title: "Hauptstörung",
      badge: (
        <Badge
          variant="secondary"
          className="h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
        >
          {majorIncident.children.length}
        </Badge>
      ),
      content: (
        <MajorIncidentPanel
          ticketId={ticket.id}
          children={majorIncident.children}
          resolved={majorIncident.resolved}
        />
      ),
    });
  }

  if (summarisable) {
    sections.push({
      id: "summary",
      title: "Zusammenfassung",
      content: <TicketSummaryCard ticketId={ticket.id} />,
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
