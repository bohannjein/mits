import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getAISettings } from "@/lib/ai-settings";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/sqlite";
import { QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
import { AIProviderError, completeJson } from "@/lib/services/ai/provider";
import {
  clusterTickets,
  type ClusterInput,
} from "@/lib/services/ai/similarity";
import { openingFieldName } from "@/lib/ticket-opening";
import { isAIFeatureOn, formatTicketNumber } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Major incidents: noticing that twelve tickets are one problem.

   The grouping is `similarity.ts` — arithmetic, no model, testable. This file is
   the part that reads the database, remembers what an agent dismissed, and turns
   an accepted cluster into a real parent ticket with real children.

   **The model is optional even here.** It writes the banner's headline and nothing
   else. With no provider configured the banner still appears, titled from the
   words the tickets share. An outage should not go unnoticed because an API key
   expired.

   **Nothing happens automatically.** The banner is a suggestion with two buttons.
   Auto-creating a parent ticket and re-statusing four customers' tickets on the
   strength of word overlap is exactly the kind of confident wrongness that makes
   people switch a feature off — and the cost of being wrong is paid by the
   reporters, who get told their ticket is waiting on something unrelated.
   ────────────────────────────────────────────────────────────────────────── */

const DISMISS_KEY = "ai_cluster_dismissed";

/** How long a dismissal sticks. Long enough for a shift, short enough to forget. */
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

/** Ceiling on what one pass looks at, whatever window the admin configured. */
const MAX_CANDIDATES = 200;

/** Body characters fed into the comparison. A title plus the first paragraph. */
const BODY_CHARS = 400;

export interface ClusterMember {
  id: string;
  number: string;
  title: string;
}

export interface DetectedCluster {
  /** Stable across renders as long as the membership is — used as a React key. */
  key: string;
  title: string;
  keywords: string[];
  members: ClusterMember[];
}

/* ── Dismissals ─────────────────────────────────────────────────────────── */

const DismissedSchema = z.record(z.string(), z.number());

/**
 * Which tickets an agent has already waved away, ticket id to timestamp.
 *
 * Per *ticket*, not per cluster. A cluster has no identity — it gains and loses
 * members as tickets arrive — so a dismissal keyed on the group would either
 * expire the moment somebody else reported the same outage, or suppress a growing
 * incident forever. Keyed on members, a dismissed group stays quiet until a *new*
 * ticket joins it, which is precisely when it is worth mentioning again.
 */
function dismissedIds(): Map<string, number> {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(DISMISS_KEY) as { value: string } | undefined;
  if (!row) return new Map();

  try {
    const parsed = DismissedSchema.safeParse(JSON.parse(row.value));
    if (!parsed.success) return new Map();

    const cutoff = Date.now() - DISMISS_TTL_MS;
    return new Map(
      Object.entries(parsed.data).filter(([, at]) => at >= cutoff),
    );
  } catch {
    return new Map();
  }
}

/** Wave a cluster away. Pruned on write, so the row cannot grow without bound. */
export function dismissCluster(ticketIds: string[]): void {
  const current = dismissedIds();
  const now = Date.now();
  for (const id of ticketIds) current.set(id, now);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(DISMISS_KEY, JSON.stringify(Object.fromEntries(current)));
}

/* ── Detection ──────────────────────────────────────────────────────────── */

interface CandidateRow {
  id: string;
  ticket_number: number | null;
  title: string;
  payload: string;
}

/**
 * Open, unparented tickets from the configured window.
 *
 * `waiting_major` is excluded because those are already somebody's children, and
 * so is anything that is already a major incident — an outage must not be
 * clustered with the outage ticket describing it.
 */
function candidates(windowMinutes: number): ClusterInput[] {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const rows = db
    .prepare(
      `SELECT t.id, t.ticket_number, t.title, t.payload
         FROM mits_ticket t
        WHERE t.deleted_at IS NULL
          AND t.major_incident = 0
          AND t.status IN ('open', 'in_progress')
          AND t.created_at >= ?
          AND NOT EXISTS (
            SELECT 1 FROM mits_ticket_link l
             WHERE l.to_ticket = t.id AND l.kind = 'parent_of'
          )
        ORDER BY t.created_at DESC
        LIMIT ?`,
    )
    .all(since, MAX_CANDIDATES) as CandidateRow[];

  return rows.map((row) => ({
    id: row.id,
    text: `${row.title} ${openingText(row.payload)}`,
  }));
}

/** The reporter's own words out of a stored payload, bounded. */
function openingText(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const field = openingFieldName(parsed);
    if (!field) return "";
    return String(parsed[field] ?? "").slice(0, BODY_CHARS);
  } catch {
    return "";
  }
}

