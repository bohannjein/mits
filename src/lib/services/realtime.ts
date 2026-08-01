import "server-only";

import { db } from "@/lib/db/sqlite";

/* ──────────────────────────────────────────────────────────────────────────
   The realtime event bus.

   One job: tell a connected browser that something it is looking at has changed,
   as soon as it changes, without anybody polling for it.

   **Signals, not data.** An event says "ticket X changed" or "there may be
   something in your notification feed" and carries no content whatsoever. The
   client then refetches through the routes that already exist — the ticket page
   through its ordinary server render, the watcher through
   `/api/notifications`. That is not laziness: every one of those paths applies a
   scope rule, and a bus that shipped message bodies would be a second place
   deciding who may read what. The one that is easy to get wrong is the second.

   **Two delivery paths, because Next may run more than one worker.** The mail
   poller's note in AGENTS.md is the same problem seen from the other side: a
   `setInterval` per worker fires twice, and an in-process emitter reaches half
   the connected browsers. So:

     1. `publish` emits to this process's subscribers immediately — the common
        case, and it is instant.
     2. `publish` also writes the event to `mits_realtime_event`, and every
        process runs **one** pump that reads rows it did not write itself.

   The pump is per process, not per connection: a hundred open tabs on one worker
   cost the same single indexed `id > ?` read every two seconds as one tab does.
   With nothing connected there is no pump at all and no query runs.

   The alternative — trusting the in-process emitter alone — fails silently and
   asymmetrically: realtime works for whoever happens to share a worker with the
   writer, and does not for everybody else. That is worse than no realtime,
   because it cannot be reproduced.
   ────────────────────────────────────────────────────────────────────────── */

export type RealtimeEventType =
  /** A ticket's conversation or state changed. Carries the id. */
  | "ticket"
  /** Something may have landed in somebody's notification feed. No id. */
  | "notify"
  /** The queue's contents changed: new ticket, status, assignment. No id. */
  | "queue";

export interface RealtimeEvent {
  type: RealtimeEventType;
  /** Only set for `ticket`. Delivered solely to subscribers watching that id. */
  ticketId?: string;
  /**
   * `staff` keeps an event away from reporters' streams entirely.
   *
   * Not a substitute for the scope rules — those still run on the refetch the
   * signal triggers. This is so a reporter's stream does not carry a heartbeat of
   * how busy the desk is, which is information nobody meant to publish.
   */
  audience: "all" | "staff";
  /**
   * Who caused it. A subscriber never receives its own event: the page that
   * performed the write has already re-rendered, and a signal telling it to do so
   * again is a wasted round trip on every keystroke-sized action.
   */
  actorId?: string;
}

type Subscriber = (event: RealtimeEvent) => void;

interface Registration {
  deliver: Subscriber;
  userId: string;
  staff: boolean;
  /** The one ticket this connection is watching, if any. Authorised at connect. */
  ticketId: string | null;
}

/*
 * Module state on `globalThis`.
 *
 * Next's dev server re-evaluates modules on every edit; a plain module-level Set
 * would leave the previous generation's subscribers behind and their pump
 * running. Same reason the SQLite handle is pinned the way it is.
 */
const globalRef = globalThis as typeof globalThis & {
  __mitsRealtime?: {
    subscribers: Set<Registration>;
    pump: ReturnType<typeof setInterval> | null;
    lastEventId: number;
    ownEventIds: Set<number>;
  };
};

const state = (globalRef.__mitsRealtime ??= {
  subscribers: new Set<Registration>(),
  pump: null,
  lastEventId: 0,
  ownEventIds: new Set<number>(),
});

/** How often a process checks for events written by another process. */
const PUMP_MS = 2000;

/**
 * How long an event row survives.
 *
 * Long enough that a pump tick cannot miss one, short enough that the table
 * stays a handful of rows. It is a delivery buffer, not a log — the audit trail
 * is `mits_audit_log` and it is the thing anybody would actually want to read.
 */
const RETENTION_MS = 60_000;

