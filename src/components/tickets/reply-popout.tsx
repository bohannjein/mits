"use client";

import { CheckCheckIcon, Loader2Icon, SendIcon } from "lucide-react";

import { RichTextEditor } from "@/components/tickets/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   The reply box, full size.

   The inline composer is one line that grows, which is right for the ninety
   percent of replies that are two sentences. It is wrong for the tenth: a
   step-by-step instruction, a mailed-in log with a explanation around it,
   anything with a code block. Those get written in a strip four lines tall at
   the bottom of a scrolling column.

   **A second editor over the same string, not the same editor moved.** A tiptap
   instance cannot be re-parented without remounting it, and remounting drops
   the undo history and the caret. So this dialog mounts its own, seeded from
   the same `value`, and the composer re-syncs the inline one when the dialog
   closes — see `RichTextEditorHandle.insert` at that call site. The consequence
   worth knowing: undo does not cross the boundary.

   The toolbar is open by default here, which is the inverse of the inline box.
   Down there sixteen buttons over a one-line field are more chrome than
   content; up here the whole point is that there is room.

   No CC line. Beteiligte are edited in the action bar, and a second control for
   the same list is the second place it can be wrong.
   ────────────────────────────────────────────────────────────────────────── */

export function ReplyPopout({
  open,
  onOpenChange,
  value,
  onChange,
  onSend,
  onSendAndClose,
  sending,
  closing,
  canSend,
  internal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (html: string) => void;
  onSend: () => void;
  /** Null for a reporter and for an internal note — see the composer. */
  onSendAndClose: (() => void) | null;
  sending: boolean;
  closing: boolean;
  canSend: boolean;
  internal: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] flex-col rounded-3xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {internal ? "Interne Notiz" : "Antwort verfassen"}
          </DialogTitle>
        </DialogHeader>

        {/*
          `min-h-0` on the region between the dialog's flex column and the
          editor's own scroll area. Without it the editor grows with its content,
          the dialog grows with the editor, and a long draft pushes the send
          button off the bottom of the screen — the same failure `TicketFrame`
          documents for the page.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RichTextEditor
            value={value}
            onChange={onChange}
            disabled={sending || closing}
            tone={internal ? "warning" : "default"}
            showToolbar
            placeholder={
              internal
                ? "Interne Notiz — nur für das Team sichtbar"
                : "Antwort an den Melder"
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-full px-4"
            onClick={() => onOpenChange(false)}
            disabled={sending || closing}
          >
            Zurück
          </Button>

          {onSendAndClose && (
            <Button
              type="button"
              variant="outline"
              onClick={onSendAndClose}
              disabled={!canSend}
              className="h-10 rounded-full px-4"
            >
              {closing ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckCheckIcon strokeWidth={1.5} />
              )}
              Antworten &amp; Schließen
            </Button>
          )}

          <Button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className={cn(
              "h-10 rounded-full px-5",
              internal
                ? "bg-bubble-internal-accent/15 text-bubble-internal-accent hover:bg-bubble-internal-accent/25"
                : "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover",
            )}
          >
            {sending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SendIcon strokeWidth={1.5} />
            )}
            {internal ? "Notiz speichern" : "Antworten"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
