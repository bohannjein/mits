"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveTicketDisplaySettingsAction } from "@/app/admin/actions";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  TICKET_FORM_DISPLAYS,
  TICKET_FORM_DISPLAY_META,
  type TicketDisplaySettings,
  type TicketFormDisplay,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Where the answers to a form appear on a ticket.

   Radio buttons rather than a dropdown: three options, each needing a sentence to
   distinguish it, and a select would hide two thirds of that behind a click. The
   preview underneath is the same reason the notification mask renders a real
   toast — "im Verlauf" and "daneben" mean nothing until you have seen which one
   puts twenty fields in the middle of a conversation.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketDisplayForm({
  settings,
}: {
  settings: TicketDisplaySettings;
}) {
  const [result, action, saving] = useActionState(
    saveTicketDisplaySettingsAction,
    null,
  );
  const [choice, setChoice] = useState<TicketFormDisplay>(settings.formDisplay);

  return (
    <form action={action} className="grid gap-6">
      <Card className="rounded-3xl border-border bg-card shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Ausgefüllte Formulare
          </CardTitle>
          <CardDescription>
            Gilt für beide Ansichten — Agent und Melder sehen dieselbe Anordnung.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <RadioGroup
            name="formDisplay"
            value={choice}
            onValueChange={(value) => setChoice(value as TicketFormDisplay)}
            className="grid gap-3"
          >
            {TICKET_FORM_DISPLAYS.map((mode) => (
              <Label
                key={mode}
                htmlFor={`formDisplay-${mode}`}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-4 py-3 transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <RadioGroupItem
                  id={`formDisplay-${mode}`}
                  value={mode}
                  className="mt-0.5"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">
                    {TICKET_FORM_DISPLAY_META[mode].label}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {TICKET_FORM_DISPLAY_META[mode].description}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>

          <Preview mode={choice} />

          {/*
            The one case worth naming: a mailed ticket has no synthesised first
            bubble to carry the answers, so it keeps the list. Without this note an
            admin sets "Im Verlauf", opens a mail ticket and concludes the setting
            does not work.
          */}
          <p className="text-xs text-muted-foreground">
            Tickets, die per E-Mail hereinkommen, behalten die Liste — ihre erste
            Nachricht ist die Mail selbst.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={saving}
          className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
        >
          {saving ? (
            <Loader2Icon className="animate-spin" strokeWidth={1.5} />
          ) : (
            <SaveIcon strokeWidth={1.5} />
          )}
          Speichern
        </Button>

        {result && (
          <Alert
            variant={result.ok ? "default" : "destructive"}
            className="w-auto flex-1 rounded-2xl border-border px-3 py-2"
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
    </form>
  );
}

/**
 * A miniature of the ticket page for the selected mode.
 *
 * Not the real components: `TicketMessages` wants comments, a viewer id and a
 * scroll container, and building a fake ticket to feed it would put a second,
 * drifting version of the thread in the admin area. This shows the *arrangement*,
 * which is the only thing the setting changes.
 */
function Preview({ mode }: { mode: TicketFormDisplay }) {
  const inBubble = mode !== "panel";
  const inPanel = mode !== "chat";

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-background p-3 sm:grid-cols-[1fr_9rem]">
      <div className="grid gap-2">
        <div className="max-w-[85%] justify-self-start rounded-2xl rounded-bl-md border border-bubble-other-border bg-bubble-other px-3 py-2">
          <span className="block text-[11px] text-muted-foreground">Melder</span>
          <span className="mt-1 block h-1.5 w-4/5 rounded-full bg-foreground/20" />
          <span className="mt-1 block h-1.5 w-3/5 rounded-full bg-foreground/20" />

          {inBubble && (
            <span className="mt-2 grid gap-1 border-t border-border/60 pt-2">
              {[0, 1, 2].map((row) => (
                <span key={row} className="grid gap-0.5">
                  <span className="block h-1 w-10 rounded-full bg-foreground/25" />
                  <span className="block h-1.5 w-2/3 rounded-full bg-foreground/15" />
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="max-w-[85%] justify-self-end rounded-2xl rounded-br-md border border-bubble-own-border bg-bubble-own px-3 py-2">
          <span className="block text-[11px] text-muted-foreground">Team</span>
          <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-foreground/20" />
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-card p-2">
        <span className="text-[11px] text-muted-foreground">Angaben</span>
        {inPanel ? (
          [0, 1, 2].map((row) => (
            <span key={row} className="grid gap-0.5">
              <span className="block h-1 w-8 rounded-full bg-foreground/25" />
              <span className="block h-1.5 w-full rounded-full bg-foreground/15" />
            </span>
          ))
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
