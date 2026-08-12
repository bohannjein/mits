import "server-only";

import { db } from "@/lib/db/sqlite";
import { OPEN_TICKET_STATUSES, type TicketFilter } from "@/lib/tickets";

/* ──────────────────────────────────────────────────────────────────────────
   The staff queue: a scope and a view.

   Scope answers "whose tickets", view answers "which of them". Splitting the two
   is what removed the old "Meine" tab — that tab mixed both questions, so there
   was no way to ask for "my waiting tickets" without a second tab for every
   combination.

   Each view is a preset over `searchTickets` rather than its own query, so the
   deep filters keep working on top and one place decides what "waiting" means.
   ────────────────────────────────────────────────────────────────────────── */

export const AGENT_SCOPES = ["pool", "mine"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_SCOPE_LABELS: Record<AgentScope, string> = {
  pool: "Pool",
  mine: "Mein Bereich",
};

export const AGENT_VIEWS = ["inbox", "open", "waiting", "escalated", "all"] as const;
export type AgentView = (typeof AGENT_VIEWS)[number];

export const AGENT_VIEW_LABELS: Record<AgentView, string> = {
  inbox: "Eingang",
  open: "Offen",
  waiting: "Wartend",
  escalated: "Eskaliert",
  all: "Alle",
};

export const DEFAULT_AGENT_VIEW: AgentView = "open";
export const DEFAULT_AGENT_SCOPE: AgentScope = "pool";

/**
 * The inbox is unassigned work, which is a pool concept by definition. In "Mein
 * Bereich" it would always be empty, so it is hidden rather than shown as a tab
 * that can never contain anything.
 */
export const POOL_ONLY_VIEWS: AgentView[] = ["inbox"];

export const viewsForScope = (scope: AgentScope): AgentView[] =>
  scope === "pool"
    ? [...AGENT_VIEWS]
    : AGENT_VIEWS.filter((view) => !POOL_ONLY_VIEWS.includes(view));

export function isAgentView(value: unknown): value is AgentView {
  return (
    typeof value === "string" && (AGENT_VIEWS as readonly string[]).includes(value)
  );
}

export function isAgentScope(value: unknown): value is AgentScope {
  return (
    typeof value === "string" && (AGENT_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Build the filter for a scope and view.
 *
 * `open` deliberately includes tickets that already have an owner — it is "still
 * being worked on", not "nobody has touched it". That distinction is the whole
 * point of having a separate inbox: without it, an agent picking up a ticket
 * would make it vanish from the only list that showed active work.
 */
export function filterFor(
  scope: AgentScope,
  view: AgentView,
  agentId: string,
): TicketFilter {
  const base: TicketFilter =
    scope === "mine" ? { assignedTo: agentId } : {};

  switch (view) {
    case "inbox":
      /*
       * Unassigned by definition, so the scope's assignee clause is dropped
       * rather than combined into a contradiction.
       *
       * **Jeder offene Status, nicht nur `open`.** Vorher stand hier
       * `status: "open"`, und damit fiel ein unzugewiesenes Ticket aus dem Pool,
       * sobald es irgendetwas anderes hieß — es stand dann in keiner Liste mehr:
       * nicht im Eingang, weil der Status nicht passte, und nicht in „Mein
       * Bereich", weil es niemandem gehörte.
       *
       * Mit drei Statuswerten ist der Fall `waiting_user` ohne Bearbeiter: ein
       * Agent, der antwortet und danach die Zuweisung von Hand leert, oder ein
       * Ticket, dessen Bearbeiter das Konto verloren hat. Selten, und genau
       * deshalb der Fall, der ohne diese Zeile jahrelang unbemerkt bliebe.
       */
      return { unassignedOnly: true, statusIn: OPEN_TICKET_STATUSES };
    case "open":
      return { ...base, statusIn: OPEN_TICKET_STATUSES };
    case "waiting":
      return { ...base, status: "waiting_user" };
    case "escalated":
      return { ...base, priorityIn: ["high", "critical"], statusIn: OPEN_TICKET_STATUSES };
    case "all":
      return base;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Saved start view.

   One `mits_setting` row per agent: a short string, written on every explicit
   switch and read once. A table would need its own migration and buy nothing.
   ────────────────────────────────────────────────────────────────────────── */

const key = (userId: string) => `agent_view:${userId}`;

interface SavedView {
  scope: AgentScope;
  view: AgentView;
}

export function getSavedAgentView(userId: string): SavedView {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(key(userId)) as { value: string } | undefined;

  const fallback: SavedView = {
    scope: DEFAULT_AGENT_SCOPE,
    view: DEFAULT_AGENT_VIEW,
  };
  if (!row) return fallback;

  const parsed = safeJsonParse(row.value);

  // Older rows stored the bare view string, before scopes existed. Read them
  // rather than resetting somebody's start view on upgrade.
  if (isAgentView(parsed)) return { scope: DEFAULT_AGENT_SCOPE, view: parsed };

  if (parsed && typeof parsed === "object") {
    const candidate = parsed as { scope?: unknown; view?: unknown };
    return {
      scope: isAgentScope(candidate.scope) ? candidate.scope : fallback.scope,
      view: isAgentView(candidate.view) ? candidate.view : fallback.view,
    };
  }

  return fallback;
}

export function saveAgentView(userId: string, saved: SavedView): void {
  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key(userId), JSON.stringify(saved));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
