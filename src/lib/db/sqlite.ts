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

    -- Zugriffsprotokoll: Anmeldungen und Eingriffe an Konten.
    --
    -- Eine eigene Tabelle und nicht mits_audit_log, obwohl beide "Protokoll"
    -- heißen. Dort hängt jede Zeile an einem ticket_id NOT NULL und wird nur über
    -- listAuditFor(ticketId) gelesen — eine Anmeldung gehört zu keinem Ticket,
    -- und sie mit einer leeren Id hineinzuschreiben hieße, eine Tabelle mit zwei
    -- Bedeutungen zu haben, von denen die Hälfte der Leser nur eine kennt.
    --
    -- Ebenfalls append-only: kein UPDATE und kein DELETE in lib/auth-log.ts.
    --
    -- (Keine Backticks in diesem Block: der ganze SQL-Text steht in einem
    --  Template-Literal, ein Backtick im Kommentar beendet es mittendrin.)
    CREATE TABLE IF NOT EXISTS mits_auth_event (
      id          TEXT PRIMARY KEY,
      actor_id    TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      action      TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mits_auth_event_time
      ON mits_auth_event (created_at DESC);

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

    -- Named API keys for machine callers.
    --
    -- A table rather than the single shared token in mits_setting, because the
    -- question an admin actually has is "which system is still calling this" —
    -- and one secret shared by the monitoring, the inventory script and a
    -- half-forgotten integration cannot answer it, nor be revoked without
    -- breaking the other two.
    --
    -- Only the hash is stored. A key readable out of the database would be a
    -- second copy of a credential, and the whole point of showing it exactly
    -- once is that there is no second copy. key_prefix is the handle the UI
    -- shows instead; it is not secret and identifies nothing on its own.
    --
    -- last_used_at is nullable and means "never called". That is the column an
    -- admin looks at before deleting a key, so an invented default -- the
    -- creation time, say -- would make an unused key look alive.
    CREATE TABLE IF NOT EXISTS mits_api_key (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      key_prefix   TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      created_by   TEXT NOT NULL DEFAULT '',
      last_used_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mits_api_key_hash
      ON mits_api_key (key_hash);

    -- Ticket categories, two levels deep in practice and arbitrarily deep in the
    -- schema. A row with an empty parent is a root.
    --
    -- parent_id is NOT NULL with an empty-string default rather than nullable,
    -- and that is the whole reason the unique index below works. SQLite (like
    -- every SQL engine) treats NULLs as distinct in a unique index, so a
    -- UNIQUE (parent_id, name) over a nullable column would happily accept
    -- "Hardware" as a root twice — the one duplicate that matters, because the
    -- cascading filter then shows two identical entries and each carries half the
    -- tickets. The empty string is a value and collides with itself.
    --
    -- No self-referencing foreign key: '' is not a row, so the reference would
    -- fail for every root. Removing a subtree is replaceCategories' job, and
    -- mits_ticket.category_id is deliberately left dangling rather than taking
    -- tickets with it — the same rule mits_location follows.
    -- (No backticks anywhere in this block: the whole thing is a template
    --  literal, and one would end it mid-statement.)
    CREATE TABLE IF NOT EXISTS mits_ticket_category (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      parent_id   TEXT NOT NULL DEFAULT '',
      -- Lucide icon name, resolved at render time. Only read for roots: the
      -- intent tiles draw one per top-level category.
      icon        TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_mits_category_sibling
      ON mits_ticket_category (parent_id, name);
    CREATE INDEX IF NOT EXISTS idx_mits_category_parent
      ON mits_ticket_category (parent_id, order_index);

    -- Somebody's note to themselves about a ticket, with a time attached.
    --
    -- Per user, not per ticket: two agents on one ticket have two different
    -- reasons to look at it again, and a shared reminder would mean the first one
    -- to tick it off silences the other. That is also why user_id leads the
    -- index — every read is "what is due for *me*".
    --
    -- is_done rather than deleting the row: a reminder that fired and was
    -- acknowledged is the record that somebody dealt with it, and the widget's
    -- tick has to be undoable within the same render.
    CREATE TABLE IF NOT EXISTS mits_ticket_reminder (
      id         TEXT PRIMARY KEY,
      ticket_id  TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      due_at     TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      is_done    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- The shape of every read: mine, still open, soonest first.
    CREATE INDEX IF NOT EXISTS idx_mits_reminder_user
      ON mits_ticket_reminder (user_id, is_done, due_at);
    CREATE INDEX IF NOT EXISTS idx_mits_reminder_ticket
      ON mits_ticket_reminder (ticket_id, user_id);

    -- Tickets an agent wants to keep at the top of their queue.
    --
    -- The pair is the key, like mits_ticket_read above: pinning twice is the same
    -- state as pinning once, so the second write overwrites instead of appending.
    -- There is nothing else on the row — a pin has no attributes, it either is or
    -- is not. (No backticks in here — this whole block is a template literal.)
    --
    -- Per user, and that is the whole design. A shared pin would be one agent
    -- rearranging everybody else's queue, which is the difference between a
    -- bookmark and an escalation; the escalation already exists and is called
    -- priority.
    CREATE TABLE IF NOT EXISTS mits_ticket_pin (
      user_id    TEXT NOT NULL,
      ticket_id  TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, ticket_id)
    );

    -- Every read is "is this row pinned for me", which the primary key serves.
    -- This one is for the delete path when a ticket goes.
    CREATE INDEX IF NOT EXISTS idx_mits_ticket_pin_ticket
      ON mits_ticket_pin (ticket_id);
  `);

  addColumns(database);
  backfillTicketNumbers(database);
  backfillInventoryNumbers(database);
  renamePriorities(database);
  collapseStatuses(database);
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
 * Sechs Statuswerte auf drei.
 *
 * `in_progress` und `waiting_major` werden `open`, `resolved` wird `closed`. Die
 * Begründung steht an `TicketStatus` in `types/mits.ts`; hier steht, was der
 * Bestand davon merkt.
 *
 * **`waiting_major → open` verliert nichts.** Die `parent_of`-Verknüpfung zur
 * Hauptstörung ist eine eigene Zeile in `mits_ticket_link` und bleibt; der Status
 * war eine Kopie davon. `parkedChildren` filtert danach auf „noch nicht
 * abgeschlossen" statt auf den Statuswert, und die Anzeige leitet „Bekannte
 * Störung" aus derselben Verknüpfung ab.
 *
 * **Der Audit-Log wird ausdrücklich nicht angefasst.** `mits_audit_log` ist
 * append-only, und das ist der Sinn der Tabelle: sie sagt, was damals passiert
 * ist. Deshalb müssen die Analytics-Abfragen `IN ('closed', 'resolved')` dauerhaft
 * behalten — wer dort auf einen Wert vereinfacht, verliert jede Kennzahl über
 * Tickets, die vor dieser Umstellung geschlossen wurden, und das Fehlerbild ist
 * eine Statistik, die plausibel aussieht und zu klein ist.
 *
 * Makros bleiben ebenfalls stehen: `set_status` ist ein `z.string()` und wird erst
 * beim Anwenden geparst, wo `LEGACY_STATUS_MAP` greift.
 *
 * Exportiert, obwohl `openDatabase` der einzige echte Aufrufer ist: `test:db` ruft
 * sie mit von Hand geschriebenen Altwerten auf. Das ist die Prüfung, die einen
 * Bestand rettet — ein Ticket, das nach dem Update in keiner Liste steht, sieht
 * aus wie ein verlorenes Ticket.
 */
export function collapseStatuses(database: Database.Database): void {
  const pending = database
    .prepare(
      `SELECT COUNT(*) AS count FROM mits_ticket
        WHERE status IN ('in_progress', 'waiting_major', 'resolved')`,
    )
    .get() as { count: number };

  if (pending.count === 0) return;

  database.transaction(() => {
    database
      .prepare(
        `UPDATE mits_ticket SET status = 'open'
          WHERE status IN ('in_progress', 'waiting_major')`,
      )
      .run();
    database
      .prepare("UPDATE mits_ticket SET status = 'closed' WHERE status = 'resolved'")
      .run();
  })();

  console.info(
    `[MITS] Statuswerte zusammengelegt: ${pending.count} Ticket(s) auf offen/abgeschlossen.`,
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
     * Whether this reporter may see their whole company's tickets.
     *
     * Beside the organization and not in the role: it is not a rank in MITS —
     * an org admin has no agent powers and cannot open anything on /mits. It
     * widens exactly one list, and only within their own company.
     *
     * Default 0, so the flag can only ever be granted deliberately. A migration
     * that guessed it from, say, "first user of the company" would hand
     * somebody the department's ticket history on the strength of a sort order.
     */
    {
      table: "mits_user_profile",
      column: "is_org_admin",
      definition: "INTEGER NOT NULL DEFAULT 0",
    },
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
     * Addresses that get a copy of every outgoing mail on this ticket.
     *
     * A JSON array in one column, not a table. It is a short list read and
     * written whole, exactly once per ticket — a join table would be three
     * statements and a migration for something that has no attributes of its
     * own. The same call the canned responses make.
     *
     * Nullable rather than `NOT NULL DEFAULT '[]'`: NULL is honestly "nobody
     * ever set this", and the reader treats it as the empty list anyway.
     */
    { table: "mits_ticket", column: "cc_emails", definition: "TEXT" },
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
    /*
     * Which category this ticket belongs to — the leaf, not the root.
     *
     * Nullable, and NULL means "nobody has said": every ticket written before
     * categories existed is genuinely uncategorised, and the cascading filter has
     * to be able to distinguish that from "Hardware / unspecified". Guessing one
     * from the form schema's free-text `category` string on migration would file a
     * few thousand tickets under a name that merely looks similar.
     *
     * The leaf rather than the pair: a leaf implies its ancestors, and storing both
     * would be two columns that can disagree. `resolveCategoryPath` walks up.
     *
     * No foreign key, like `location_id`: deleting a category must not delete the
     * tickets that referenced it, and a ticket whose category is gone still opens.
     */
    { table: "mits_ticket", column: "category_id", definition: "TEXT" },
    /*
     * Wann der Status zuletzt gewechselt hat — die Uhr für beide Verfallsfristen.
     *
     * Nullable und **nicht** aus `created_at` abgeleitet. Die Ableitung wäre der
     * naheliegende Backfill und der teure Fehler: sie machte jedes seit Monaten
     * gelöste Ticket sofort überfällig, und der erste Cron-Lauf nach dem Update
     * schlösse den ganzen Bestand auf einmal — mit einer Mail je Ticket.
     * Stattdessen füllt `backfillStatusChangedAt` mit dem Zeitpunkt des Updates:
     * die Uhr beginnt beim Upgrade, nichts schließt rückwirkend.
     */
    { table: "mits_ticket", column: "status_changed_at", definition: "TEXT" },
    /*
     * Wann die Erinnerung an den Melder rausging. NULL heißt „noch nicht".
     *
     * Eine eigene Spalte und nicht „`status_changed_at` plus Frist": die zweite
     * Wartephase zählt **ab der Erinnerung**, nicht ab dem Statuswechsel. Ohne
     * den Stempel gäbe es keinen Zeitpunkt, ab dem sie läuft — und die Erinnerung
     * ginge bei jedem Lauf erneut raus.
     */
    { table: "mits_ticket", column: "waiting_reminder_at", definition: "TEXT" },
    /*
     * Der Schalter des Agenten: dieses eine Ticket schließt die Automatik nicht.
     *
     * Default 0, also „Automatik gilt". Die andere Richtung wäre sicherer und
     * wäre trotzdem falsch: ein Bestand, in dem jedes alte Ticket ausgenommen
     * ist, macht eine eingeschaltete Frist wirkungslos, und das Fehlerbild ist
     * eine Einstellung, die nichts tut.
     */
    {
      table: "mits_ticket",
      column: "auto_close_off",
      definition: "INTEGER NOT NULL DEFAULT 0",
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

  /*
   * Partial, on the rows the category filter actually selects. An uncategorised
   * ticket is never a match for `?category=`, so keeping the NULLs out of the
   * index costs nothing and keeps it small on an instance that never adopted
   * categories at all.
   */
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_mits_ticket_category
       ON mits_ticket (category_id) WHERE category_id IS NOT NULL`,
  );

  /*
   * Der Index, auf dem der Verfalls-Sweeper läuft: Status zuerst, weil er die
   * Menge auf ein paar Prozent des Bestands schneidet, die Uhr danach.
   */
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_mits_ticket_status_changed
       ON mits_ticket (status, status_changed_at)`,
  );

  backfillStatusChangedAt(database);
}

/**
 * Die Verfallsuhr auf „jetzt" stellen, einmal, für alles was sie noch nicht hat.
 *
 * Der Zeitpunkt des Upgrades und **nicht** `created_at`: mit dem Erstelldatum
 * wäre jedes ältere gelöste Ticket im selben Moment überfällig, und der erste
 * Lauf des Sweepers schlösse den Bestand in einem Rutsch — inklusive einer
 * Erinnerungsmail je wartendem Ticket, an echte Empfänger. Ein Ticket, das
 * wirklich seit einem Jahr gelöst ist, schließt damit einen Zyklus später als
 * mathematisch korrekt wäre. Das ist der billige Fehler von beiden.
 *
 * Kein `WHERE status IN (…)`: die Uhr gilt für jede Zeile, und ein Ticket, das
 * später einmal `resolved` wird, bekommt seinen Stempel ohnehin beim Wechsel.
 */
function backfillStatusChangedAt(database: Database.Database): void {
  const pending = database
    .prepare(
      "SELECT COUNT(*) AS count FROM mits_ticket WHERE status_changed_at IS NULL",
    )
    .get() as { count: number };

  if (pending.count === 0) return;

  database
    .prepare(
      "UPDATE mits_ticket SET status_changed_at = ? WHERE status_changed_at IS NULL",
    )
    .run(new Date().toISOString());

  console.info(
    `[MITS] Verfallsuhr gestellt: ${pending.count} Ticket(s) ab jetzt gerechnet.`,
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
