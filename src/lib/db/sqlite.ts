import "server-only";

import Database from "better-sqlite3";
import { join } from "node:path";

import { dataDir } from "@/lib/auth/secret";
import { INVENTORY_NUMBER_START, TICKET_NUMBER_START } from "@/types/mits";

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
      -- 'text' or 'html'. Defaults to the safe one: see addColumns.
      body_format     TEXT NOT NULL DEFAULT 'text',
      created_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mits_comment_ticket
      ON mits_ticket_comment (ticket_id, created_at);

    -- Contact details a reporter maintains themselves. One row per user, created
    -- on first save. No foreign key to the user table, matching every other table
    -- here: the auth tables may not exist yet the first time this runs.
    -- (No backticks in this comment on purpose — the whole block is a template
    --  literal, and one would end it.)
    CREATE TABLE IF NOT EXISTS mits_user_profile (
      user_id     TEXT PRIMARY KEY,
      location_id TEXT,
      phone       TEXT NOT NULL DEFAULT '',
      street      TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '',
      city        TEXT NOT NULL DEFAULT '',
      country     TEXT NOT NULL DEFAULT '',
      website     TEXT NOT NULL DEFAULT '',
      note        TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL
    );

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

    -- Immutable change history per ticket. Append only: nothing in the application
    -- issues an UPDATE or a DELETE against this table, which is the whole point of
    -- keeping it separate from the rows it describes.
    CREATE TABLE IF NOT EXISTS mits_audit_log (
      id          TEXT PRIMARY KEY,
      ticket_id   TEXT NOT NULL,
      actor_id    TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      action      TEXT NOT NULL,
      field       TEXT NOT NULL DEFAULT '',
      old_value   TEXT NOT NULL DEFAULT '',
      new_value   TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mits_audit_ticket
      ON mits_audit_log (ticket_id, created_at);

    -- The company an asset belongs to and a reporter works for. Not a site: see the
    -- comment on MITSOrganizationSchema for why the two are separate tables.
    CREATE TABLE IF NOT EXISTS mits_organization (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      code            TEXT NOT NULL DEFAULT '',
      domain          TEXT NOT NULL DEFAULT '',
      customer_number TEXT NOT NULL DEFAULT '',
      street          TEXT NOT NULL DEFAULT '',
      postal_code     TEXT NOT NULL DEFAULT '',
      city            TEXT NOT NULL DEFAULT '',
      country         TEXT NOT NULL DEFAULT '',
      phone           TEXT NOT NULL DEFAULT '',
      website         TEXT NOT NULL DEFAULT '',
      note            TEXT NOT NULL DEFAULT '',
      active          INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    -- One table for every kind of asset. What differs per kind lives in the
    -- attributes JSON, so a new asset kind needs no migration.
    --
    -- deleted_at, like the ticket table: an asset removed by mistake takes its
    -- history and its ticket references with it, and those are the reason the row
    -- existed. Every read filters on deleted_at IS NULL.
    CREATE TABLE IF NOT EXISTS mits_configuration_item (
      id               TEXT PRIMARY KEY,
      -- The number MITS assigns: INV-10000001 on the way out. Nullable because the
      -- migration for older databases backfills it; a fresh row always gets one.
      inventory_number INTEGER,
      -- Somebody else's number: a vendor sticker, a label from an older system.
      asset_tag        TEXT NOT NULL DEFAULT '',
      name             TEXT NOT NULL,
      type             TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active',
      organization_id  TEXT,
      location_id      TEXT,
      assigned_user_id TEXT,
      manufacturer     TEXT NOT NULL DEFAULT '',
      model            TEXT NOT NULL DEFAULT '',
      serial_number    TEXT NOT NULL DEFAULT '',
      purchased_on     TEXT NOT NULL DEFAULT '',
      warranty_until   TEXT NOT NULL DEFAULT '',
      seats_total      INTEGER NOT NULL DEFAULT 0,
      expires_at       TEXT NOT NULL DEFAULT '',
      note             TEXT NOT NULL DEFAULT '',
      attributes       TEXT NOT NULL DEFAULT '{}',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      deleted_at       TEXT
    );

    -- An inventory number is unique where it is written down, so it is unique here.
    -- Partial index: an item may have no tag, and several untagged items must not
    -- collide with each other on the empty string.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mits_ci_asset_tag
      ON mits_configuration_item (asset_tag)
      WHERE asset_tag <> '' AND deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_mits_ci_type
      ON mits_configuration_item (type, status);
    CREATE INDEX IF NOT EXISTS idx_mits_ci_assigned
      ON mits_configuration_item (assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_mits_ci_organization
      ON mits_configuration_item (organization_id);

    -- Directional, inverse derived on read. One row per stated relation.
    CREATE TABLE IF NOT EXISTS mits_ci_relation (
      id         TEXT PRIMARY KEY,
      from_ci    TEXT NOT NULL,
      to_ci      TEXT NOT NULL,
      kind       TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- The kind is part of the key, unlike ticket links: a switch can sensibly be both
    -- part of a rack and connected to a router, so only the same statement twice is
    -- the duplicate. The reverse of the same kind is rejected in lib/cmdb.ts.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mits_ci_relation_triple
      ON mits_ci_relation (from_ci, to_ci, kind);
    CREATE INDEX IF NOT EXISTS idx_mits_ci_relation_to
      ON mits_ci_relation (to_ci);

    -- Which assets a ticket is about. No id column: the pair is the fact, and a
    -- composite key makes a double insert impossible rather than merely unlikely.
    CREATE TABLE IF NOT EXISTS mits_ticket_ci (
      ticket_id  TEXT NOT NULL,
      ci_id      TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (ticket_id, ci_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mits_ticket_ci_item
      ON mits_ticket_ci (ci_id);

    -- When each user last looked at each ticket. The pair is the key, so a second
    -- visit overwrites rather than appends — this is a bookmark, not a history.
    --
    -- Read state is stored, unread is derived: a stored boolean would have to be
    -- flipped back to true by every writer of every comment for every other user,
    -- and the first writer that forgets leaves a ticket that never announces
    -- itself again. Comparing two timestamps cannot fall out of step.
    CREATE TABLE IF NOT EXISTS mits_ticket_read (
      user_id   TEXT NOT NULL,
      ticket_id TEXT NOT NULL,
      seen_at   TEXT NOT NULL,
      PRIMARY KEY (user_id, ticket_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mits_ticket_read_ticket
      ON mits_ticket_read (ticket_id);

    -- Logged work. Append-only from the application's side: an entry is added or
    -- deleted, never edited, so a corrected figure is visibly a correction.
    --
    -- Minutes as an integer rather than hours as a float. "1.5 Std" is what people
    -- type and "90" is what has to be summed; storing the typed form would put the
    -- rounding somewhere different in every report that adds it up.
    CREATE TABLE IF NOT EXISTS mits_ticket_worklog (
      id           TEXT PRIMARY KEY,
      ticket_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      user_name    TEXT NOT NULL,
      minutes      INTEGER NOT NULL,
      note         TEXT NOT NULL DEFAULT '',
      -- When the work happened, which is not when the row was written: an entry
      -- filed on Monday for Friday's callout has to report Friday.
      performed_at TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mits_worklog_ticket
      ON mits_ticket_worklog (ticket_id, performed_at);
    CREATE INDEX IF NOT EXISTS idx_mits_worklog_user
      ON mits_ticket_worklog (user_id);

    -- The answers to the agent checklist, one row per step that has one.
    --
    -- The *steps* are not here: they live in the ticket type's schema, where an
    -- admin edits them once for every ticket of that type. This table holds only
    -- what somebody answered, keyed on the step's id — so a renamed label keeps its
    -- answers, and a step deleted from the schema takes nothing with it. Its rows
    -- simply stop being read; nothing joins on a definition that has to exist.
    --
    -- user_name is denormalised beside the id, exactly like the comment and
    -- worklog tables: the panel says who did it, and a deleted account must not
    -- turn the record of the work into a blank. (No backticks in here — this whole
    -- block is a template literal, and one would end it mid-statement.)
    CREATE TABLE IF NOT EXISTS mits_ticket_checklist (
      ticket_id  TEXT NOT NULL,
      item_id    TEXT NOT NULL,
      value      TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      user_name  TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (ticket_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mits_checklist_ticket
      ON mits_ticket_checklist (ticket_id);
  `);

  addColumns(database);
  backfillTicketNumbers(database);
  backfillInventoryNumbers(database);
  renamePriorities(database);
  renameAgentRole(database);
}

/**
 * Rename the role `technician` to `agent`.
 *
 * Guarded by a table check rather than run unconditionally: Better Auth owns `user`
 * and creates it with its own migration runner, so on a fresh instance this function
 * runs *before* the table exists. An UPDATE against a missing table throws, and this
 * one sits in the connection's open path — it would take the whole app down on first
 * start rather than fail quietly.
 *
 * Sessions are not touched. Better Auth caches the role in a signed cookie for 60
 * seconds, so an agent who was signed in across the update keeps the old value until
 * it expires; `toRole` maps it, which is why that mapping is not redundant with this
 * migration. See `LEGACY_ROLES` in `lib/auth/roles.ts`.
 */
function renameAgentRole(database: Database.Database): void {
  const hasUserTable = database
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'user'",
    )
    .get() as { count: number };
  if (hasUserTable.count === 0) return;

  const columns = database.prepare("PRAGMA table_info(user)").all() as {
    name: string;
  }[];
  if (!columns.some((info) => info.name === "role")) return;

  const pending = database
    .prepare("SELECT COUNT(*) AS count FROM user WHERE role = 'technician'")
    .get() as { count: number };
  if (pending.count === 0) return;

  database
    .prepare("UPDATE user SET role = 'agent' WHERE role = 'technician'")
    .run();

  console.info(
    `[MITS] Rolle technician → agent: ${pending.count} Konto/Konten.`,
  );
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
    /*
     * Whether `body` is plain text or sanitised HTML.
     *
     * Defaults to `text`, which is the safe direction: every comment written before
     * the rich-text editor existed is plain text, and rendering it as markup would
     * turn a reporter's literal `<b>` into formatting — or worse, hand an old body
     * to `dangerouslySetInnerHTML` without ever having passed the sanitiser.
     */
    {
      table: "mits_ticket_comment",
      column: "body_format",
      definition: "TEXT NOT NULL DEFAULT 'text'",
    },
    /*
     * Soft delete. NULL means alive; a timestamp means somebody removed it and it is
     * to be excluded from every read.
     *
     * Nullable with no default on purpose — the alternative would be a boolean, and a
     * boolean cannot answer "when", which is what a restore view and a retention
     * policy both need. Every existing row gets NULL, which is correct: nothing was
     * deleted before the column existed.
     */
    { table: "mits_ticket", column: "deleted_at", definition: "TEXT" },
    { table: "mits_ticket_comment", column: "deleted_at", definition: "TEXT" },
    /*
     * When a comment was last edited. NULL means never, which is what every
     * row written before editing existed correctly reports — the alternative,
     * defaulting it to `created_at`, would mark the entire history as edited.
     */
    { table: "mits_ticket_comment", column: "edited_at", definition: "TEXT" },
    { table: "mits_upload", column: "deleted_at", definition: "TEXT" },
    /*
     * Which company a reporter belongs to.
     *
     * On the profile row rather than on the account: the account is the login identity
     * and Better Auth owns that table. NULL for everyone until an admin or the
     * importer assigns it — deriving it from the mail domain on read would move a
     * customer's whole asset list the day they change provider.
     */
    { table: "mits_user_profile", column: "organization_id", definition: "TEXT" },
    /*
     * Which backend holds this blob.
     *
     * Defaulted to `disk`, and that default is load-bearing rather than a
     * formality: every row written before S3 existed has its bytes in
     * `<data dir>/uploads`, and they stay there after somebody switches the
     * instance to a bucket. Deciding the backend from the current setting on read
     * would 404 the whole existing archive at the moment of the switch, with a
     * settings page reporting a successful save.
     */
    {
      table: "mits_upload",
      column: "storage",
      definition: "TEXT NOT NULL DEFAULT 'disk'",
    },
    /*
     * Hex SHA-256 of the bytes. Empty for rows written before it was recorded —
     * not backfilled, because computing it would mean reading every blob on the
     * first start after an update, and an empty checksum is honestly "unknown"
     * rather than a wrong value.
     */
    {
      table: "mits_upload",
      column: "checksum",
      definition: "TEXT NOT NULL DEFAULT ''",
    },
    /*
     * Topic labels, as a JSON array.
     *
     * A column rather than a `mits_ticket_tag` table: one to three short strings
     * that are displayed and never joined on. A table would buy filtering, which
     * nothing asks for, at the cost of a migration and a second write per ticket.
     */
    {
      table: "mits_ticket",
      column: "tags",
      definition: "TEXT NOT NULL DEFAULT '[]'",
    },
    /*
     * This ticket is an outage rather than a report of one.
     *
     * A flag rather than "has children": a major incident is *declared*, and it
     * stays one while it is worked even if its last child is unlinked. Deriving it
     * would also make the clustering query — which must exclude major incidents
     * from its candidates — depend on a join it otherwise does not need.
     */
    {
      table: "mits_ticket",
      column: "major_incident",
      definition: "INTEGER NOT NULL DEFAULT 0",
    },
    /*
     * The number MITS gives an inventory object — `INV-10000001` on the way out.
     *
     * Nullable rather than `NOT NULL DEFAULT 0`, and that is what makes the
     * backfill possible: NULL means "not numbered yet" and is skipped by the
     * unique index, while a table full of zeros would collide on the second row.
     */
    {
      table: "mits_configuration_item",
      column: "inventory_number",
      definition: "INTEGER",
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

  /*
   * Same guarantee for the inventory number, and for the same reason: a number
   * that appears twice is a label on two things, which is the one property an
   * inventory number has to have. Here rather than in the CREATE TABLE block, so
   * it also lands on a database that predates the column.
   *
   * A soft-deleted object keeps its number — no `deleted_at IS NULL` in the
   * predicate. Handing a removed object's number to the next one would make an old
   * label point at something else, and the deletion is reversible.
   */
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mits_ci_inventory_number
       ON mits_configuration_item (inventory_number)
       WHERE inventory_number IS NOT NULL`,
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

/**
 * Give inventory objects written before the column existed a number, oldest first.
 *
 * Same shape as the ticket backfill and for the same reason: the sequence should
 * follow the order things were actually recorded, not the order SQLite happens to
 * return rows in.
 *
 * Soft-deleted objects are numbered too. They can be restored, and a restored
 * object without a number would be the only one on the instance that cannot be
 * labelled.
 */
function backfillInventoryNumbers(database: Database.Database): void {
  const pending = database
    .prepare(
      `SELECT id FROM mits_configuration_item
        WHERE inventory_number IS NULL
        ORDER BY created_at ASC, id ASC`,
    )
    .all() as { id: string }[];

  if (pending.length === 0) return;

  const highest = database
    .prepare("SELECT MAX(inventory_number) AS n FROM mits_configuration_item")
    .get() as { n: number | null };

  let next = Math.max(highest.n ?? 0, INVENTORY_NUMBER_START - 1) + 1;
  const update = database.prepare(
    "UPDATE mits_configuration_item SET inventory_number = ? WHERE id = ?",
  );

  database.transaction(() => {
    for (const row of pending) update.run(next++, row.id);
  })();

  console.warn(`[MITS] Inventarnummern nachgetragen: ${pending.length} Objekt(e).`);
}

/**
 * Allocate the next inventory number.
 *
 * `MAX + 1`, called inside the caller's transaction — see `nextTicketNumber` for
 * why that is enough. `MAX` ignores nothing: a soft-deleted object still holds its
 * number, so the counter never walks back over a label that exists on a shelf
 * somewhere.
 */
export function nextInventoryNumber(): number {
  const row = db
    .prepare("SELECT MAX(inventory_number) AS n FROM mits_configuration_item")
    .get() as { n: number | null };
  return Math.max(row.n ?? 0, INVENTORY_NUMBER_START - 1) + 1;
}
