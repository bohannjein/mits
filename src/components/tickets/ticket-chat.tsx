"use client";

import {
  CheckCircle2Icon,
  CheckCheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  LockIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { addCommentAction, replyAndCloseAction } from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The conversation, as a messenger.

   Internal notes are visually distinct *and* filtered server-side — a reporter
   never receives one, so the dashed warning frame here is a courtesy to the
   agent, not the access control.

   Two submit buttons on one form, each bound to its own action. "Antworten &
   Schließen" is a single server action rather than two client calls: replying and
   closing is one decision, and two round-trips can leave a ticket answered but
   open when the second one fails.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketChat({
  ticketId,
  comments,
  isAgent,
  /** Placeholder-filled server-side. Empty when the module is off. */
  cannedResponses = [],
}: {
  ticketId: string;
  comments: TicketComment[];
  isAgent: boolean;
  cannedResponses?: { id: string; title: string; body: string }[];
}) {
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState("");
  const [replyResult, replyAction, replying] = useActionState(
    addCommentAction,
    null,
  );
  const [closeResult, closeAction, closing] = useActionState(
    replyAndCloseAction,
    null,
  );

  const result = replyResult ?? closeResult;
  const busy = replying || closing;
  const bottom = useRef<HTMLDivElement>(null);

  // Clear on confirmation, keyed on the result object's identity so it fires once
  // per submission. A `result?.ok ? "" : body` shortcut would swallow an inserted
  // snippet after the first successful reply.
  useEffect(() => {
    if (result?.ok) setBody("");
  }, [result]);

  // A conversation reads bottom-up: the newest message is the one being answered.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [comments.length]);

  const canSend = body.trim() !== "" && !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 py-1 pr-3">
          {comments.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
              Noch keine Beiträge. Die erste Antwort geht an den Melder.
            </p>
          ) : (
            comments.map((comment) => (
              <article
                key={comment.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 shadow-elev-1",
                  comment.visibility === "internal"
                    ? // Dashed and tinted: "careful, not for everyone" reads the
                      // same way it does everywhere else in MITS.
                      "justify-self-end border border-dashed border-warning/50 bg-warning/5"
                    : comment.author_is_agent
                      ? "justify-self-end rounded-br-md border border-border bg-surface-elevated"
                      : "justify-self-start rounded-bl-md border border-border bg-card",
                )}
              >
                <header className="flex flex-wrap items-center gap-2">
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
                      Intern
                    </Badge>
                  )}
                  <time className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {comment.created_at.toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </header>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {comment.body}
                </p>
              </article>
            ))
          )}
          <div ref={bottom} />
        </div>
      </ScrollArea>

      {/* Sticks to the bottom of the column so the composer stays reachable
          however long the thread gets. */}
      <form
        className={cn(
          "sticky bottom-0 mt-4 grid gap-3 rounded-2xl border px-4 py-4 backdrop-blur transition-colors",
          internal
            ? "border-dashed border-warning/50 bg-warning/5"
            : "border-border bg-card/95",
        )}
      >
        <input type="hidden" name="ticketId" value={ticketId} />
        <input
          type="hidden"
          name="visibility"
          value={internal ? "internal" : "public"}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="chat-body" className="text-xs text-muted-foreground">
            {internal ? "Interne Notiz" : "Öffentliche Antwort"}
          </Label>

          {/* Inserted into the field, never sent on its own — the agent confirms
              what goes out, same rule as the AI triage. */}
          {isAgent && cannedResponses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs text-muted-foreground"
                  disabled={busy}
                >
                  Textbaustein
                  <ChevronDownIcon strokeWidth={1.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 rounded-2xl border border-border shadow-elev-2"
              >
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Wird eingefügt, nicht gesendet
                </DropdownMenuLabel>
                {cannedResponses.map((canned) => (
                  <DropdownMenuItem
                    key={canned.id}
                    onSelect={() =>
                      setBody((current) =>
                        current.trim()
                          ? `${current.trimEnd()}\n\n${canned.body}`
                          : canned.body,
                      )
                    }
                  >
                    {canned.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Textarea
          id="chat-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          disabled={busy}
          placeholder={
            internal
              ? "Nur für die Technik sichtbar."
              : "Geht an den Melder und löst eine Benachrichtigung aus."
          }
          className="resize-y rounded-xl"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {isAgent ? (
            <div className="flex items-center gap-2.5">
              <Switch
                id="chat-internal"
                checked={internal}
                onCheckedChange={setInternal}
                disabled={busy}
              />
              <Label
                htmlFor="chat-internal"
                className="text-sm font-normal text-muted-foreground"
              >
                Interne Notiz
              </Label>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Ihre Antwort ist für die Technik sichtbar.
            </span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              formAction={replyAction}
              className={cn(
                "h-10 rounded-full px-4",
                internal
                  ? "bg-warning/15 text-warning hover:bg-warning/25"
                  : "bg-surface-elevated text-foreground hover:bg-accent",
              )}
              disabled={!canSend}
            >
              {replying ? (
                <Loader2Icon className="animate-spin" />
              ) : internal ? (
                <LockIcon strokeWidth={1.5} />
              ) : (
                <SendIcon strokeWidth={1.5} />
              )}
              {internal ? "Notiz speichern" : "Antworten"}
            </Button>

            {/* Public only. "Answer and close" that filed an internal note would
                close a ticket the reporter never heard about. */}
            {isAgent && !internal && (
              <Button
                type="submit"
                formAction={closeAction}
                className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                disabled={!canSend}
              >
                {closing ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <CheckCheckIcon strokeWidth={1.5} />
                )}
                Antworten &amp; Schließen
              </Button>
            )}
          </div>
        </div>

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
      </form>
    </div>
  );
}