const HeadlineSchema = z.object({ title: z.string().min(1).max(120) });

/**
 * A short name for the group, from the model when there is one.
 *
 * Falls back to the shared keywords on any failure, including a switched-off
 * provider — never throws. A banner that fails to render because the naming step
 * timed out would hide the outage it exists to announce.
 *
 * Only titles and keywords are sent, never bodies: a headline needs the topic, and
 * the bodies are where the personal detail is.
 */
async function headline(
  titles: string[],
  keywords: string[],
): Promise<string> {
  const settings = getAISettings();
  const fallback =
    keywords.length > 0
      ? keywords.map(capitalise).join(" · ")
      : "Mehrere ähnliche Meldungen";

  if (!isAIFeatureOn(settings, "clustering")) return fallback;
  // The grouping needs no model; naming does. An instance with clustering on and
  // no provider gets the keyword title, which is the point of the fallback.
  if (settings.textModel.trim() === "") return fallback;

  try {
    const answer = await completeJson(settings, {
      system:
        "Du benennst IT-Störungen. Antworte mit einem kurzen deutschen Titel, maximal sechs Wörter, ohne Satzzeichen am Ende.",
      prompt: `Diese Ticket-Titel gehören vermutlich zur selben Störung:\n\n${titles
        .map((title) => `- ${title}`)
        .join("\n")}\n\nWie heißt die gemeinsame Störung?`,
      schemaName: "mits_incident_headline",
      schema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
    });

    const parsed = HeadlineSchema.safeParse(answer);
    return parsed.success ? parsed.data.title.trim() : fallback;
  } catch (error) {
    if (error instanceof AIProviderError) return fallback;
    throw error;
  }
}

const capitalise = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Clusters worth showing right now, or an empty list.
 *
 * Async only because of the headline. Everything that decides *whether* there is
 * a cluster is synchronous and model-free.
 */
export async function detectClusters(): Promise<DetectedCluster[]> {
  const settings = getAISettings();
  if (!isAIFeatureOn(settings, "clustering")) return [];

  const items = candidates(settings.clusterWindowMinutes);
  if (items.length < settings.clusterMinTickets) return [];

  const dismissed = dismissedIds();
  const groups = clusterTickets(items, {
    minSize: settings.clusterMinTickets,
  }).filter((group) =>
    // Suppressed only while *every* member is known. One new report revives it.
    group.ids.some((id) => !dismissed.has(id)),
  );

  if (groups.length === 0) return [];

  const byId = new Map(
    (
      db
        .prepare(
          `SELECT id, ticket_number, title FROM mits_ticket WHERE id IN (${groups
            .flatMap((group) => group.ids)
            .map(() => "?")
            .join(", ")})`,
        )
        .all(...groups.flatMap((group) => group.ids)) as CandidateRow[]
    ).map((row) => [row.id, row]),
  );

  const detected: DetectedCluster[] = [];

  for (const group of groups) {
    const members = group.ids
      .map((id) => byId.get(id))
      .filter((row): row is CandidateRow => row !== undefined)
      .map((row) => ({
        id: row.id,
        number: formatTicketNumber(row.ticket_number ?? 0),
        title: row.title,
      }));

    if (members.length < settings.clusterMinTickets) continue;

    detected.push({
      // Sorted, so the key does not change when the same members come back in a
      // different order — React would otherwise remount the banner on every poll.
      key: [...group.ids].sort().join("|"),
      title: await headline(
        members.map((member) => member.title),
        group.keywords,
      ),
      keywords: group.keywords,
      members,
    });
  }

  // One at a time. Two banners stacked above a queue is a wall, and the largest
  // group is the one worth acting on first.
  return detected.slice(0, 1);
}

/* ── Promotion ──────────────────────────────────────────────────────────── */

export class ClusterError extends Error {}

/**
 * Turn a cluster into a parent ticket with children.
 *
 * One transaction: a parent that exists while half its children were never
 * re-statused is worse than no parent, because the agent has to work out which
 * half by hand.
 *
 * The children keep their reporters and their history. They are re-statused, not
 * merged — a customer's ticket is their record of having asked, and folding it
 * into somebody else's would take that away.
 */
