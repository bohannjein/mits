"use client";

import {
  ArrowRightLeftIcon,
  CheckCircle2Icon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { dispatchTicketAction } from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/* ──────────────────────────────────────────────────────────────────────────
   Handing a ticket to somebody else.

   Reassignment already exists in the sidebar as a bare picker. What it cannot do
   is the thing that actually happens at a desk: pass the ticket on *and* say
   why. Two controls in two places meant the note was written as a separate step,
   or not at all.

   The note goes in as an internal one, without asking. A handover is written for
   the colleague picking the ticket up, and a dialog that could accidentally mail
   it to the customer would be a dialog nobody uses for the honest version.

   No team or group picker: MITS has roles and agents, not groups. Offering one
   here would be a control whose only possible value is "the same pool as
   before".
   ────────────────────────────────────────────────────────────────────────── */

/** Radix Select has no legal empty value; a real id can never collide with this. */
const UNASSIGNED = "__none";

export function DispatchDialog({
  ticketId,
  agents,
  currentAssignee,
  open,
  onOpenChange,
}: {
  ticketId: string;
  agents: { id: string; name: string }[];
  currentAssignee: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(dispatchTicketAction, null);
  const [assignee, setAssignee] = useState(currentAssignee ?? UNASSIGNED);

  /*
   * Reset when the dialog opens, not when the prop changes.
   *
   * The ticket re-renders under this component every time the live poll finds
   * something — resetting on the prop would wipe a half-made choice mid-edit.
   */
  useEffect(() => {
    if (open) setAssignee(currentAssignee ?? UNASSIGNED);
  }, [open, currentAssignee]);

  // Success closes and reports as a toast; the dialog is gone by then, so an
  // alert inside it would have nowhere to appear.
  useEffect(() => {
    if (result?.ok) {
      toast({ kind: "system", tone: "success", title: result.message });
      onOpenChange(false);
    }
  }, [result, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-medium">
            <ArrowRightLeftIcon
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            Ticket weitergeben
          </DialogTitle>
          <DialogDescription>
            Die Notiz ist intern und geht nicht an den Melder.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-4">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="assigneeId" value={assignee} />

          <div className="grid gap-2">
            <Label htmlFor="dispatch-assignee">Zuständig</Label>
            <Select
              value={assignee}
              onValueChange={setAssignee}
              disabled={pending}
            >
              <SelectTrigger
                id="dispatch-assignee"
                className="h-10 w-full rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Niemand (Pool)</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="dispatch-note">Notiz für die Übernahme</Label>
            <Textarea
              id="dispatch-note"
              name="note"
              rows={4}
              maxLength={4000}
              placeholder="Was der oder die Nächste wissen muss"
              disabled={pending}
              className="rounded-xl"
            />
          </div>

          {result && !result.ok && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-border px-4 py-3"
            >
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-full px-4"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              {pending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckCircle2Icon strokeWidth={1.5} />
              )}
              Weitergeben
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
