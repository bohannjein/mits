"use client";

import { PanelRightCloseIcon, PanelRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useDetachedTicket } from "@/components/tickets/detached-ticket-provider";
import { TicketCutout } from "@/components/tickets/ticket-cutout";
import { Button } from "@/components/ui/button";

/* ──────────────────────────────────────────────────────────────────────────
   The ticket page as a desktop application, not a document.

   Three regions in the chat column, and only the middle one scrolls:

     header    static, `shrink-0`, with a rule under it
     messages  `flex-1 overflow-y-auto` — the *only* scroll container
     composer  static, `shrink-0`, with a rule over it

   The sidebar is a fourth region that scrolls on its own, so a long stack of open
   metadata cards never moves the conversation.

   **`min-h-0` on every ancestor between the viewport and a scroll container.**
   This is the whole trick and the whole failure mode: a flex child refuses to
   shrink below its content by default, so without it the middle region grows to
   fit the thread, the column grows with it, and the page — not the messages — gets
   the scrollbar. It looks like the layout working right up until somebody opens a
   ticket with forty replies.

   **The height comes from the flex chain, not from `calc(100vh - 64px)`.** The
   literal calculation is one header wrap away from being wrong: `AppHeader` is
   `flex-wrap`, and below `sm` the search field takes its own row — so the header
   is taller than 64 px on exactly the screens where a composer pushed off the
   bottom edge cannot be scrolled back to. `body` is a flex column, the header
   sizes itself, and `flex-1 min-h-0` takes what is left. Same result at every
   width, no number to maintain.

   **Fixed only from `lg` up.** Below that there is no second column and not enough
   height for three regions — a 380 px viewport minus a header, a title block and a
   reply box leaves about a hundred pixels of conversation. So on a phone the page
   scrolls the way a page does, the sidebar follows the thread instead of
   disappearing, and the `lg:` prefixes switch the app layout on where there is
   room for it.

   Separate from `SplitView`, which the FAQ and CMDB pages use: that one is a page
   header above two scrolling columns. This is a chat window. Merging them would be
   a boolean that reshapes the DOM, with three pages depending on the branch they
   do not take.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketFrame({
  header,
  messages,
  composer,
  /** Omitted on the reporter's view, which has no metadata column at all. */
  sidebar,
  sidebarLabel = "Details",
  detachableId,
}: {
  header: ReactNode;
  messages: ReactNode;
  composer: ReactNode;
  sidebar?: ReactNode;
  sidebarLabel?: string;
  /**
   * When set, the conversation is replaced by the cutout card while this ticket
   * is open in a pop-out or a pinned panel.
   *
   * Optional: the pop-out route renders the same frame and must never cut its own
   * chat out of itself.
   */
  detachableId?: string;
}) {
  const [open, setOpen] = useState(true);
  const showSidebar = sidebar !== undefined;

  /*
   * The messages *and* the reply box go together.
   *
   * Leaving the composer while the thread is elsewhere would be the second input
   * on one conversation that the whole cutout exists to prevent — and it would be
   * the one whose view is a few seconds behind.
   */
  const { detached } = useDetachedTicket();
  const cutout = detachableId !== undefined && detached?.ticketId === detachableId;

  return (
    <div className="flex w-full flex-1 flex-col gap-6 lg:min-h-0 lg:flex-row">
      {/*
        The chat column. `lg:min-w-0` as well as `lg:min-h-0`: a wide code block
        or a mailed-in table inside a bubble would otherwise stretch the column
        instead of scrolling inside itself.

        `bg-background`, not `bg-card`. The reporter's bubble *is* `--card`, so a
        card-coloured column made every incoming message invisible on the surface
        it sits on. The column is the shell; the bubbles and the reply box are
        what is raised on it.
      */}
      <div className="flex flex-col rounded-2xl border border-border bg-background p-3 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-hidden">
        {/*
          The title block is capped at 38vh and scrolls past that.

          `shrink-0` protects the head from a long thread, but nothing protected
          the thread from a long head: the agent view puts every machine-written
          tag up here and the reporter view an expandable list of their own
          answers, and either can grow taller than the column. The messages region
          is the only `flex-1` in the chain, so all of that growth came out of it —
          expand "Meine Angaben" on a laptop and the conversation collapsed to a
          sliver between the head and the reply box.

          A viewport unit rather than a percentage: a percentage max-height needs a
          parent with a resolved height, and this row's height is its content —
          `max-h-[40%]` there computes to `none` and caps nothing at all.
        */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border pb-3">
          {/* The cap is on the title block, not on the row — the toggle beside it
              has to stay put rather than scroll out of its own header. */}
          <div className="scrollbar-thin min-w-0 flex-1 lg:max-h-[38vh] lg:overflow-y-auto">
            {header}
          </div>

          {/*
            The toggle sits in the chat header rather than beside the sidebar, so
            it is in the same place whether the panel is open or closed. A button
            that moves when you press it is a button people press twice.
          */}
          {showSidebar && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              className="hidden h-8 shrink-0 rounded-full px-3 text-xs text-muted-foreground lg:inline-flex"
            >
              {open ? (
                <PanelRightCloseIcon strokeWidth={1.5} />
              ) : (
                <PanelRightIcon strokeWidth={1.5} />
              )}
              <span className="hidden sm:inline">
                {open ? "Ausblenden" : sidebarLabel}
              </span>
            </Button>
          )}
        </div>

        {/*
          The one scrolling region — from the opening message to directly above the
          reply box. `pr-2` keeps the scrollbar off the bubbles' right edge instead
          of overlapping their border.
        */}
        {cutout ? (
          <div className="py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <TicketCutout />
          </div>
        ) : (
          <>
            <div className="scrollbar-thin overflow-x-hidden py-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
              {messages}
            </div>

            {/*
              Never moves, and by two different mechanisms.

              From `lg` up it is a `shrink-0` sibling of the scroll container — not
              a child of it. The old arrangement held it down with `sticky bottom-0`
              from *inside* the scroller, which is one disagreement about the sticky
              context away from scrolling off with the thread. A sibling in a flex
              column cannot move, whatever the browser thinks about stickiness.

              Below `lg` there is no bounded column and the page scrolls normally,
              so the sibling trick has nothing to hold it against — and on a phone
              the reply box would sit at the far end of a long thread. There, and
              only there, `sticky bottom-0` is the correct tool: it pins to the
              viewport rather than to a scroll container, so there is no context to
              disagree about. `bg-background` because a sticky element over
              scrolling text has to be opaque, and `z-10` to sit above the bubbles
              passing under it.
            */}
            <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-background pt-3 lg:static">
              {composer}
            </div>
          </>
        )}
      </div>

      {/*
        One element for both layouts. At `lg` it is the second column with its own
        scrollbar; below that it is an ordinary block after the conversation, which
        is why the page is allowed to scroll there — hiding it outright would put
        the status dropdowns out of reach on a phone.
      */}
      {showSidebar && open && (
        <aside className="scrollbar-thin grid gap-4 lg:block lg:min-h-0 lg:w-[19rem] lg:shrink-0 lg:space-y-4 lg:overflow-y-auto lg:pr-1">
          {sidebar}
        </aside>
      )}
    </div>
  );
}
