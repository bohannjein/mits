"use client";

import { MoreVerticalIcon, PencilIcon, Undo2Icon, XIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";

import {
  editCommentAction,
  retractCommentAction,
} from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { RichTextEditor } from "@/components/tickets/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

   **Two components, because they are drawn in two places.** The menu sits in the
   bubble's header, at the top right; the editor replaces the body while it is
   open. Both used to be one block *under* the message — two pill buttons plus a
   countdown on every own message, which on a thread of twenty replies is twenty
   rows of chrome inside the one region of the page that is supposed to hold the
   conversation. The vertical space a thread has is the whole point of the
   chat-first layout, and this was spending it on controls nobody uses twice.

   Which message is being edited is state in `TicketMessages`, not here: the menu
   and the editor are siblings in two different slots of `ChatBubble`, so the one
   thing they share cannot live inside either of them. One id rather than a set,
   because editing two messages at once is not a thing anybody does.

   **The countdown is a courtesy.** `retractComment` checks the window against the
   stored timestamp, so a clock that is wrong, a tab that was asleep or a
   hand-built request all get the same answer. This just stops offering an entry
   that has already expired.

   Only ever shown on your own messages, and never on the synthetic opening
   bubble — that one is derived from the form payload at render time and has no
   row to change.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The three-dot menu for one message.
 *
 * Renders `null` when it would be empty: no edit right and an expired retract
 * window leaves nothing to offer, and a menu that opens onto nothing is worse
 * than no button at all.
 */
export function MessageMenu({
  comment,
  ticketId,
  canEdit,
  canRetract,
  onEdit,
}: {
  comment: TicketComment;
  ticketId: string;
  canEdit: boolean;
  canRetract: boolean;
  /** Opens the editor, which the list renders in the bubble's body slot. */
  onEdit: () => void;
}) {
  const { toast } = useToast();

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

  const [retractResult, retractAction, retracting] = useActionState(
    retractCommentAction,
    null,
  );

  useEffect(() => {
    if (retractResult && !retractResult.ok) {
      toast({ kind: "system", tone: "warning", title: retractResult.error });
    }
  }, [retractResult, toast]);

  const showRetract = canRetract && remaining > 0;
  if (!canEdit && !showRetract) return null;

  /*
   * Dispatched by hand rather than from a `<form>`.
   *
   * A form inside a menu item would submit through a control Radix unmounts the
   * moment it is selected, and `startTransition` is what React requires for a
   * dispatch that does not come from a submit event — without it the pending flag
   * never turns on and React warns.
   */
  const retract = () => {
    const data = new FormData();
    data.set("ticketId", ticketId);
    data.set("commentId", comment.id);
    startTransition(() => retractAction(data));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={retracting}
          title="Weitere Aktionen"
          /*
           * Negative margins so the button sits in the header's corner without
           * making the header taller than the line of text beside it. The
           * foreground goes to full contrast on hover, never the other way
           * round — see the hover rule in AGENTS.md.
           */
          className="-my-1 -mr-1.5 size-7 shrink-0 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <MoreVerticalIcon className="size-4" strokeWidth={1.5} />
          <span className="sr-only">Nachricht bearbeiten oder zurückziehen</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 rounded-2xl border border-border shadow-elev-2"
      >
        {canEdit && (
          <DropdownMenuItem className="rounded-xl" onSelect={onEdit}>
            <PencilIcon strokeWidth={1.5} />
            Bearbeiten
          </DropdownMenuItem>
        )}

        {showRetract && (
          <DropdownMenuItem
            variant="destructive"
            className="rounded-xl"
            onSelect={retract}
          >
            <Undo2Icon strokeWidth={1.5} />
            {/* The number is the point: it says how long the offer stands. */}
            Zurückziehen ({remaining})
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The correction form, rendered in place of the message body.
 *
 * In place rather than under it: the old version left the stored text standing
 * above a textarea holding the same words, so the bubble showed the message twice
 * and it was not obvious which one was going to be saved.
 */
export function MessageEditor({
  comment,
  ticketId,
  /** Called on cancel and after a confirmed save. */
  onDone,
}: {
  comment: TicketComment;
  ticketId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState(comment.body);
  const [editResult, editAction, saving] = useActionState(
    editCommentAction,
    null,
  );

  // Close on confirmation, keyed on the result object's identity so it fires once
  // per submission rather than on every render after the first success.
  useEffect(() => {
    if (editResult?.ok) onDone();
    if (editResult && !editResult.ok) {
      toast({ kind: "system", tone: "warning", title: editResult.error });
    }
  }, [editResult, onDone, toast]);

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
          onClick={onDone}
          disabled={saving}
        >
          <XIcon strokeWidth={1.5} />
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function secondsLeft(comment: Pick<TicketComment, "created_at">): number {
  const elapsed = (Date.now() - comment.created_at.getTime()) / 1000;
  return Math.max(0, Math.ceil(RETRACT_WINDOW_SECONDS - elapsed));
}
