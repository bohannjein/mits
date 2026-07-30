"use client";

import {
  BuildingIcon,
  CheckCircle2Icon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  TriangleAlertIcon,
  UserCheckIcon,
} from "lucide-react";
import { useActionState, useRef } from "react";

import {
  assignTicketAction,
  setTicketPriorityAction,
  setTicketStatusAction,
} from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  children,
}: {
  ticket: MITSTicket;
  agents: { id: string; name: string }[];
  currentUserId: string;
  location: MITSLocation | null;
  /** Resolved form answers — label plus rendered value. */
  fields: { name: string; label: string; text: string }[];
  /** The links card, rendered by the page so this stays a pure client component. */
  children?: React.ReactNode;
}) {
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

  const statusForm = useRef<HTMLFormElement>(null);
  const priorityForm = useRef<HTMLFormElement>(null);
  const assignForm = useRef<HTMLFormElement>(null);

  const busy = changingStatus || changingPriority || assigning;
  const result = statusResult ?? priorityResult ?? assignResult;
  const mine = ticket.assigned_to === currentUserId;

  return (
    <div className="grid gap-4">
      <Card className="rounded-2xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Bearbeitung</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
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
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Melder</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
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
           * No department: MITS has no such field on a user, and inventing one
           * here would mean showing an empty row on every ticket forever. Add it
           * to the user model first if it is needed.
           */}
          <span className="flex items-center gap-2 text-muted-foreground">
            <BuildingIcon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            Abteilung nicht erfasst
          </span>
        </CardContent>
      </Card>

      {fields.length > 0 && (
        <Card className="rounded-2xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Angaben</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {children}
    </div>
  );
}
