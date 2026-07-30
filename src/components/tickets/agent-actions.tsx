"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  TriangleAlertIcon,
  UserCheckIcon,
} from "lucide-react";
import { useActionState } from "react";

import {
  assignTicketAction,
  setTicketPriorityAction,
  setTicketStatusAction,
} from "@/app/tickets/[id]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  TicketPriority,
  TicketStatus,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Agent quick actions.

   Rendered only for staff, but that is presentation. Each action re-checks the
   role and the ticket on the server — see app/tickets/[id]/actions.ts.

   Three separate forms rather than one: an agent changing a status should not
   have their half-typed assignment submitted along with it.
   ────────────────────────────────────────────────────────────────────────── */

const UNASSIGNED = "__none";

export function AgentActions({
  ticket,
  agents,
  currentUserId,
}: {
  ticket: MITSTicket;
  agents: { id: string; name: string; email: string }[];
  currentUserId: string;
}) {
  const [assignResult, assignAction, assigning] = useActionState(
    assignTicketAction,
    null,
  );
  const [statusResult, statusAction, changingStatus] = useActionState(
    setTicketStatusAction,
    null,
  );
  const [priorityResult, priorityAction, changingPriority] = useActionState(
    setTicketPriorityAction,
    null,
  );

  const mine = ticket.assigned_to === currentUserId;
  const busy = assigning || changingStatus || changingPriority;
  const result = assignResult ?? statusResult ?? priorityResult;

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Bearbeitung</CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Zuweisung, Status und Priorität. Änderungen sind sofort für alle
          sichtbar.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label>Zuweisung</Label>

          <div className="flex flex-wrap gap-2">
            {/* One-click self-assign: the overwhelmingly common case, and it
                should not require finding your own name in a list. */}
            <form action={assignAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <input type="hidden" name="assigneeId" value={currentUserId} />
              <Button
                type="submit"
                className="h-10 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
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

            <form action={assignAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Select
                name="assigneeId"
                defaultValue={ticket.assigned_to ?? UNASSIGNED}
                disabled={busy}
              >
                <SelectTrigger
                  aria-label="Zuweisen an"
                  className="h-10 w-56 rounded-xl"
                >
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
              <Button
                type="submit"
                className="h-10 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                disabled={busy}
              >
                Übernehmen
              </Button>
            </form>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <form action={statusAction} className="grid gap-2">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <Label htmlFor="status-select">Status</Label>
            <div className="flex gap-2">
              <Select
                name="status"
                defaultValue={ticket.status}
                disabled={busy}
              >
                <SelectTrigger
                  id="status-select"
                  className="h-10 w-full rounded-xl"
                >
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
              <Button
                type="submit"
                className="h-10 shrink-0 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                disabled={busy}
              >
                Setzen
              </Button>
            </div>
          </form>

          <form action={priorityAction} className="grid gap-2">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <Label htmlFor="priority-select">Priorität</Label>
            <div className="flex gap-2">
              <Select
                name="priority"
                defaultValue={ticket.priority}
                disabled={busy}
              >
                <SelectTrigger
                  id="priority-select"
                  className="h-10 w-full rounded-xl"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TicketPriority.options.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {TICKET_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="submit"
                className="h-10 shrink-0 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                disabled={busy}
              >
                Setzen
              </Button>
            </div>
          </form>
        </div>

        {result && (
          <Alert
            variant={result.ok ? "default" : "destructive"}
            className="rounded-2xl border-border px-4 py-3"
          >
            {result.ok ? (
              <CheckCircle2Icon strokeWidth={1.5} />
            ) : (
              <TriangleAlertIcon strokeWidth={1.5} />
            )}
            <AlertDescription>
              {result.ok ? result.message : result.error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
