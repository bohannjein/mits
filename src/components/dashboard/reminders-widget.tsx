"use client";

import { BellRingIcon, CheckIcon, ClockIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect } from "react";

import { completeReminderAction } from "@/app/actions/reminders";
import { useToast } from "@/components/feedback/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   „Anstehende Erinnerungen" — one card, chronological.

   **Overdue and upcoming in one list, not two sections.** Ordered by due time, so
   the thing that has been waiting since yesterday sits above the thing that is
   not due until four. Split into „fällig" and „später" the longest-waiting item
   would end up below something that has not happened yet, which is the one
   ordering a to-do list must not have.

   **The tick is one click and undoable in the same render.** Nothing here deletes;
   `completeReminderAction` flips `is_done`, so a mis-tick is a second click on the
   row that has not disappeared yet. That is why the storage layer keeps the row
   instead of removing it.

   Renders nothing at all on an empty list. An empty card that says „keine
   Erinnerungen" is a permanent reminder that a feature exists, on the one surface
   where space is most contested.
   ────────────────────────────────────────────────────────────────────────── */

export interface ReminderWidgetRow {
  id: string;
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  /** Formatted in the instance's timezone by the server. */
  dueLabel: string;
  note: string;
  overdue: boolean;
}

export function RemindersWidget({
  rows,
  /** Where a row links to — the two worlds have two ticket routes. */
  detailBase,
}: {
  rows: ReminderWidgetRow[];
  detailBase: string;
}) {
  if (rows.length === 0) return null;

  const due = rows.filter((row) => row.overdue).length;

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-elev-1 ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <span className="grid size-8 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
            <BellRingIcon className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
          Anstehende Erinnerungen
          {due > 0 && (
            <Badge className="ml-auto h-auto rounded-full bg-warning/20 px-2 py-0 text-[11px] font-normal text-warning">
              {due} fällig
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="grid gap-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-2xl border border-border px-3 py-2"
          >
            <ClockIcon
              className={cn(
                "size-4 shrink-0",
                row.overdue ? "text-warning" : "text-muted-foreground",
              )}
              strokeWidth={1.5}
              aria-hidden
            />

            <Link
              href={`${detailBase}/${row.ticketId}`}
              className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "block text-xs tabular-nums",
                  row.overdue ? "text-warning" : "text-muted-foreground",
                )}
              >
                {row.dueLabel}
              </span>
              {/* The note when there is one, the ticket title when there is not.
                  Somebody who wrote „Rückruf einplanen" wrote the more useful
                  line, and showing both makes the row two lines tall for the
                  same information. */}
              <span className="block truncate text-sm">
                {row.note || row.ticketTitle}
              </span>
              <span className="block font-mono text-[10px] text-muted-foreground">
                {row.ticketNumber}
              </span>
            </Link>

            <DoneButton reminderId={row.id} ticketId={row.ticketId} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * The tick.
 *
 * One form per row rather than one form with a selected id: each row is its own
 * submission, so two people — or two tabs — ticking different rows cannot end up
 * sending the same id twice. `useActionState` per row also means the spinner
 * belongs to the row that was pressed.
 */
function DoneButton({
  reminderId,
  ticketId,
}: {
  reminderId: string;
  ticketId: string;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(completeReminderAction, null);

  useEffect(() => {
    if (!result) return;
    toast(
      result.ok
        ? { kind: "system", tone: "success", title: result.message }
        : { kind: "system", tone: "warning", title: result.error },
    );
  }, [result, toast]);

  return (
    <form action={action}>
      <input type="hidden" name="reminderId" value={reminderId} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="done" value="1" />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        aria-label="Erinnerung abhaken"
        className="size-8 shrink-0 rounded-full bg-surface-elevated p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {pending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <CheckIcon className="size-4" strokeWidth={1.5} />
        )}
      </Button>
    </form>
  );
}
