"use client";

import { UserPlusIcon, UsersIcon } from "lucide-react";

import { TicketCc } from "@/components/tickets/ticket-cc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* ──────────────────────────────────────────────────────────────────────────
   Who is on this conversation, said out loud.

   Shown to everybody who can open the ticket, reporter included — the same
   reasoning as the Cc field of a mail. Who else is reading is part of the
   conversation, not metadata about it: somebody who does not know their message
   goes to three people writes a different message.

   It renders nothing when the list is empty and nobody may edit it. An empty
   "Beteiligte:" line on every ticket would be furniture on the ninety percent
   that have none.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketParticipants({
  ticketId,
  emails,
  /** Agents, and the reporter on their own ticket — mirrors `setTicketCc`. */
  canEdit,
}: {
  ticketId: string;
  emails: string[];
  canEdit: boolean;
}) {
  if (emails.length === 0 && !canEdit) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <UsersIcon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span>Beteiligte:</span>

      {emails.length === 0 ? (
        <span>niemand</span>
      ) : (
        emails.map((email) => (
          <Badge
            key={email}
            variant="outline"
            className="h-auto max-w-52 rounded-full px-2 py-0 font-normal"
          >
            <span className="truncate">{email}</span>
          </Badge>
        ))
      )}

      {canEdit && (
        <TicketCc ticketId={ticketId} emails={emails}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 rounded-full px-2 text-xs text-muted-foreground"
          >
            <UserPlusIcon strokeWidth={1.5} />
            {emails.length === 0 ? "Jemanden einbeziehen" : "Ändern"}
          </Button>
        </TicketCc>
      )}
    </div>
  );
}
