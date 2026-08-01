"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  LockIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { addCommentAction } from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChatBubble, toneFor } from "@/components/tickets/chat-bubble";
import { cn } from "@/lib/utils";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The conversation on a ticket, from the reporter's side.

   Same bubbles as the agent view, **mirrored**: the reader's own messages sit on
   the right. `ChatBubble` takes `side` separately from `tone` for exactly this —
   the surface says who spoke, the alignment says who is looking, and a reporter
   whose own words arrived on the left would be reading somebody else's inbox.

   Internal notes are visually distinct *and* filtered server-side — a plain user
   never receives them, so this component styling them differently is a courtesy
   to the agent, not the access control.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketThread({
  ticketId,
  comments,
  /** Staff see the internal-note switch and the note styling. */
  isAgent,
  /** Canned responses, already placeholder-filled for this ticket. Staff only. */
  cannedResponses = [],
}: {
  ticketId: string;
  comments: TicketComment[];
  isAgent: boolean;
  cannedResponses?: { id: string; title: string; body: string }[];
}) {
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState("");
  const [result, formAction, sending] = useActionState(addCommentAction, null);

  /*
   * Clear the box once the server confirms — as an effect, keyed on the result
   * object's identity so it runs once per submission.
   *
   * The obvious shortcut, `const shown = result?.ok ? "" : body`, is wrong as soon
   * as canned responses exist: after one successful reply `result.ok` stays true,
   * so inserting a snippet would set `body` and the field would keep showing "".
   */
  useEffect(() => {
    if (result?.ok) setBody("");
  }, [result]);

  return (
    <section aria-label="Verlauf" className="grid gap-4">
      <h2 className="label-industrial">Verlauf</h2>

      {comments.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          Noch keine Beiträge.
        </p>
      ) : (
        <div className="grid gap-3">
          {comments.map((comment) => {
            const tone = toneFor(comment);
            /*
             * Same sides as the agent view: the reporter on the left, the team on
             * the right, whoever is looking.
             *
             * The alternative — mirroring, so your own messages sit right the way
             * a phone messenger does — was tried and dropped. It means the same
             * conversation has two layouts, so a screenshot from a reporter and a
             * screenshot from an agent do not line up, and "die Nachricht links"
             * in a handover note stops being a location. Speaker-based sides make
             * the thread the same object for everybody.
             */
            return (
              <ChatBubble
                key={comment.id}
                comment={comment}
                tone={tone}
                side={tone === "customer" ? "left" : "right"}
              />
            );
          })}
        </div>
      )}

      <form
        action={formAction}
        className={cn(
          "grid gap-3 rounded-2xl border px-4 py-4 transition-colors",
          internal
            ? "border-dashed border-bubble-internal-border bg-bubble-internal"
            : "border-border bg-card",
        )}
      >
        <input type="hidden" name="ticketId" value={ticketId} />
        <input
          type="hidden"
          name="visibility"
          value={internal ? "internal" : "public"}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="comment-body">
            {internal ? "Interne Notiz" : "Antwort"}
          </Label>

          {/* Inserted into the field, never sent on its own. The agent confirms
              what goes out — the same rule the AI triage follows. */}
          {isAgent && cannedResponses.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Baustein:</span>
              {cannedResponses.map((canned) => (
                <Button
                  key={canned.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs text-muted-foreground"
                  disabled={sending}
                  onClick={() =>
                    setBody((current) =>
                      current.trim() ? `${current.trimEnd()}\n\n${canned.body}` : canned.body,
                    )
                  }
                >
                  {canned.title}
                </Button>
              ))}
            </div>
          )}
        </div>
        <Textarea
          id="comment-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          required
          disabled={sending}
          placeholder={
            internal
              ? "Nur für Agenten sichtbar."
              : "Geht an den Melder und löst eine Benachrichtigung aus."
          }
          className="rounded-xl"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {isAgent ? (
            <div className="flex items-center gap-2.5">
              <Switch
                id="comment-internal"
                checked={internal}
                onCheckedChange={setInternal}
                disabled={sending}
              />
              <Label
                htmlFor="comment-internal"
                className="text-sm font-normal text-muted-foreground"
              >
                Interne Notiz — der Melder sieht sie nicht
              </Label>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Ihre Antwort ist für die Agenten sichtbar.
            </span>
          )}

          <Button
            type="submit"
            className={cn(
              "h-10 rounded-full px-5",
              internal
                ? "bg-bubble-internal-accent/15 text-bubble-internal-accent hover:bg-bubble-internal-accent/25 hover:text-bubble-internal-accent"
                : "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover",
            )}
            disabled={sending || body.trim() === ""}
          >
            {sending ? (
              <Loader2Icon className="animate-spin" />
            ) : internal ? (
              <LockIcon strokeWidth={1.5} />
            ) : (
              <SendIcon strokeWidth={1.5} />
            )}
            {sending ? "Wird gesendet …" : internal ? "Notiz speichern" : "Antworten"}
          </Button>
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
      </form>
    </section>
  );
}
