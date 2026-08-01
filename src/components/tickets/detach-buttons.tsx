"use client";

import { ExternalLinkIcon, PictureInPicture2Icon } from "lucide-react";

import { Kbd } from "@/components/layout/shortcut-hint";
import { useDetachedTicket } from "@/components/tickets/detached-ticket-provider";
import { Button } from "@/components/ui/button";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

/* ──────────────────────────────────────────────────────────────────────────
   Two ways to take the conversation out of the page, plus `p`.

   The shortcut pins rather than pops out. `window.open` from a keystroke is
   blocked by every popup blocker that has not been told otherwise — the browser
   only trusts a click. A key that silently does nothing on half the installs
   would be worse than no key, so `p` gets the one that always works and the
   pop-out stays a button.

   Both are hidden while something is already detached: the cutout has the way
   back, and offering "detach" from a page that is already detached is a button
   whose meaning nobody can predict.
   ────────────────────────────────────────────────────────────────────────── */

export function DetachButtons({
  ticketId,
  label,
}: {
  ticketId: string;
  /** The ticket number, for the panel's title bar and the cutout card. */
  label: string;
}) {
  const { detached, detach } = useDetachedTicket();
  const busy = detached !== null;

  useKeyboardShortcuts({
    p: () => {
      if (busy) return;
      detach({ ticketId, label }, "floating");
    },
  });

  if (busy) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => detach({ ticketId, label }, "floating")}
        className="h-8 rounded-full px-2.5 text-xs text-muted-foreground"
        title="Als Fenster anpinnen"
      >
        <PictureInPicture2Icon strokeWidth={1.5} />
        <span className="hidden lg:inline">Anpinnen</span>
        <Kbd keys={["P"]} className="opacity-60" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => detach({ ticketId, label }, "popout")}
        className="rounded-full text-muted-foreground"
        title="In neuem Fenster öffnen"
      >
        <ExternalLinkIcon strokeWidth={1.5} />
        <span className="sr-only">In neuem Fenster öffnen</span>
      </Button>
    </div>
  );
}
