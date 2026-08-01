"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

/* ──────────────────────────────────────────────────────────────────────────
   `j` / `k` / `Enter` / `c` over the ticket table. Renders nothing.

   **The highlight is a DOM attribute, not React state pushed into the table.**
   `TicketTable` is a Server Component and there is a reason for that — the
   relative ages are computed once at render instead of after hydration. Making
   it client-side to draw one outline would move fifty rows of formatting into
   the browser to move a border.

   So the cursor is written as `data-cursor` on the row, and `globals.css` styles
   it. The rows are found by a stable attribute rather than by index into a list
   this component does not have.

   `c` focuses the scope switcher rather than toggling it: "Pool" and "Mein
   Bereich" are two named destinations, and a key that flipped between them would
   be a key whose effect depends on where you already were.
   ────────────────────────────────────────────────────────────────────────── */

/** What `TicketTable` marks its rows with. */
const ROW = "[data-ticket-row]";

export function QueueShortcuts() {
  const router = useRouter();
  const [cursor, setCursor] = useState(-1);

  /*
   * Paint the cursor after every change, and clear it on unmount.
   *
   * Reading the rows fresh each time rather than caching them: the table
   * re-renders under this component whenever a realtime signal arrives, and a
   * cached NodeList would be pointing at elements that are no longer in the
   * document — the highlight would simply stop appearing, with nothing to
   * explain why.
   */
  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(ROW));
    rows.forEach((row, index) => {
      if (index === cursor) row.setAttribute("data-cursor", "true");
      else row.removeAttribute("data-cursor");
    });

    if (cursor >= 0) {
      // `nearest`: jumping the row to the middle of the screen on every press
      // makes a list feel like it is being dragged rather than walked.
      rows[cursor]?.scrollIntoView({ block: "nearest" });
    }

    return () => {
      for (const row of rows) row.removeAttribute("data-cursor");
    };
  }, [cursor]);

  const move = (delta: number) => {
    const rows = document.querySelectorAll<HTMLElement>(ROW);
    if (rows.length === 0) return;
    setCursor((current) => {
      // From nothing, `j` starts at the top and `k` at the bottom — the two
      // directions should each enter the list from the end they came from.
      if (current < 0) return delta > 0 ? 0 : rows.length - 1;
      // Clamped rather than wrapped. A list that jumps from the last row back to
      // the first looks like it lost the cursor.
      return Math.min(rows.length - 1, Math.max(0, current + delta));
    });
  };

  useKeyboardShortcuts({
    j: () => move(1),
    k: () => move(-1),

    Enter: () => {
      const rows = document.querySelectorAll<HTMLElement>(ROW);
      const row = rows[cursor];
      if (!row) return;
      const href = row.getAttribute("data-ticket-href");
      if (href) router.push(href);
    },

    c: () => {
      /*
       * Focus, not activate. The switcher is two links; putting the focus on the
       * inactive one lets Enter follow it and Tab move on, which is what a
       * keyboard user expects from a control they were sent to.
       */
      const target = document.querySelector<HTMLElement>(
        '[data-scope-switcher] a:not([aria-current])',
      );
      target?.focus();
    },

    Escape: () => setCursor(-1),
  });

  return null;
}
