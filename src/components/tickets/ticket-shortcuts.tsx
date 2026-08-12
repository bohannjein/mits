"use client";

import { useRouter } from "next/navigation";
import { startTransition, useRef } from "react";

import {
  assignTicketAction,
  setTicketStatusAction,
} from "@/app/actions/tickets";
import { useComposerHandle } from "@/components/tickets/composer-handle";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

/* ──────────────────────────────────────────────────────────────────────────
   The ticket page's keystrokes. Renders nothing.

   `r` jump to the reply box · `e` mark resolved · `m` assign to me · `i` toggle
   the internal note · `Esc` leave the field.

   The two that touch the composer go through `ComposerHandleProvider`, which is
   a context and not props for one reason: this page is a Server Component and
   cannot create the ref both sides need. The provider is mounted on the ticket
   page rather than at the root, so the scope stays "the one composer on screen".

   **`m` performs a write from a single keypress**, which is the only one in this
   set that does. It is safe for the same three reasons the sidebar button is:
   assignment is reversible in one click, `assignTicket` refuses anything that is
   not a real change, and `isTypingTarget` guarantees the key was not meant as a
   letter. The confirmation is the sidebar's own toast.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketShortcuts({
  ticketId,
  currentUserId,
  /** Already yours — then `m` does nothing rather than re-assigning. */
  mine,
  /** Schon gelöst — dann tut `e` nichts, statt denselben Status zu setzen. */
  resolved = false,
}: {
  ticketId: string;
  currentUserId: string;
  mine: boolean;
  resolved?: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const handle = useComposerHandle();

  useKeyboardShortcuts({
    r: () => handle?.focus.current?.(),

    /*
     * `e` für erledigt — der zweite Schreibvorgang aus einem Tastendruck, und der
     * einzige, der nach `m` dazugekommen ist.
     *
     * Vertretbar aus denselben drei Gründen: `applyStatusChange` lehnt eine
     * Nicht-Änderung ab, „Gelöst" ist mit einem Klick zurückzunehmen, und
     * `swallowsKeys` garantiert, dass die Taste kein Buchstabe in einer Antwort
     * war.
     *
     * **`Gelöst` und nicht `Geschlossen`.** Der Unterschied ist der Punkt: gelöst
     * ist der normale Abschluss der Arbeit und bleibt für den Melder
     * wiederöffenbar, geschlossen ist das Archiv. Eine versehentlich gedrückte
     * Taste darf das Erste tun und nicht das Zweite.
     */
    e: () => {
      if (resolved || busy.current) return;
      busy.current = true;

      const data = new FormData();
      data.set("ticketId", ticketId);
      data.set("status", "resolved");
      startTransition(async () => {
        await setTicketStatusAction(null, data);
        router.refresh();
        busy.current = false;
      });
    },

    i: () => handle?.toggleInternal.current?.(),

    m: () => {
      if (mine || busy.current) return;
      /*
       * Guarded against a held key.
       *
       * `keydown` repeats while a key is down, and without this a leaning elbow
       * posts the same assignment thirty times. The flag is cleared by the
       * refresh below rather than by a timer, so the next press is allowed as
       * soon as the page reflects the last one.
       */
      busy.current = true;

      const data = new FormData();
      data.set("ticketId", ticketId);
      data.set("assigneeId", currentUserId);
      startTransition(async () => {
        await assignTicketAction(null, data);
        router.refresh();
        busy.current = false;
      });
    },

    /*
     * Escape gives the page back the keyboard.
     *
     * This is the one handler that runs *while* the focus is in a field — see the
     * note in `useKeyboardShortcuts`. It blurs rather than clearing: a shortcut
     * that discarded a half-written reply because somebody reached for Escape out
     * of habit would be unforgivable, and the fifteen-second retraction exists
     * precisely because sent text is hard to take back.
     */
    Escape: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    },
  });

  return null;
}
