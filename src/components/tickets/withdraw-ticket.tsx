"use client";

import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { withdrawTicketAction } from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/* ──────────────────────────────────────────────────────────────────────────
   "Doch nicht" — the reporter takes their own ticket back.

   Only offered while it is still open and unassigned, which is the same condition
   `withdrawTicket` enforces. Once somebody has picked it up, work has happened,
   and the honest thing is a reply saying it resolved itself rather than a button
   that deletes a colleague's afternoon.

   **Two presses, not a dialog.** The button turns into its own confirmation in
   place. A modal for this would be a second surface to style, to trap focus in and
   to dismiss on Escape, for a decision whose entire content is one sentence — and
   the inline version cannot be mistakenly confirmed by a stray Enter, because the
   confirm button is not the one that had focus.
   ────────────────────────────────────────────────────────────────────────── */

export function WithdrawTicket({ ticketId }: { ticketId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [result, action, pending] = useActionState(withdrawTicketAction, null);

  if (!confirming) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          className="h-8 rounded-full px-3 text-xs text-muted-foreground"
        >
          <Trash2Icon className="size-3.5" strokeWidth={1.5} />
          Ticket zurückziehen
        </Button>

        {/* The refusal, when the ticket was picked up between render and press. */}
        {result && !result.ok && (
          <Alert
            variant="destructive"
            className="mt-2 rounded-xl border-border px-3 py-2"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription className="text-xs">{result.error}</AlertDescription>
          </Alert>
        )}
      </>
    );
  }

  return (
    <form action={action} className="mt-2 grid gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      {/* States the consequence, not the mechanism — the reporter needs to know
          the conversation goes with it, not that a column gets a timestamp. */}
      <p className="text-xs text-muted-foreground">
        Das Ticket und der bisherige Verlauf werden entfernt. Rückgängig machen
        kann das nur die Administration.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          className="h-8 rounded-full px-3 text-xs"
          disabled={pending}
        >
          {pending ? "Wird zurückgezogen …" : "Ja, zurückziehen"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Behalten
        </Button>
      </div>
    </form>
  );
}
