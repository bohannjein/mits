import "server-only";

import { db } from "@/lib/db/sqlite";
import { OPEN_TICKET_STATUSES, type TicketFilter } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   The staff queue views.

   Each tab is a preset over `searchTickets` (part 3) rather than its own query.
   One place decides what "waiting" means, and the deep filters keep working on
   top of a tab because both end up in the same filter object.
   ────────────────────────────────────────────────────────────────────────── */

export const AGENT_VIEWS = ["inbox", "mine", "waiting", "escalated", "all"] as const;
export type AgentView = (typeof AGENT_VIEWS)[number];

export const AGENT_VIEW_LABELS: Record<AgentView, string> = {
  inbox: "Eingang",
  mine: "Meine",
  waiting: "Wartend",
  escalated: "Eskaliert",
  all: "Alle",
};

export const DEFAULT_AGENT_VIEW: AgentView = "inbox";

export function isAgentView(value: unknown): value is AgentView {
  return (
    typeof value === "string" && (AGENT_VIEWS as readonly string[]).includes(value)
  );
}

/**
 * Turn a tab into a filter.
 *
 * `escalated` reads high and critical, which are the two priorities above the
 * default — the point of the tab is "needs looking at now", not a single value.
 */
export function filterForView(view: AgentView, agentId: string): TicketFilter {
  switch (view) {
    case "inbox":
      return { unassignedOnly: true, statusIn: OPEN_TICKET_STATUSES };
    case "mine":
      return { assignedTo: agentId, statusIn: OPEN_TICKET_STATUSES };
    case "waiting":
      return { status: "waiting_user" };
    case "escalated":
      // The two priorities above the default. Part 6 renames `urgent` to
      // `critical`; the enum is the single source, so this follows the rename.
      return { priorityIn: ["high", "critical"], statusIn: OPEN_TICKET_STATUSES };
    case "all":
      return {};
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Saved start view.

   One `mits_setting` row per agent rather than a table: it is a single short
   string per user, written on every queue visit and read once. A table would buy
   nothing and need its own migration.
   ────────────────────────────────────────────────────────────────────────── */

const key = (userId: string) => `agent_view:${userId}`;

export function getSavedAgentView(userId: string): AgentView {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(key(userId)) as { value: string } | undefined;

  if (!row) return DEFAULT_AGENT_VIEW;

  // Stored as a bare string, so a value from a build that knew a view this one
  // does not falls back instead of rendering an empty queue.
  const parsed = safeJsonParse(row.value);
  return isAgentView(parsed) ? parsed : DEFAULT_AGENT_VIEW;
}

export function saveAgentView(userId: string, view: AgentView): void {
  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key(userId), JSON.stringify(view));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
