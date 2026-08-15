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

/* ──────────────────────────────────────────────────────────────────────────
   „Mein Tag": eine Liste statt fünf.

   **Keine neue Tabelle und keine neue Abfrage.** Alles hier ist eine
   Zusammensetzung dessen, was die Queue ohnehin liest — `filterFor` für die
   Presets, `searchTickets` für die Zeilen, `listUpcomingReminders` für die
   eigenen Notizen. Das ist der ganze Punkt: die Angaben lagen verstreut auf
   Queue-Reitern, Pin-Block und Erinnerungs-Widget, und keine davon beantwortete
   „womit fange ich an".

   **Eine Liste, nicht fünf Abschnitte mit eigener Sortierung.** Überfälliges
   unter „steht noch an" ist die eine Reihenfolge, die eine Aufgabenliste nicht
   haben darf — dieselbe Regel, aus der das Erinnerungs-Widget seine beiden
   Hälften nicht trennt. Der Grund steht als Etikett an der Zeile, damit die
   Ordnung nachvollziehbar bleibt.

   **Ein Ticket erscheint einmal**, mit seinem dringendsten Grund. Zweimal
   dieselbe Zeile mit zwei Etiketten wäre eine Liste, deren Länge nichts sagt.
   ────────────────────────────────────────────────────────────────────────── */

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

/**
 * Wie viele Pool-Tickets als Angebot erscheinen.
 *
 * Der Pool ist hier kein Arbeitsvorrat, sondern der Hinweis „es liegt noch
 * etwas da". Die vollständige Liste hat die Queue, und ein Link steht darunter.
 */
const POOL_SUGGESTIONS = 5;

const reasonRank = (reason: TodayReason): number =>
  TODAY_REASONS.indexOf(reason);

/**
 * Die Liste für eine Person.
 *
 * Ohne `now`-Parameter, anders als `collectTeamOverview`: hier zieht keine
 * Abfrage eine Zeitgrenze — `listUpcomingReminders` entscheidet „fällig" selbst,
 * und alles andere ist Reihenfolge. Die Uhr für die Anzeige holt sich die Seite.
 */
export function collectToday(
  user: SessionUser,
): { items: TodayItem[]; poolTotal: number } {
  /*
   * Erst gesammelt, dann entdoppelt. Die Reihenfolge der Blöcke unten ist die
   * Rangfolge der Gründe, und `keep` behält den ersten Treffer je Ticket — also
   * den dringendsten.
   */
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
        // Eine Erinnerung trägt die Priorität ihres Tickets nicht mit; sie steht
        // ohnehin ganz oben, also ist der Wert hier kein Sortierkriterium.
        priority: "medium",
        reason: "reminder",
        detail: reminder.note || null,
        at: reminder.due_at,
      });
    }
  }

  /*
   * Meine offenen Tickets, auf denen der Melder nachgelegt hat.
   *
   * `awaiting_reply` ist der geteilte Marker aus der Queue-Zeile und wird hier
   * nachgefiltert statt in SQL: die Spalte kommt fertig aus `searchTickets`, und
   * ein zweiter Filterausdruck dafür wäre eine zweite Definition von „wir sind
   * dran".
   */
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

  /*
   * Der Pool zuletzt und gedeckelt.
   *
   * Er ist das Angebot, nicht die Pflicht: was hier steht, gehört noch
   * niemandem. Ungedeckelt wäre „Mein Tag" auf einer belasteten Instanz eine
   * Kopie des Eingangs mit einer irreführenden Überschrift.
   */
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
