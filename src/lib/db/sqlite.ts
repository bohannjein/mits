import "server-only";

import Database from "better-sqlite3";
import { join } from "node:path";

import { dataDir } from "@/lib/auth/secret";
import { TICKET_NUMBER_START } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   SQLite connection.

   One file for everything: Better Auth's tables (created by its own migration
   runner) and the MITS tables below. A single file keeps the self-hosted setup to
   "copy the data dir" and lets a ticket and its owner live in one transaction.
   ────────────────────────────────────────────────────────────────────────── */

declare global {
  // Next.js reloads modules in dev; without this the process would leak a file
  // handle per hot reload until SQLite refuses to open another one.
  var __mitsDb: Database.Database | undefined;
}

function open(): Database.Database {
  const db = new Database(join(dataDir(), "mits.db"));
  // WAL: readers never block the writer, which matters once the board polls.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrateAppTables(db);
  return db;
}

export const db: Database.Database = globalThis.__mitsDb ?? open();
if (process.env.NODE_ENV !== "production") globalThis.__mitsDb = db;

/**
 * Tables MITS owns. Better Auth's `user`/`session`/`account`/`verification` are
 * created separately by its migration runner — see `ensureAuthSchema`.
 *
 * No foreign key from ticket to user: the auth tables may not exist yet the first
 * time this runs, and an owner is never deleted while their tickets remain.
 */
function migrateAppTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS mits_setting (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mits_ticket (
      id             TEXT PRIMARY KEY,
      created_by     TEXT NOT NULL,
      created_by_email TEXT NOT NULL,
      source         TEXT NOT NULL,
      form_schema_id TEXT,
      title          TEXT NOT NULL,
      payload        TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'open',
      priority       TEXT NOT NULL DEFAULT 'normal',
      assigned_to    TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mits_ticket_created_by
      ON mits_ticket (created_by);
    CREATE INDEX IF NOT EXISTS idx_mits_ticket_created_at
      ON mits_ticket (created_at DESC);

    -- Uploaded attachments. The blob lives on disk under <data dir>/uploads;
    -- this row is the only thing that maps a public id to it, which is what
    -- makes an access check possible before the file is served.
    CREATE TABLE IF NOT EXISTS mits_upload (
      id            TEXT PRIMARY KEY,
      owner_id      TEXT NOT NULL,
      ticket_id     TEXT,
      original_name TEXT NOT NULL,
      stored_name   TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      size_bytes    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      -- 'ticket' (owner + staff) or 'faq' (any signed-in user). See addColumns
      -- for why the default is the narrower of the two.
      scope         TEXT NOT NULL DEFAULT 'ticket'
    );

    CREATE INDEX IF NOT EXISTS idx_mits_upload_owner
      ON mits_upload (owner_id);
    CREATE INDEX IF NOT EXISTS idx_mits_upload_ticket
      ON mits_upload (ticket_id);

    -- Form schemas created in the admin builder. The built-in schemas stay in
    -- code; a row here with the same id overrides one of them.
    CREATE TABLE IF NOT EXISTS mits_form_schema (
      id         TEXT PRIMARY KEY,
      definition TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    -- Branches / sites. Referenced by tickets, but without a foreign key: a
    -- location that gets deleted must not take its tickets with it.
    CREATE TABLE IF NOT EXISTS mits_location (
      id     TEXT PRIMARY KEY,
      name   TEXT NOT NULL,
      code   TEXT NOT NULL DEFAULT '',
      city   TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1
    );

    -- Replies and internal notes. The visibility column decides whether a row is
    -- ever shown to the reporter; the filter lives in lib/ticket-comments.ts.
    CREATE TABLE IF NOT EXISTS mits_ticket_comment (
      id              TEXT PRIMARY KEY,
      ticket_id       TEXT NOT NULL,
      author_id       TEXT NOT NULL,
      author_email    TEXT NOT NULL,
      author_name     TEXT NOT NULL,
      author_is_agent INTEGER NOT NULL DEFAULT 0,
      visibility      TEXT NOT NULL DEFAULT 'public',
      body            TEXT NOT NULL,
      created_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mits_comment_ticket
      ON mits_ticket_comment (ticket_id, created_at);

    -- Last sign of life per user. One row per user, overwritten in place — this
    -- is a presence indicator, not an audit trail.
    CREATE TABLE IF NOT EXISTS mits_presence (
      user_id   TEXT PRIMARY KEY,
      seen_at   TEXT NOT NULL
    );

    -- Ticket relations. One row per pair, in the direction the agent stated;
    -- the opposite reading is derived. Two rows would be two places for one fact.
    CREATE TABLE IF NOT EXISTS mits_ticket_link (
      id          TEXT PRIMARY KEY,
      from_ticket TEXT NOT NULL,
      to_ticket   TEXT NOT NULL,
      kind        TEXT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    -- One relation per pair regardless of direction, so A->B and B->A cannot both
    -- exist. The pair is normalised on insert (see lib/ticket-links.ts), which is
    -- what makes a two-column unique index sufficient.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mits_link_pair
      ON mits_ticket_link (from_ticket, to_ticket);
    CREATE INDEX IF NOT EXISTS idx_mits_link_to
      ON mits_ticket_link (to_ticket);
  `);

  addColumns(database);
  backfillTicketNumbers(database);
  renamePriorities(database);
}

/**
 * Rename `normal` to `medium` and `urgent` to `critical`.
 *
 * Priority lives in four places, and missing one of them is a broken listing
 * rather than a cosmetic slip: `MITSTicketSchema.priority` is the enum, so an
 * unmigrated row throws on read.
 *
 *   1. the `mits_ticket.priority` column
 *   2. inside stored `payload` JSON — the quick-ticket form has its own priority
 *      field, so the answer is duplicated there
 *   3. built-in form schemas (in code, changed by hand)
 *   4. admin-authored schemas in `mits_form_schema`
 *
 * Idempotent: after the first run there is nothing left matching the old values.
 */
function renamePriorities(database: Database.Database): void {
  const pending = database
    .prepare(
      "SELECT COUNT(*) AS count FROM mits_ticket WHERE priority IN ('normal', 'urgent')",
    )
    .get() as { count: number };

  const schemasPending = database
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_form_schema
        WHERE definition LIKE '%"normal"%' OR definition LIKE '%"urgent"%'`,
    )
    .get() as { count: number };

  const payloadsPending = database
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket
        WHERE payload LIKE '%"priority":"normal"%'
           OR payload LIKE '%"priority":"urgent"%'`,
    )
    .get() as { count: number };

  if (
    pending.count === 0 &&
    schemasPending.count === 0 &&
    payloadsPending.count === 0
  ) {
    return;
  }

  database.transaction(() => {
    database
      .prepare("UPDATE mits_ticket SET priority = 'medium' WHERE priority = 'normal'")
      .run();
    database
      .prepare("UPDATE mits_ticket SET priority = 'critical' WHERE priority = 'urgent'")
      .run();

    // String replacement on the JSON rather than parse-and-rewrite: the keys are
    // known and quoted, so a targeted replace cannot touch a value that merely
    // contains the word.
    database
      .prepare(
        `UPDATE mits_ticket
            SET payload = replace(
                  replace(payload, '"priority":"normal"', '"priority":"medium"'),
                  '"priority":"urgent"', '"priority":"critical"')
          WHERE payload LIKE '%"priority":"normal"%'
             OR payload LIKE '%"priority":"urgent"%'`,
      )
      .run();

    // Admin-authored schemas copy the priority enum, so their stored definition
    // still offers the old values until it is rewritten too.
    database
      .prepare(
        `UPDATE mits_form_schema
            SET definition = replace(
                  replace(definition, '"normal"', '"medium"'),
                  '"urgent"', '"critical"')
          WHERE definition LIKE '%"normal"%' OR definition LIKE '%"urgent"%'`,
      )
      .run();
  })();

  console.info(
    `[MITS] Prioritäten umbenannt: ${pending.count} Ticket(s), ${payloadsPending.count} Payload(s), ${schemasPending.count} Schema(ta).`,
  );
}

/**
 * Columns added after the table already shipped.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and `ALTER TABLE` on an existing
 * column throws rather than being a no-op, so the current columns are read first.
 * Cheaper than a version table and it stays correct if someone restores an older
 * database.
 */
function addColumns(database: Database.Database): void {
  const additions: { table: string; column: string; definition: string }[] = [
    { table: "mits_ticket", column: "ticket_number", definition: "INTEGER" },
    { table: "mits_ticket", column: "location_id", definition: "TEXT" },
    /*
     * What an upload is for, and therefore who may read it.
     *
     * `ticket` keeps the original rule — owner plus staff. `faq` is readable by
     * anyone signed in, because a help article whose screenshots only the author
     * can open is not a help article.
     *
     * Defaulted to `ticket`, so every row written before this column keeps the
     * narrower rule. That direction matters: the opposite default would publish
     * every existing ticket attachment to every user on the first start after an
     * update, and nothing about the running system would look different.
     */
    {
      table: "mits_upload",
      column: "scope",
      definition: "TEXT NOT NULL DEFAULT 'ticket'",
    },
  ];

  for (const { table, column, definition } of additions) {
    const existing = database
      .prepare(`PRAGMA table_info(${table})`)
      .all() as { name: string }[];
    if (existing.some((info) => info.name === column)) continue;
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  // Unique rather than a plain index: two tickets sharing a number would make
  // the search-by-number jump ambiguous. Created after the backfill would risk
  // failing, so it is created here and the backfill assigns distinct values.
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mits_ticket_number
       ON mits_ticket (ticket_number) WHERE ticket_number IS NOT NULL`,
  );
}

/**
 * Give tickets written before the column existed a number, oldest first, so the
 * sequence matches the order they were actually reported.
 */
function backfillTicketNumbers(database: Database.Database): void {
  const pending = database
    .prepare(
      `SELECT id FROM mits_ticket
        WHERE ticket_number IS NULL
        ORDER BY created_at ASC, id ASC`,
    )
    .all() as { id: string }[];

  if (pending.length === 0) return;

  const highest = database
    .prepare("SELECT MAX(ticket_number) AS n FROM mits_ticket")
    .get() as { n: number | null };

  let next = Math.max(highest.n ?? 0, TICKET_NUMBER_START - 1) + 1;
  const update = database.prepare(
    "UPDATE mits_ticket SET ticket_number = ? WHERE id = ?",
  );

  database.transaction(() => {
    for (const row of pending) update.run(next++, row.id);
  })();
}

/**
 * Allocate the next ticket number.
 *
 * `MAX + 1` inside the caller's transaction rather than AUTOINCREMENT: `id` is
 * already a TEXT primary key, and better-sqlite3 is synchronous with a single
 * writer, so nothing can interleave between the read and the insert.
 */
export function nextTicketNumber(): number {
  const row = db
    .prepare("SELECT MAX(ticket_number) AS n FROM mits_ticket")
    .get() as { n: number | null };
  return Math.max(row.n ?? 0, TICKET_NUMBER_START - 1) + 1;
}
