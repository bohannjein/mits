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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CommentBody } from "@/components/tickets/comment-body";
import { cn } from "@/lib/utils";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatDateTimeShort } from "@/lib/format";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The conversation on a ticket.

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
  const timezone = useTimezone();
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
        <ul className="grid gap-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={cn(
                "rounded-2xl border px-5 py-4 shadow-elev-1",
                comment.visibility === "internal"
                  ? // Internal notes get the warning tint, not a colour of their own:
                    // it already means "careful, not for everyone" everywhere else.
                    "border-warning/40 bg-warning/5"
                  : "border-border bg-card",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{comment.author_name}</span>
                {comment.author_is_agent && (
                  <Badge
                    variant="outline"
                    className="h-auto rounded-full px-2 py-0.5 text-[11px] font-normal"
                  >
                    Team
                  </Badge>
                )}
                {comment.visibility === "internal" && (
                  <Badge className="h-auto rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-normal text-warning">
                    <LockIcon className="size-3" strokeWidth={1.5} />
                    Interne Notiz
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTimeShort(comment.created_at, timezone)}
                </span>
              </div>
              {/* An agent reply is stored as sanitised HTML; a reporter's own is
                  plain text. Both appear in this list, so both are rendered. */}
              <CommentBody comment={comment} />
            </li>
          ))}
        </ul>
      )}

      <form
        action={formAction}
        className={cn(
          "grid gap-3 rounded-2xl border px-4 py-4 transition-colors",
          internal ? "border-warning/40 bg-warning/5" : "border-border bg-card",
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
              ? "Nur für die Technik sichtbar."
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
              Ihre Antwort ist für die Technik sichtbar.
            </span>
          )}

          <Button
            type="submit"
            className={cn(
              "h-10 rounded-full px-5",
              internal
                ? "bg-warning/15 text-warning hover:bg-warning/25"
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
