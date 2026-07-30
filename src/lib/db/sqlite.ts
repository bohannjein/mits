import "server-only";

import Database from "better-sqlite3";
import { join } from "node:path";

import { dataDir } from "@/lib/auth/secret";

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
      created_at    TEXT NOT NULL
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
  `);
}
