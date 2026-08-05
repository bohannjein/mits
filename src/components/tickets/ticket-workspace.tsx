"use client";

import {
  ArrowRightLeftIcon,
  CheckSquareIcon,
  ClockIcon,
  FolderTreeIcon,
  LinkIcon,
  MessageSquareIcon,
  PrinterIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { DispatchDialog } from "@/components/tickets/dispatch-dialog";
import { ReRouteModal } from "@/components/tickets/re-route-modal";
import {
  ReminderPopover,
  type ReminderRow,
} from "@/components/tickets/reminder-popover";
import { TicketParticipants } from "@/components/tickets/ticket-participants";
import {
  TicketChecklist,
  type ChecklistRowProps,
} from "@/components/tickets/ticket-checklist";
import { TicketLinks, type LinkRow } from "@/components/tickets/ticket-links";
import {
  TicketWorklog,
  type WorklogRow,
} from "@/components/tickets/ticket-worklog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MITSCategoryNode } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The agent's working surface: one bar of actions, and what they open.

   Everything here used to live in collapsed sections of the right-hand column.
   That column is 19rem wide and scrolls on its own, so reaching the checklist
   meant scrolling a sidebar to find a heading, opening it, and then working a
   twelve-step list inside a strip narrower than the list needs. The three that
   are genuinely *work* — checklist, time, links — are now a click from the
   title, and they open where there is room for them.

   **The checklist replaces the conversation rather than sitting above it.** The
   two are alternatives: nobody reads a thread and ticks steps in the same
   glance, and stacking them would push the newest message below the fold on
   exactly the tickets that have the longest lists. The bar says which of the two
   is showing.

   Time and links stay dialogs. They are consulted, not worked in — a dialog is
   the honest shape for something you open, change and dismiss.
   ────────────────────────────────────────────────────────────────────────── */

type Panel = "conversation" | "checklist";

export function TicketWorkspace({
  ticketId,
  agents,
  currentAssignee,
  ccEmails,
  checklist,
  worklog,
  links,
  reminders,
  routing,
  children,
}: {
  ticketId: string;
  agents: { id: string; name: string }[];
  currentAssignee: string | null;
  ccEmails: string[];
  /** Null when this ticket type declares no steps — the button is then absent. */
  checklist: ChecklistRowProps[] | null;
  /** Null when time tracking is switched off. */
  worklog: { entries: WorklogRow[]; today: string } | null;
  /** Null when the linking module is switched off. */
  links: LinkRow[] | null;
  /** Null when reminders are switched off. Empty array means "none set yet". */
  reminders: ReminderRow[] | null;
  /** Null when categories are switched off — no tree means nothing to re-route to. */
  routing: {
    categories: MITSCategoryNode[];
    currentCategoryId: string | null;
    suggestion: { id: string; path: string[] } | null;
  } | null;
  /** The conversation, server-rendered. */
  children: ReactNode;
}) {
  const [panel, setPanel] = useState<Panel>("conversation");
  const [dispatching, setDispatching] = useState(false);
  const [timing, setTiming] = useState(false);
  const [linking, setLinking] = useState(false);
  const [rerouting, setRerouting] = useState(false);

  const answered = checklist?.filter((row) => row.value !== "").length ?? 0;
  const total = checklist?.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        Beteiligte above the bar, not as a button in it.

        It was a count on a pill, which answers "how many" and never "who" —
        and who is on the thread is the thing that changes what somebody writes.
        The same line renders on the reporter's page, so both sides read the
        same list.
      */}
      <div className="pb-2">
        <TicketParticipants
          ticketId={ticketId}
          emails={ccEmails}
          canEdit
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-3">
        <BarButton
          icon={<ArrowRightLeftIcon strokeWidth={1.5} />}
          label="Dispatch"
          onClick={() => setDispatching(true)}
        />

        {/*
          Re-Route beside Dispatch, because the two are the same gesture aimed at
          different things: Dispatch hands the ticket to a person, Re-Route moves
          it to a queue. Adjacent so the agent who realises „das ist nicht mein
          Thema" finds both readings of that thought in one place.
        */}
        {routing && (
          <BarButton
            icon={<FolderTreeIcon strokeWidth={1.5} />}
            label="Re-Route"
            onClick={() => setRerouting(true)}
          />
        )}

        {/*
          Its own trigger rather than a `BarButton`, because it opens a popover and
          the popover has to be anchored to the element that opened it. Same height,
          radius and hover behaviour — see the note on `BarButton`.
        */}
        {reminders && (
          <ReminderPopover ticketId={ticketId} reminders={reminders} />
        )}

        {checklist && (
          <BarButton
            icon={
              panel === "checklist" ? (
                <MessageSquareIcon strokeWidth={1.5} />
              ) : (
                <CheckSquareIcon strokeWidth={1.5} />
              )
            }
            label={panel === "checklist" ? "Verlauf" : "Checkliste"}
            count={panel === "checklist" ? undefined : `${answered}/${total}`}
            active={panel === "checklist"}
            onClick={() =>
              setPanel((current) =>
                current === "checklist" ? "conversation" : "checklist",
              )
            }
          />
        )}

        {worklog && (
          <BarButton
            icon={<ClockIcon strokeWidth={1.5} />}
            label="Zeiterfassung"
            onClick={() => setTiming(true)}
          />
        )}

        {links && (
          <BarButton
            icon={<LinkIcon strokeWidth={1.5} />}
            label="Verknüpfen"
            count={links.length > 0 ? String(links.length) : undefined}
            onClick={() => setLinking(true)}
          />
        )}

        {/*
          The browser's own print dialog, on the page as it stands. Not a
          separate print route: what an agent wants on paper is the thread they
          are looking at, and a second rendering of it is a second thing to keep
          correct.
        */}
        <BarButton
          icon={<PrinterIcon strokeWidth={1.5} />}
          label="Drucken"
          onClick={() => window.print()}
        />
      </div>

      {panel === "checklist" && checklist ? (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-4">
          <TicketChecklist ticketId={ticketId} rows={checklist} />
        </div>
      ) : (
        children
      )}

      <DispatchDialog
        ticketId={ticketId}
        agents={agents}
        currentAssignee={currentAssignee}
        open={dispatching}
        onOpenChange={setDispatching}
      />

      {routing && (
        <ReRouteModal
          ticketId={ticketId}
          categories={routing.categories}
          currentCategoryId={routing.currentCategoryId}
          suggestion={routing.suggestion}
          open={rerouting}
          onOpenChange={setRerouting}
        />
      )}

      {worklog && (
        <Dialog open={timing} onOpenChange={setTiming}>
          <DialogContent className="rounded-3xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-medium">
                Zeiterfassung
              </DialogTitle>
            </DialogHeader>
            <TicketWorklog
              ticketId={ticketId}
              entries={worklog.entries}
              today={worklog.today}
            />
          </DialogContent>
        </Dialog>
      )}

      {links && (
        <Dialog open={linking} onOpenChange={setLinking}>
          <DialogContent className="rounded-3xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-medium">
                Verknüpfte Tickets
              </DialogTitle>
            </DialogHeader>
            <TicketLinks bare ticketId={ticketId} links={links} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/**
 * One button in the bar.
 *
 * A local composition of the shadcn `Button`, not a new primitive: six controls
 * that have to be the same height, radius and hover behaviour, and six copies of
 * that class string is how one of them ends up a pixel taller than the rest.
 */
function BarButton({
  icon,
  label,
  count,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3.5 text-xs font-medium",
        active
          ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          : "bg-surface-elevated text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      {label}
      {count && (
        <Badge
          variant="secondary"
          className="ml-0.5 h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
        >
          {count}
        </Badge>
      )}
    </Button>
  );
}