export function ensureRealtimeTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mits_realtime_event (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      type       TEXT NOT NULL,
      ticket_id  TEXT,
      audience   TEXT NOT NULL,
      actor_id   TEXT
    );
  `);
}

/**
 * Announce a change.
 *
 * Never throws, and that is deliberate at every call site: this is called from
 * inside the transaction-adjacent path of writing a comment or changing a status,
 * and a bus that cannot deliver must not be able to fail the write it is
 * describing. The worst case of a swallowed error is a page that updates on the
 * fallback path a few seconds later.
 */
export function publish(event: RealtimeEvent): void {
  try {
    ensureRealtimeTable();

    const info = db
      .prepare(
        `INSERT INTO mits_realtime_event
           (created_at, type, ticket_id, audience, actor_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        new Date().toISOString(),
        event.type,
        event.ticketId ?? null,
        event.audience,
        event.actorId ?? null,
      );

    /*
     * Remember the row this process wrote, so the pump does not deliver it a
     * second time to the subscribers that already had it from the emitter below.
     * Bounded: the pump clears ids as it passes them, and the cap is a backstop
     * for a process that publishes with nobody connected.
     */
    const id = Number(info.lastInsertRowid);
    state.ownEventIds.add(id);
    if (state.ownEventIds.size > 500) {
      state.ownEventIds.delete(state.ownEventIds.values().next().value as number);
    }
    if (id > state.lastEventId) state.lastEventId = id;

    db.prepare("DELETE FROM mits_realtime_event WHERE created_at < ?").run(
      new Date(Date.now() - RETENTION_MS).toISOString(),
    );
  } catch {
    // Fall through: local subscribers still get it, and the fallback poll covers
    // the rest. A failed announcement is not a failed write.
  }

  fanOut(event);
}

/** Deliver to this process's subscribers, applying audience and ticket scope. */
function fanOut(event: RealtimeEvent): void {
  for (const registration of state.subscribers) {
    if (event.audience === "staff" && !registration.staff) continue;
    // The actor's own page has already re-rendered from the action that caused
    // this; telling it to refresh again is a round trip for no new information.
    if (event.actorId && event.actorId === registration.userId) continue;
    if (event.type === "ticket" && event.ticketId !== registration.ticketId) {
      continue;
    }

    try {
      registration.deliver(event);
    } catch {
      // A closed stream throws on write. The route's cleanup unsubscribes it;
      // one failed delivery must not stop the others.
    }
  }
}

/**
 * Attach a stream. Returns the unsubscribe.
 *
 * `ticketId` is authorised by the caller *before* it gets here — the route calls
 * `getTicketFor` and passes `null` when the answer is null. Doing it here would
 * put a database read in the fan-out path; doing it once per connection is free.
 */
export function subscribe(registration: Registration): () => void {
  ensureRealtimeTable();
  state.subscribers.add(registration);
  startPump();

  return () => {
    state.subscribers.delete(registration);
    if (state.subscribers.size === 0) stopPump();
  };
}

/**
 * One pump per process, running only while somebody is connected.
 *
 * Seeded from the current maximum rather than from zero: a browser connecting
 * now wants what happens next, not the last minute of other people's activity
 * replayed at it.
 */
function startPump(): void {
  if (state.pump) return;

  const row = db
    .prepare("SELECT MAX(id) AS id FROM mits_realtime_event")
    .get() as { id: number | null };
  state.lastEventId = Math.max(state.lastEventId, row.id ?? 0);

  state.pump = setInterval(() => {
    try {
      const rows = db
        .prepare(
          `SELECT id, type, ticket_id, audience, actor_id
             FROM mits_realtime_event
            WHERE id > ?
            ORDER BY id ASC`,
        )
        .all(state.lastEventId) as {
        id: number;
        type: RealtimeEventType;
        ticket_id: string | null;
        audience: "all" | "staff";
        actor_id: string | null;
      }[];

      for (const row of rows) {
        state.lastEventId = row.id;
        // Written by this process — the emitter already delivered it.
        if (state.ownEventIds.delete(row.id)) continue;

        fanOut({
          type: row.type,
          ticketId: row.ticket_id ?? undefined,
          audience: row.audience,
          actorId: row.actor_id ?? undefined,
        });
      }
    } catch {
      // A locked database on one tick is not worth tearing the pump down for;
      // the next tick picks up the same rows because the cursor did not move.
    }
  }, PUMP_MS);

  // Never hold the process open for this. Node should be free to exit on a
  // signal with streams still attached.
  state.pump.unref?.();
}

function stopPump(): void {
  if (!state.pump) return;
  clearInterval(state.pump);
  state.pump = null;
}

/** How many streams this process is serving. Shown on the admin health card. */
export function realtimeSubscriberCount(): number {
  return state.subscribers.size;
}
