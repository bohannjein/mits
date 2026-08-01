"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { addWorklogAction, deleteWorklogAction } from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Booked time on a ticket.

   Two ways in, on purpose. Most bookings are written afterwards from memory
   ("that was about twenty minutes"), so the text field is the primary control and
   accepts whatever shape the agent types — `45`, `1:30`, `1,5 Std`. The stopwatch
   is for the other case, a call that is happening right now.

   **The timer is a stopwatch, not a session.** It lives in component state and
   dies with the tab; stopping it only fills the duration field, and nothing is
   recorded until the agent presses "Erfassen". A timer that survived a reload
   would have to be a server-side row, and a forgotten one would then quietly book
   nine hours to a ticket somebody closed on Friday.
   ────────────────────────────────────────────────────────────────────────── */

export interface WorklogRow {
  id: string;
  userName: string;
  minutes: number;
  note: string;
  performedAt: string;
  /** Whether the signed-in agent may remove it — decided server-side. */
  removable: boolean;
}

export function TicketWorklog({
  ticketId,
  entries,
  /** `YYYY-MM-DD` from the server, so the date field agrees with the instance's day. */
  today,
}: {
  ticketId: string;
  entries: WorklogRow[];
  today: string;
}) {
  const [addResult, addAction, adding] = useActionState(addWorklogAction, null);
  const [deleteResult, deleteAction, deleting] = useActionState(
    deleteWorklogAction,
    null,
  );

  const [duration, setDuration] = useState("");
  /** Epoch ms the stopwatch started at, or null while it is stopped. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  // One interval while running. Reading the wall clock rather than counting ticks:
  // a throttled background tab fires the callback less often, and a counter would
  // then under-report exactly the long call this is meant to capture.
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(
      () => setElapsed(Date.now() - startedAt),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (addResult?.ok) setDuration("");
  }, [addResult]);

  const stop = () => {
    if (startedAt === null) return;
    // Rounded up to the minute: a four-minute call is not zero minutes of work,
    // and rounding down is the direction that loses time nobody gets back.
    const minutes = Math.max(1, Math.ceil((Date.now() - startedAt) / 60_000));
    setDuration(String(minutes));
    setStartedAt(null);
    setElapsed(0);
  };

  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const result = addResult ?? deleteResult;
  const busy = adding || deleting;

  return (
    <div className="grid gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">Erfasste Zeit</span>
        <span className="text-lg font-medium tabular-nums">
          {formatMinutes(total)}
        </span>
      </div>

      <form ref={form} action={addAction} className="grid gap-2.5">
        <input type="hidden" name="ticketId" value={ticketId} />

        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="wl-duration" className="text-xs text-muted-foreground">
              Dauer
            </Label>
            <Input
              id="wl-duration"
              name="duration"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              disabled={busy}
              placeholder="45, 1:30 oder 1,5 Std"
              className="h-10 rounded-xl"
            />
          </div>

          {/*
            The stopwatch. While running it shows the running total and its own
            button becomes "stop" — one control for both states, because two
            buttons where only ever one is usable is a row of dead pixels.
          */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => (startedAt === null ? setStartedAt(Date.now()) : stop())}
            aria-label={startedAt === null ? "Timer starten" : "Timer stoppen"}
            className={cn(
              "h-10 shrink-0 rounded-xl px-3 text-xs tabular-nums",
              startedAt !== null &&
                "bg-bubble-other text-foreground hover:bg-bubble-other hover:text-foreground",
            )}
          >
            {startedAt === null ? (
              <PlayIcon strokeWidth={1.5} />
            ) : (
              <SquareIcon strokeWidth={1.5} />
            )}
            {startedAt === null ? "Timer" : clock(elapsed)}
          </Button>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="wl-note" className="text-xs text-muted-foreground">
            Tätigkeit
          </Label>
          <Input
            id="wl-note"
            name="note"
            disabled={busy}
            maxLength={500}
            placeholder="Was wurde gemacht?"
            className="h-10 rounded-xl"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="wl-date" className="text-xs text-muted-foreground">
            Datum
          </Label>
          <Input
            id="wl-date"
            name="performedAt"
            type="date"
            defaultValue={today}
            max={today}
            disabled={busy}
            className="h-10 rounded-xl"
          />
        </div>

        <Button
          type="submit"
          disabled={busy || duration.trim() === ""}
          className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {adding ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <PlusIcon strokeWidth={1.5} />
          )}
          Erfassen
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

      {entries.length > 0 && (
        <ul className="grid gap-1.5 border-t border-border pt-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2 text-xs"
            >
              <span className="font-medium tabular-nums">
                {formatMinutes(entry.minutes)}
              </span>
              <span className="truncate text-muted-foreground" title={entry.note}>
                {entry.note || "—"}
              </span>
              {entry.removable ? (
                <form action={deleteAction} className="justify-self-end">
                  <input type="hidden" name="ticketId" value={ticketId} />
                  <input type="hidden" name="worklogId" value={entry.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label="Eintrag entfernen"
                    className="size-6 rounded-lg p-0 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2Icon className="size-3" strokeWidth={1.5} />
                  </Button>
                </form>
              ) : (
                <span />
              )}
              <span className="col-span-3 text-[11px] text-muted-foreground">
                {entry.userName} · {entry.performedAt}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** `12:34` — the running stopwatch, minutes and seconds. */
function clock(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
