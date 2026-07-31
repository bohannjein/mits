"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState } from "react";

import { restoreCommentAction, restoreTicketAction } from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTicketNumber } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Papierkorb.

   Two lists, one per kind, because a restore means different things: a ticket brings its
   comments and attachments back with it, a comment brings only itself. Mixing them into
   one table would need a column explaining which row is which, and the button would mean
   two things.

   Comments deleted *with* a ticket are deliberately absent — `listDeletedComments`
   excludes them. Their restore would be refused while the ticket is still deleted, and a
   list of buttons that cannot be used is worse than a shorter list.
   ────────────────────────────────────────────────────────────────────────── */

export interface TrashTicketRow {
  id: string;
  number: number;
  title: string;
  deletedAt: string;
  comments: number;
}

export interface TrashCommentRow {
  id: string;
  ticketId: string;
  ticketNumber: number;
  authorName: string;
  preview: string;
  deletedAt: string;
}

export function TrashList({
  tickets,
  comments,
}: {
  tickets: TrashTicketRow[];
  comments: TrashCommentRow[];
}) {
  const [ticketResult, restoreTicket, restoringTicket] = useActionState(
    restoreTicketAction,
    null,
  );
  const [commentResult, restoreComment, restoringComment] = useActionState(
    restoreCommentAction,
    null,
  );

  const result = ticketResult ?? commentResult;

  return (
    <div className="grid gap-6">
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

      <section className="grid gap-3">
        <h2 className="label-industrial">Gelöschte Tickets</h2>
        {tickets.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
            Nichts im Papierkorb.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTicketNumber(ticket.number)}
                </span>
                <span className="min-w-40 flex-1 truncate text-sm">{ticket.title}</span>

                {ticket.comments > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal"
                  >
                    {ticket.comments}{" "}
                    {ticket.comments === 1 ? "Beitrag" : "Beiträge"} kommen mit
                  </Badge>
                )}

                <span className="shrink-0 text-xs text-muted-foreground">
                  {ticket.deletedAt}
                </span>

                <form action={restoreTicket} className="shrink-0">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={restoringTicket}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    {restoringTicket ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <RotateCcwIcon strokeWidth={1.5} />
                    )}
                    Wiederherstellen
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="label-industrial">Einzeln gelöschte Beiträge</h2>
        {comments.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
            Keine einzeln gelöschten Beiträge.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTicketNumber(comment.ticketNumber)}
                </span>
                <span className="min-w-40 flex-1 truncate text-sm">
                  <span className="text-muted-foreground">{comment.authorName}: </span>
                  {comment.preview}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {comment.deletedAt}
                </span>

                <form action={restoreComment} className="shrink-0">
                  <input type="hidden" name="commentId" value={comment.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={restoringComment}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    {restoringComment ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <RotateCcwIcon strokeWidth={1.5} />
                    )}
                    Wiederherstellen
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
