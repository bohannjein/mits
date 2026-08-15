import "server-only";

import type { SessionUser } from "@/lib/auth/session";
import { filterFor } from "@/lib/agent-views";
import { isFeatureEnabled } from "@/lib/features";
import { listUpcomingReminders } from "@/lib/ticket-reminders";
import { searchTickets } from "@/lib/tickets";
import {
  OPEN_TICKET_STATUSES,
  PRIORITY_RANK,
  type TicketPriority,
} from "@/types/mits";

// Zusammensetzung aus vorhandenen Reads, keine eigene Abfrage.
// Begründungen in .claude/rules/watchers.md.

/** Warum eine Zeile hier steht. Die Reihenfolge *ist* die Rangfolge. */
export const TODAY_REASONS = [
  "reminder",
  "awaiting",
  "watched",
  "pinned",
  "pool",
] as const;
export type TodayReason = (typeof TODAY_REASONS)[number];

export const TODAY_REASON_LABELS: Record<TodayReason, string> = {
  reminder: "Erinnerung",
  awaiting: "Wartet auf uns",
  watched: "Beobachtet",
  pinned: "Angeheftet",
  pool: "Frei im Pool",
};

export interface TodayItem {
  ticketId: string;
  ticketNumber: number | null;
  title: string;
  priority: TicketPriority;
  reason: TodayReason;
  /** Der Satz unter dem Titel — bei einer Erinnerung ihre Notiz. */
  detail: string | null;
  /** Wonach innerhalb eines Grundes sortiert wird. ISO-Zeitstempel. */
  at: string;
}

/** Der Pool ist hier ein Hinweis, kein Arbeitsvorrat. */
const POOL_SUGGESTIONS = 5;

const reasonRank = (reason: TodayReason): number =>
  TODAY_REASONS.indexOf(reason);

export function collectToday(
  user: SessionUser,
): { items: TodayItem[]; poolTotal: number } {
  // Die Reihenfolge der Blöcke unten ist die Rangfolge; `keep` behält je Ticket
  // den dringendsten Grund.
  const found = new Map<string, TodayItem>();
  const keep = (item: TodayItem) => {
    const existing = found.get(item.ticketId);
    if (existing && reasonRank(existing.reason) <= reasonRank(item.reason)) {
      return;
    }
    found.set(item.ticketId, item);
  };

  if (isFeatureEnabled("feature_ticket_reminders")) {
    for (const reminder of listUpcomingReminders(user.id)) {
      keep({
        ticketId: reminder.ticket_id,
        ticketNumber: reminder.ticket_number,
        title: reminder.ticket_title,
        // Erinnerungen stehen ohnehin ganz oben; der Wert sortiert hier nichts.
        priority: "medium",
        reason: "reminder",
        detail: reminder.note || null,
        at: reminder.due_at,
      });
    }
  }

  // `awaiting_reply` kommt fertig aus `searchTickets` und wird nachgefiltert —
  // ein zweiter Filterausdruck wäre eine zweite Definition von „wir sind dran".
  const mine = searchTickets(
    { ...filterFor("mine", "open", user.id), sort: { key: "age", dir: "asc" } },
    user,
  );
  for (const ticket of mine) {
    if (!ticket.awaiting_reply) continue;
    keep({
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      title: ticket.title,
      priority: ticket.priority,
      reason: "awaiting",
      detail: ticket.created_by_email,
      at: ticket.created_at.toISOString(),
    });
  }

  // Beobachtet und seit dem letzten Besuch bewegt. Ohne `unread` wäre das die
  // Abo-Liste und keine Aufgabe.
  if (isFeatureEnabled("feature_ticket_watchers")) {
    const watched = searchTickets(
      { watchedBy: user.id, statusIn: OPEN_TICKET_STATUSES },
      user,
    );
    for (const ticket of watched) {
      if (!ticket.unread) continue;
      keep({
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        title: ticket.title,
        priority: ticket.priority,
        reason: "watched",
        detail: ticket.assigned_to_name ?? null,
        at: (ticket.last_activity_at ?? ticket.created_at).toISOString(),
      });
    }
  }

  if (isFeatureEnabled("feature_ticket_pins")) {
    for (const ticket of searchTickets({ pinnedOnlyFor: user.id }, user)) {
      keep({
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        title: ticket.title,
        priority: ticket.priority,
        reason: "pinned",
        detail: null,
        at: ticket.created_at.toISOString(),
      });
    }
  }

  const pool = searchTickets(
    { ...filterFor("pool", "inbox", user.id), sort: { key: "age", dir: "asc" } },
    user,
  );
  for (const ticket of pool.slice(0, POOL_SUGGESTIONS)) {
    keep({
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      title: ticket.title,
      priority: ticket.priority,
      reason: "pool",
      detail: ticket.created_by_email,
      at: ticket.created_at.toISOString(),
    });
  }

  const items = [...found.values()].sort(
    (a, b) =>
      reasonRank(a.reason) - reasonRank(b.reason) ||
      PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
      a.at.localeCompare(b.at),
  );

  return { items, poolTotal: pool.length };
}
