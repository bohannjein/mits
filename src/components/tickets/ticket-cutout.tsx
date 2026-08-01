"use client";

import { ExternalLinkIcon, MessageSquareIcon, Undo2Icon } from "lucide-react";

import { useDetachedTicket } from "@/components/tickets/detached-ticket-provider";
import { Button } from "@/components/ui/button";

/* ──────────────────────────────────────────────────────────────────────────
   What stands in the chat column while the conversation is somewhere else.

   **The point is that it is obviously not the conversation.** A main window
   showing a live thread that is also open in a pop-out invites somebody to reply
   in whichever one they happen to be looking at, and one of those two replies is
   written against a view that is a few seconds behind. Replacing the region
   removes the choice.

   It replaces the messages **and** the reply box. Leaving the composer would be
   exactly the second input this exists to prevent.

   Two ways back, because there are two things somebody in this state wants:
   "where did it go" and "put it back". Both are one press.

   The pulse is a CSS animation on a ring, not a framer-motion loop: it runs
   forever, so it belongs to the compositor — the house rule for decorative
   motion. `motion-reduce:animate-none` because a permanent pulse is exactly what
   somebody switching that setting on is switching off.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketCutout() {
  const { detached, reattach, focusDetached } = useDetachedTicket();
  if (!detached) return null;

  const isPopout = detached.mode === "popout";

  return (
    <div className="grid h-full place-items-center py-8">
      <div className="grid max-w-md justify-items-center gap-4 rounded-3xl border border-dashed border-border bg-card px-8 py-10 text-center shadow-elev-1">
        <span className="relative grid size-14 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
          {/* The glow: an absolutely positioned ring so the icon itself stays
              still — an icon that scales is a moving target for the eye. */}
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full bg-primary/15 motion-reduce:animate-none"
          />
          {isPopout ? (
            <ExternalLinkIcon className="relative size-6" strokeWidth={1.5} aria-hidden />
          ) : (
            <MessageSquareIcon className="relative size-6" strokeWidth={1.5} aria-hidden />
          )}
        </span>

        <div className="grid gap-1.5">
          <h2 className="text-base font-medium">
            {isPopout
              ? "Dieses Ticket ist in einem eigenen Fenster geöffnet."
              : "Dieses Ticket ist als Fenster angepinnt."}
          </h2>
          {/* Says what to do, not how it works — the conversation is not gone,
              and that is the one thing somebody needs to be told here. */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            Der Verlauf und die Antwortzeile liegen dort. Alles andere auf dieser
            Seite bleibt bedienbar.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Only for a pop-out. A pinned panel is already on this screen, and a
              button that "focuses" something two centimetres away does nothing
              anybody can perceive. */}
          {isPopout && (
            <Button
              type="button"
              size="sm"
              onClick={focusDetached}
              className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ExternalLinkIcon strokeWidth={1.5} />
              Fenster nach vorn holen
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={reattach}
            className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            <Undo2Icon strokeWidth={1.5} />
            Zurück ins Hauptfenster
          </Button>
        </div>
      </div>
    </div>
  );
}
