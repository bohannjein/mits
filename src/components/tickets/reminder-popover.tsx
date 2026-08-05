"use client";

import {
  BellRingIcon,
  CalendarIcon,
  ClockIcon,
  Loader2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  deleteReminderAction,
  setReminderAction,
} from "@/app/actions/reminders";
import { useToast } from "@/components/feedback/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { REMINDER_PRESETS, type ReminderPreset } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   „Nicht jetzt" — with a time attached.

   Three offsets and a free field. The offsets submit immediately: „in 2 Stunden"
   is one decision, and asking somebody to press a second button to confirm it
   turns the shortest path into two clicks. The free field is the one case where
   the choice is not complete until a date has been typed, so only it has its own
   submit.

   **The due time is never computed here.** The form posts a preset *name* or the
   raw `datetime-local` reading, and the server resolves both through
   `resolveReminderDue` in the instance's timezone. A browser that computed the
   instant would be a second implementation of „morgen 09:00", and the two
   disagree across a DST switch — on exactly the reminders that were set across
   one.

   **The badge counts, it does not name.** A time on the button would be a fourth
   piece of metadata in a row that already carries status, priority and assignee,
   and it would be the only one that changes by itself. What matters at a glance is
   *whether* something is set; when is one click away.
   ────────────────────────────────────────────────────────────────────────── */

export interface ReminderRow {
  id: string;
  /** Already formatted in the instance's timezone by the server. */
  dueLabel: string;
  note: string;
  /** Whether the moment has passed. Decides the badge tone, nothing else. */
  overdue: boolean;
}

export function ReminderPopover({
  ticketId,
  reminders,
}: {
  ticketId: string;
  /** This viewer's open reminders on this ticket, soonest first. */
  reminders: ReminderRow[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState(setReminderAction, null);
  const [custom, setCustom] = useState("");

  /*
   * Success closes and reports as a toast.
   *
   * The popover is anchored to a button in a bar that scrolls with the ticket
   * header, so an alert inside it would be a message in a box that is about to be
   * dismissed. The failure case stays inside, next to the field that was refused.
   */
  useEffect(() => {
    if (!result?.ok) return;
    toast({ kind: "reminder", tone: "success", title: result.message });
    setOpen(false);
    setCustom("");
  }, [result, toast]);

  const overdue = reminders.some((entry) => entry.overdue);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          className={cn(
            "h-9 rounded-full px-3.5 text-xs font-medium",
            reminders.length > 0
              ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover"
              : "bg-surface-elevated text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {reminders.length > 0 ? (
            <BellRingIcon strokeWidth={1.5} />
          ) : (
            <ClockIcon strokeWidth={1.5} />
          )}
          Erinnerung
          {reminders.length > 0 && (
            <Badge
              variant="secondary"
              className={cn(
                "ml-0.5 h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums",
                overdue && "bg-warning/20 text-warning",
              )}
            >
              {reminders.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 rounded-2xl p-4">
        <div className="grid gap-4">
          {reminders.length > 0 && (
            <div className="grid gap-2">
              <p className="label-industrial">Gesetzt</p>
              {reminders.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        entry.overdue && "text-warning",
                      )}
                    >
                      {entry.dueLabel}
                    </p>
                    {entry.note && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  {/*
                    Its own form, not a button inside the one above: a nested form
                    is invalid HTML and the browser drops the inner one, so the
                    remove button would submit the create action instead.
                  */}
                  <RemoveButton ticketId={ticketId} reminderId={entry.id} />
                </div>
              ))}
            </div>
          )}

          <form action={action} className="grid gap-3">
            <input type="hidden" name="ticketId" value={ticketId} />

            <div className="grid gap-2">
              <p className="label-industrial">Später erinnern</p>
              <div className="grid gap-2">
                {REMINDER_PRESETS.map((preset) => (
                  <PresetButton
                    key={preset.value}
                    value={preset.value}
                    label={preset.label}
                    disabled={pending}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reminder-at" className="text-xs">
                Eigener Zeitpunkt
              </Label>
              <div className="flex gap-2">
                <Input
                  id="reminder-at"
                  name="at"
                  type="datetime-local"
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  disabled={pending}
                  className="h-9 rounded-xl text-xs"
                />
                <Button
                  type="submit"
                  size="sm"
                  /*
                   * No `name`/`value` on this one, so `preset` stays absent from
                   * the FormData and the server falls through to `at`. The preset
                   * buttons above are the submitters that set it — a hidden
                   * `preset` field would be sent by every submitter and the free
                   * date would never be read.
                   */
                  disabled={pending || custom === ""}
                  className="h-9 shrink-0 rounded-full bg-inverse-surface px-3 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                >
                  {pending ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <CalendarIcon strokeWidth={1.5} />
                  )}
                  Setzen
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reminder-note" className="text-xs">
                Notiz
              </Label>
              <Input
                id="reminder-note"
                name="note"
                maxLength={500}
                placeholder="Beim Kunden nachfragen"
                disabled={pending}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            {result && !result.ok && (
              <Alert
                variant="destructive"
                className="rounded-xl border-border px-3 py-2"
              >
                <TriangleAlertIcon strokeWidth={1.5} />
                <AlertDescription className="text-xs">
                  {result.error}
                </AlertDescription>
              </Alert>
            )}
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One offset, as a submitter.
 *
 * `name`/`value` on the button rather than a hidden input: that is what makes
 * three buttons in one form send three different presets, and it is why the
 * free-date button below carries neither. A hidden field would be sent whichever
 * button was pressed, and „morgen 09:00" would win over a typed date every time.
 */
function PresetButton({
  value,
  label,
  disabled,
}: {
  value: ReminderPreset;
  label: string;
  disabled: boolean;
}) {
  return (
    <Button
      type="submit"
      name="preset"
      value={value}
      size="sm"
      disabled={disabled}
      className="h-9 justify-start rounded-full bg-surface-elevated px-3 text-xs font-normal text-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <ClockIcon strokeWidth={1.5} />
      {label}
    </Button>
  );
}

/**
 * Remove one.
 *
 * A separate `<form>` beside the create form, not nested in it — nested forms are
 * invalid markup and the browser discards the inner one, which would make this
 * button submit the create action with an empty date.
 */
function RemoveButton({
  ticketId,
  reminderId,
}: {
  ticketId: string;
  reminderId: string;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(deleteReminderAction, null);

  useEffect(() => {
    if (result?.ok) toast({ kind: "system", tone: "info", title: result.message });
    if (result && !result.ok) {
      toast({ kind: "system", tone: "warning", title: result.error });
    }
  }, [result, toast]);

  return (
    <form action={action}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="reminderId" value={reminderId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label="Erinnerung entfernen"
        className="size-7 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground"
      >
        {pending ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <XIcon className="size-3.5" strokeWidth={1.5} />
        )}
      </Button>
    </form>
  );
}