export function promoteToMajorIncident(
  title: string,
  ticketIds: string[],
  user: SessionUser,
): { id: string; number: string; children: number } {
  if (ticketIds.length === 0) {
    throw new ClusterError("Keine Tickets ausgewählt.");
  }

  const now = new Date().toISOString();
  const parentId = randomUUID();
  const clean = title.trim().slice(0, 160) || "Hauptstörung";

  const run = db.transaction(() => {
    /*
     * Only tickets that are still eligible. Between rendering the banner and the
     * click, one of them may have been closed, deleted or adopted by another major
     * incident — re-checked inside the transaction rather than trusted from the
     * form, which is the same rule every other action here follows.
     */
    const placeholders = ticketIds.map(() => "?").join(", ");
    const children = db
      .prepare(
        `SELECT id FROM mits_ticket
          WHERE deleted_at IS NULL
            AND major_incident = 0
            AND status IN ('open', 'in_progress')
            AND id IN (${placeholders})`,
      )
      .all(...ticketIds) as { id: string }[];

    if (children.length === 0) {
      throw new ClusterError(
        "Keines der Tickets ist noch offen — die Hauptstörung wurde nicht angelegt.",
      );
    }

    const number =
      (
        db.prepare("SELECT MAX(ticket_number) AS n FROM mits_ticket").get() as {
          n: number | null;
        }
      ).n ?? 0;

    db.prepare(
      `INSERT INTO mits_ticket
         (id, ticket_number, location_id, created_by, created_by_email, source,
          form_schema_id, title, payload, status, priority, assigned_to,
          created_at, tags, major_incident)
       VALUES
         (@id, @ticket_number, NULL, @created_by, @created_by_email, 'legacy',
          @form_schema_id, @title, @payload, 'in_progress', 'critical',
          @assigned_to, @created_at, '[]', 1)`,
    ).run({
      id: parentId,
      ticket_number: number + 1,
      created_by: user.id,
      created_by_email: user.email,
      form_schema_id: QUICK_TICKET_SCHEMA.id,
      title: clean,
      payload: JSON.stringify({
        title: clean,
        description: `Zusammengefasste Hauptstörung für ${children.length} gemeldete Tickets.`,
      }),
      // Assigned to whoever declared it: they just took ownership of the outage by
      // pressing the button, and an unassigned critical ticket in the pool is the
      // thing a major incident exists to prevent.
      assigned_to: user.id,
      created_at: now,
    });

    const link = db.prepare(
      `INSERT INTO mits_ticket_link
         (id, from_ticket, to_ticket, kind, created_by, created_at)
       VALUES (?, ?, ?, 'parent_of', ?, ?)`,
    );
    const park = db.prepare(
      "UPDATE mits_ticket SET status = 'waiting_major' WHERE id = ?",
    );
    const audit = db.prepare(
      `INSERT INTO mits_audit_log
         (id, ticket_id, actor_id, actor_email, action, field, old_value,
          new_value, created_at)
       VALUES (?, ?, ?, ?, 'status_changed', 'status', '', 'waiting_major', ?)`,
    );

    for (const child of children) {
      link.run(randomUUID(), parentId, child.id, user.id, now);
      park.run(child.id);
      // Written here rather than through `setTicketStatus`: that function reads the
      // row back after each write, and this loop would then do three queries per
      // child inside a transaction for a value it already knows.
      audit.run(randomUUID(), child.id, user.id, user.email, now);
    }

    return { number: number + 1, children: children.length };
  });

  const result = run();

  return {
    id: parentId,
    number: formatTicketNumber(result.number),
    children: result.children,
  };
}

/** Children of a major incident that are still parked behind it. */
export function parkedChildren(
  parentId: string,
): { id: string; number: string; title: string }[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.ticket_number, t.title
         FROM mits_ticket_link l
         JOIN mits_ticket t ON t.id = l.to_ticket
        WHERE l.from_ticket = ?
          AND l.kind = 'parent_of'
          AND t.deleted_at IS NULL
          AND t.status = 'waiting_major'
        ORDER BY t.ticket_number ASC`,
    )
    .all(parentId) as CandidateRow[];

  return rows.map((row) => ({
    id: row.id,
    number: formatTicketNumber(row.ticket_number ?? 0),
    title: row.title,
  }));
}
