import "server-only";

import { statSync } from "node:fs";
import { join } from "node:path";

import { dataDir } from "@/lib/auth/secret";
import { db } from "@/lib/db/sqlite";
import { DataSettingsSchema, type DataSettings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Data settings and storage statistics.

   Two things live here: what an admin configured about retention and upload limits, and
   what the instance currently holds. Both feed one page, and neither belongs in
   `system-settings.ts` — that one is read by the root layout on every request, and
   putting a `statSync` of the database file behind it would cost a stat per page view.
   ────────────────────────────────────────────────────────────────────────── */

const DATA_KEY = "data";

export function getDataSettings(): DataSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(DATA_KEY) as { value: string } | undefined;

  if (!row) return DataSettingsSchema.parse({});

  try {
    // Defaults per field, so a row written before a field existed keeps working rather
    // than resetting the ones an admin did set.
    return DataSettingsSchema.parse(JSON.parse(row.value));
  } catch {
    return DataSettingsSchema.parse({});
  }
}

export function setDataSettings(next: DataSettings): DataSettings {
  const parsed = DataSettingsSchema.parse(next);
  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(DATA_KEY, JSON.stringify(parsed));
  return parsed;
}

/** The upload ceiling in effect. Read per request — an admin change applies at once. */
export const maxUploadBytes = (): number =>
  getDataSettings().maxUploadMb * 1024 * 1024;

/* ── Statistics ─────────────────────────────────────────────────────────── */

export interface StorageStats {
  tickets: { alive: number; deleted: number };
  comments: { alive: number; deleted: number };
  attachments: { alive: number; deleted: number; bytes: number; deletedBytes: number };
  /** Size of the SQLite file plus its WAL, in bytes. Zero when unreadable. */
  databaseBytes: number;
}

export function storageStats(): StorageStats {
  const pair = (table: string) => {
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS alive,
           SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted
         FROM ${table}`,
      )
      .get() as { alive: number | null; deleted: number | null };
    return { alive: row.alive ?? 0, deleted: row.deleted ?? 0 };
  };

  const bytes = db
    .prepare(
      `SELECT
         SUM(CASE WHEN deleted_at IS NULL THEN size_bytes ELSE 0 END) AS live,
         SUM(CASE WHEN deleted_at IS NOT NULL THEN size_bytes ELSE 0 END) AS gone
       FROM mits_upload`,
    )
    .get() as { live: number | null; gone: number | null };

  const attachments = pair("mits_upload");

  return {
    tickets: pair("mits_ticket"),
    comments: pair("mits_ticket_comment"),
    attachments: {
      ...attachments,
      bytes: bytes.live ?? 0,
      deletedBytes: bytes.gone ?? 0,
    },
    databaseBytes: databaseSize(),
  };
}

/**
 * The database file plus its write-ahead log.
 *
 * The WAL is counted because it is real disk usage and can exceed the main file for a
 * while after a busy period. Reported as one number rather than two: an admin watching
 * a volume fill up cares about the total, and explaining WAL checkpointing in a settings
 * page would be documentation, not information.
 *
 * Zero when the files cannot be read — a statistics panel must not be able to break the
 * page it is on.
 */
function databaseSize(): number {
  const base = join(dataDir(), "mits.db");
  let total = 0;
  for (const path of [base, `${base}-wal`, `${base}-shm`]) {
    try {
      total += statSync(path).size;
    } catch {
      /* absent or unreadable — not an error, WAL files come and go */
    }
  }
  return total;
}

/* ── Retention ──────────────────────────────────────────────────────────── */

export interface RetentionCandidates {
  /** Tickets closed longer ago than the policy allows. */
  count: number;
  /** The cut-off, so the page can state it rather than only the number of years. */
  before: Date;
}

/**
 * What the policy would currently affect.
 *
 * Shown before the button is pressed, because anonymising is the one destructive
 * operation MITS performs and "this will affect 412 tickets" is the difference between
 * an informed click and a regretted one.
 *
 * Measured against `created_at`, not the closing date: MITS does not record when a
 * ticket was closed. Said out loud rather than papered over — the effect is that a
 * long-running case is anonymised by its age, and adding a `closed_at` column is the
 * fix if that matters.
 */
export function retentionCandidates(settings = getDataSettings()): RetentionCandidates {
  const before = new Date();
  before.setFullYear(before.getFullYear() - settings.retentionYears);

  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket
        WHERE status IN ('closed', 'resolved')
          AND created_at < ?
          AND created_by_email != ?`,
    )
    .get(before.toISOString(), ANONYMISED_EMAIL) as { count: number };

  return { count: row.count, before };
}

/** What an anonymised row carries instead of an address. */
export const ANONYMISED_EMAIL = "anonymisiert@entfernt.invalid";
const ANONYMISED_NAME = "Anonymisiert";

/**
 * Strip personal identifiers from tickets past the retention period.
 *
 * Irreversible, and the only operation in MITS that destroys data — which is why it is
 * never automatic. There is no scheduler in this application: it runs when an admin runs
 * it, and the page says so rather than implying a nightly job that does not exist.
 *
 * What goes: the reporter's address and name on the ticket and on every comment. What
 * stays: the ticket itself, its answers and its history. That is the point of
 * anonymising rather than deleting — the technical record of what happened remains
 * usable, and the person it happened to is no longer identifiable from it.
 *
 * The audit trail is deliberately *not* rewritten. It records who acted on the ticket —
 * staff, not the reporter — and an immutable log that this function could edit would not
 * be immutable.
 */
export function applyRetention(): { tickets: number; comments: number } {
  const { before } = retentionCandidates();
  const cutoff = before.toISOString();

  return db.transaction(() => {
    const ids = db
      .prepare(
        `SELECT id FROM mits_ticket
          WHERE status IN ('closed', 'resolved')
            AND created_at < ?
            AND created_by_email != ?`,
      )
      .all(cutoff, ANONYMISED_EMAIL) as { id: string }[];

    if (ids.length === 0) return { tickets: 0, comments: 0 };

    const anonymiseTicket = db.prepare(
      `UPDATE mits_ticket
          SET created_by = '', created_by_email = ?
        WHERE id = ?`,
    );
    const anonymiseComments = db.prepare(
      `UPDATE mits_ticket_comment
          SET author_id = '', author_email = ?, author_name = ?
        WHERE ticket_id = ? AND author_is_agent = 0`,
    );

    let comments = 0;
    for (const { id } of ids) {
      anonymiseTicket.run(ANONYMISED_EMAIL, id);
      // Reporter comments only. An agent's name on a reply is a work record, and the
      // retention rule is about the reporter's data.
      comments += anonymiseComments.run(ANONYMISED_EMAIL, ANONYMISED_NAME, id).changes;
    }

    return { tickets: ids.length, comments };
  })();
}
