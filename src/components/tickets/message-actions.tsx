"use client";

import { PencilIcon, Undo2Icon, XIcon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  editCommentAction,
  retractCommentAction,
} from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { RichTextEditor } from "@/components/tickets/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RETRACT_WINDOW_SECONDS } from "@/lib/retract-window";
import type { TicketComment } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Correct it, or take it back.

   Two things a person wants immediately after pressing send, and they are not the
   same thing: an edit fixes a word and leaves the message standing with a marker
   on it, a retraction removes it as though it had not been sent. Offering only
   the first means somebody edits a message down to "." rather than admitting they
   sent it to the wrong ticket; offering only the second means a typo costs the
   whole message.

   **The countdown here is a courtesy.** `retractComment` checks the window
   against the stored timestamp, so a clock that is wrong, a tab that was asleep
   or a hand-built request all get the same answer. This just stops offering a
   button that has already expired.

   Only ever shown on your own messages, and never on the synthetic opening
   bubble — that one is derived from the form payload at render time and has no
   row to change.
   ────────────────────────────────────────────────────────────────────────── */

export function MessageActions({
  comment,
  ticketId,
  canEdit,
  canRetract,
}: {
  comment: TicketComment;
  ticketId: string;
  canEdit: boolean;
  canRetract: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);

  /*
   * Seconds left, ticking down to zero and then gone.
   *
   * Computed from the message's own timestamp rather than from a mount-time
   * counter: a page that was open when the message arrived and one that was
   * navigated to afterwards have to agree, or the second one would offer a full
   * fifteen seconds on a message from an hour ago.
   */
  const [remaining, setRemaining] = useState(() => secondsLeft(comment));

  useEffect(() => {
    if (!canRetract) return;
    if (remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining(secondsLeft(comment));
    }, 500);
    return () => window.clearInterval(timer);
  }, [canRetract, comment, remaining]);

  const [editResult, editAction, saving] = useActionState(
    editCommentAction,
    null,
  );
  const [retractResult, retractAction, retracting] = useActionState(
    retractCommentAction,
    null,
  );

  // Close on confirmation, keyed on the result object's identity so it fires once
  // per submission rather than on every render after the first success.
  useEffect(() => {
    if (editResult?.ok) setEditing(false);
    if (editResult && !editResult.ok) {
      toast({ kind: "system", tone: "warning", title: editResult.error });
    }
  }, [editResult, toast]);

  useEffect(() => {
    if (retractResult && !retractResult.ok) {
      toast({ kind: "system", tone: "warning", title: retractResult.error });
    }
  }, [retractResult, toast]);

  if (editing) {
    return (
      <form action={editAction} className="mt-2 grid gap-2">
        <input type="hidden" name="ticketId" value={ticketId} />
        <input type="hidden" name="commentId" value={comment.id} />
        <input type="hidden" name="body" value={body} />

        {/*
          The editor matches the format the message was stored in. Handing a rich
          reply to a textarea would show its markup as source and save it as
          escaped text; handing plain text to the rich editor would silently turn
          it into HTML on the first save.
        */}
        {comment.body_format === "html" ? (
          <RichTextEditor value={body} onChange={setBody} disabled={saving} />
        ) : (
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={saving}
            rows={4}
            className="rounded-xl"
            // Same shortcut as the composer: the keystroke that sent it is the
            // keystroke that saves the correction.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            disabled={saving || body.trim() === ""}
          >
            {saving ? "Speichern …" : "Speichern"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => {
              setBody(comment.body);
              setEditing(false);
            }}
            disabled={saving}
          >
            <XIcon strokeWidth={1.5} />
            Abbrechen
          </Button>
        </div>
      </form>
    );
  }

  const showRetract = canRetract && remaining > 0;
  if (!canEdit && !showRetract) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-full px-2 text-xs text-muted-foreground"
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3" strokeWidth={1.5} />
          Bearbeiten
        </Button>
      )}

      {showRetract && (
        <form action={retractAction}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="commentId" value={comment.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-2 text-xs text-muted-foreground"
            disabled={retracting}
          >
            <Undo2Icon className="size-3" strokeWidth={1.5} />
            {/* The number is the point: it says how long the offer stands. */}
            Zurückziehen ({remaining})
          </Button>
        </form>
      )}
    </div>
  );
}

function secondsLeft(comment: Pick<TicketComment, "created_at">): number {
  const elapsed = (Date.now() - comment.created_at.getTime()) / 1000;
  return Math.max(0, Math.ceil(RETRACT_WINDOW_SECONDS - elapsed));
}
