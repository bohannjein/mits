"use client";

import {
  CheckCircle2Icon,
  LayersIcon,
  Loader2Icon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { resolveChildTicketsAction } from "@/app/actions/ai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/* ──────────────────────────────────────────────────────────────────────────
   Closing out an outage.

   Shown on a major incident that has children still parked behind it. Once the
   outage is fixed, those tickets are all waiting for the same sentence, and
   writing it twenty times is how twenty people end up getting nineteen answers.

   **The text is the agent's.** MITS does not draft it and does not offer a
   template. This one message reaches every affected customer at once, which makes
   it the last place in the product where a machine-worded sentence belongs.

   **It appears only once the incident is resolved.** Offering "alle schließen"
   while the outage is still open is offering to tell twenty people it is fixed
   when it is not.
   ────────────────────────────────────────────────────────────────────────── */

export function MajorIncidentPanel({
  ticketId,
  children,
  resolved,
}: {
  ticketId: string;
  children: { id: string; number: string; title: string }[];
  /** Whether the outage itself is done. Drives whether the composer is offered. */
  resolved: boolean;
}) {
  const [body, setBody] = useState("");
  const [result, action, sending] = useActionState(
    resolveChildTicketsAction,
    null,
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <LayersIcon
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="text-sm">
          {children.length} Ticket(s) warten auf diese Störung
        </span>
      </div>

      <ul className="grid gap-1">
        {children.map((child) => (
          <li key={child.id} className="flex items-baseline gap-2 text-xs">
            <Badge
              variant="outline"
              className="h-auto shrink-0 rounded-full px-2 py-0 font-mono text-[10px] font-normal"
            >
              {child.number}
            </Badge>
            <span className="truncate">{child.title}</span>
          </li>
        ))}
      </ul>

      {!resolved ? (
        <p className="text-xs text-muted-foreground">
          Sobald diese Störung auf „Gelöst“ steht, lassen sich alle wartenden
          Tickets mit einer Sammelantwort abschließen.
        </p>
      ) : (
        <form action={action} className="grid gap-2 border-t border-border pt-3">
          <input type="hidden" name="ticketId" value={ticketId} />
          <Label htmlFor="cascade-body" className="text-xs text-muted-foreground">
            Sammelantwort an alle wartenden Melder
          </Label>
          <Textarea
            id="cascade-body"
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            disabled={sending}
            placeholder="Die Störung ist behoben. Bitte einmal neu anmelden — melden Sie sich, falls es weiterhin klemmt."
            className="rounded-xl text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={sending || body.trim() === ""}
            className="h-9 w-fit rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            {sending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SendIcon strokeWidth={1.5} />
            )}
            {children.length} Ticket(s) beantworten und lösen
          </Button>
          {/*
            Said before the click, not after: the reporters get a comment in their
            ticket and no mail, which is deliberate — twenty messages leaving in
            the same second from one outage is a mail server problem.
          */}
          <p className="text-[11px] text-muted-foreground">
            Der Text erscheint in jedem der Tickets. Es wird keine E-Mail
            verschickt.
          </p>
        </form>
      )}

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
  );
}
