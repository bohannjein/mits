/**
 * Exercises every write path against a throwaway database.
 *
 * `verify-forms.mts` covers the pure functions. This covers the thing it cannot:
 * the contract between a SQL statement and the object bound to it, which is a
 * string on one side and a type on the other. Nothing checks that they agree —
 * and better-sqlite3 does not shrug at a mismatch, it throws.
 *
 * That is not hypothetical. Adding `edited_at` to the comment row without adding
 * the column to its `INSERT` turned **every message send** into a 500, and
 * `npm run typecheck`, `npm test` and `npm run build` were all green while it did.
 * A test that merely calls each writer once would have caught it in a second.
 *
 * So: call each one, with realistic input, against an empty database. No
 * assertions about behaviour — that is the other file's job. This one asks the
 * only question a type checker cannot: does it run at all.
 *
 * `MITS_DATA_DIR` is pointed at a fresh temp directory and removed afterwards, so
 * this never touches the real `mits.db`. It has to be set before anything imports
 * the database module, which is why every import below is dynamic.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "mits-verify-db-"));
process.env.MITS_DATA_DIR = dataDir;
// The seeder writes an admin on first import; irrelevant here and slow.
process.env.MITS_SKIP_SEED = "1";

let failures = 0;

function check(name: string, fn: () => unknown): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${name}\n         ${message}`);
  }
}

try {
  const mits = await import("../src/types/mits");
  const locations = await import("../src/lib/locations");
  const organizations = await import("../src/lib/organizations");
  const settings = await import("../src/lib/settings");
  const system = await import("../src/lib/system-settings");
  const features = await import("../src/lib/features");
  const notificationSettings = await import("../src/lib/notification-settings");
  const canned = await import("../src/lib/canned-responses");
  const macros = await import("../src/lib/macros");
  const portal = await import("../src/lib/portal");
  const cmdb = await import("../src/lib/cmdb");
  const tickets = await import("../src/lib/tickets");
  const comments = await import("../src/lib/ticket-comments");
  const worklogs = await import("../src/lib/worklogs");
  const audit = await import("../src/lib/audit");
  const ai = await import("../src/lib/ai-settings");
  const realtime = await import("../src/lib/services/realtime");
  const db = (await import("../src/lib/db/sqlite")).db;

  /*
   * Better Auth owns the `user` table and creates it through its own migrator,
   * which normally runs on the first request. Nothing here makes a request, so
   * it is run explicitly — and running the real one rather than hand-writing a
   * `CREATE TABLE` is the point: the columns the ticket code joins against are
   * then the columns production has.
   */
  const { ensureAuthSchema } = await import("../src/lib/auth/server");
  await ensureAuthSchema();

  /*
   * Two accounts, written straight into the table.
   *
   * Going through the auth library would pull in a request context this script
   * does not have. The columns are what the ticket code joins against, and that
   * is all these rows are for.
   */
  const insertUser = db.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  const agentId = randomUUID();
  const reporterId = randomUUID();
  insertUser.run(agentId, "Bea Schulz", "bea@firma.de", now, now, "agent");
  insertUser.run(reporterId, "Anna Meier", "anna@firma.de", now, now, "user");

  const agent = {
    id: agentId,
    name: "Bea Schulz",
    email: "bea@firma.de",
    role: "agent" as const,
    emailVerified: false,
    mustChangePassword: false,
  };
  const reporter = {
    id: reporterId,
    name: "Anna Meier",
    email: "anna@firma.de",
    role: "user" as const,
    emailVerified: false,
    mustChangePassword: false,
  };

  console.log("locations");
  const locationId = randomUUID();
  check("create", () =>
    locations.replaceLocations([
      { id: locationId, name: "Hamburg", code: "HH", city: "Hamburg", active: true },
    ]),
  );
  check("update in place", () =>
    locations.replaceLocations([
      { id: locationId, name: "Hamburg Nord", code: "HH", city: "Hamburg", active: false },
    ]),
  );
  check("read back", () => {
    const rows = locations.listLocations();
    if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
    if (rows[0].name !== "Hamburg Nord") throw new Error("update did not stick");
  });
  check("add a second", () =>
    locations.replaceLocations([
      { id: locationId, name: "Hamburg Nord", code: "HH", city: "Hamburg", active: false },
      { id: randomUUID(), name: "Berlin", code: "B", city: "Berlin", active: true },
    ]),
  );
  check("remove all", () => locations.replaceLocations([]));

  /*
   * Fixtures are built by parsing a minimal object through the real schema.
   *
   * Hand-written literals would be exactly the drift this file exists to catch:
   * they go stale the moment a schema gains a field, and the failure is a
   * compile error in the test rather than a finding about the product. Parsing
   * fills every default and still fails loudly if something *required* appears.
   */
  console.log("organizations");
  const orgId = randomUUID();
  check("save", () =>
    organizations.saveOrganization(
      mits.MITSOrganizationSchema.parse({ id: orgId, name: "Weller" }),
    ),
  );
  check("update", () =>
    organizations.saveOrganization(
      mits.MITSOrganizationSchema.parse({
        id: orgId,
        name: "Weller Gruppe",
        code: "WEL",
        note: "Notiz",
      }),
    ),
  );
  check("list", () => organizations.listOrganizations());
  check("delete", () => organizations.deleteOrganization(orgId));

  console.log("settings");
  check("registration policy", () =>
    settings.setAuthSettings({ registrationEnabled: true, allowedEmailDomains: ["firma.de"] }),
  );
  check("system", () =>
    system.setSystemSettings({
      timezone: "Europe/Berlin",
      ntpHost: "pool.ntp.org",
      refreshMinutes: 3,
    }),
  );
  check("feature flags", () => features.setFeatureFlags(mits.DEFAULT_FEATURE_FLAGS));
  check("notifications", () =>
    notificationSettings.setNotificationSettings(mits.DEFAULT_NOTIFICATION_SETTINGS),
  );
  check("ai", () => ai.setAISettings(mits.DEFAULT_AI_SETTINGS));
  check("portal content", () =>
    portal.setPortalContent({ announcements: [], resources: [] }),
  );

  console.log("canned responses and macros");
  const cannedId = randomUUID();
  check("canned responses", () =>
    canned.setCannedResponses([
      {
        id: cannedId,
        title: "Begrüßung",
        body: "Hallo {{kunde.vorname}}, dein Ticket {{ticket.id}} läuft.",
        category: "",
        order_index: 0,
      },
    ]),
  );
  check("macros", () =>
    macros.setMacros([
      mits.MacroSchema.parse({
        id: randomUUID(),
        title: "Schließen",
        set_status: "closed",
        canned_response_id: cannedId,
      }),
    ]),
  );

  console.log("cmdb");
  const siteId = randomUUID();
  locations.replaceLocations([
    { id: siteId, name: "Berlin", code: "B", city: "Berlin", active: true },
  ]);
  const ciId = randomUUID();
  check("save item", () =>
    cmdb.saveConfigurationItem(
      mits.MITSConfigurationItemSchema.omit({
        created_at: true,
        updated_at: true,
      }).parse({
        id: ciId,
        name: "Notebook 1",
        type: "hardware",
        asset_tag: "NB-1",
        serial_number: "SN-1",
        location_id: siteId,
        assigned_user_id: reporterId,
        attributes: { ram: "16 GB" },
      }),
    ),
  );
  check("update item", () =>
    cmdb.saveConfigurationItem(
      mits.MITSConfigurationItemSchema.omit({
        created_at: true,
        updated_at: true,
      }).parse({
        id: ciId,
        name: "Notebook 1a",
        type: "hardware",
        status: "repair",
        asset_tag: "NB-1",
        location_id: siteId,
        note: "in Reparatur",
      }),
    ),
  );
  check("list items", () => cmdb.listConfigurationItems());

  console.log("tickets");
  let ticketId = "";
  check("create", () => {
    const ticket = tickets.createTicket(
      mits.MITSTicketDraftSchema.parse({
        source: "legacy",
        form_schema_id: "quick-ticket",
        // The real field names and a description past the schema's minimum, so
        // this exercises `createTicket`'s validation rather than tripping it.
        payload: {
          title: "Drucker klemmt",
          description: "Papierstau in Etage 3, das Blatt reisst beim Ziehen.",
          category: "hardware",
        },
        location_id: siteId,
      }),
      reporter,
    );
    ticketId = ticket.id;
  });

  check("attach a CI", () => cmdb.attachCIToTicket(ticketId, ciId, agentId));
  check("suggest CIs", () => cmdb.suggestCIsForTicket(ticketId, reporterId, siteId));

  check("reporter comment", () =>
    comments.addComment(ticketId, reporter, "Ist immer noch kaputt.", "public"),
  );
  check("agent reply", () =>
    comments.addComment(ticketId, agent, "<p>Wir schauen.</p>", "public", "html"),
  );
  check("internal note", () =>
    comments.addComment(ticketId, agent, "Toner bestellt.", "internal"),
  );

  let commentId = "";
  check("list comments", () => {
    const rows = comments.listCommentsFor(ticketId, agent);
    if (rows.length !== 3) throw new Error(`expected 3, got ${rows.length}`);
    commentId = rows[0].id;
  });
  check("edit a comment", () =>
    comments.editComment(commentId, reporter, "Ist wirklich noch kaputt."),
  );
  check("retract a comment", () => comments.retractComment(commentId, reporter));
  check("activity fingerprint", () => {
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (!ticket) throw new Error("ticket vanished");
    return comments.ticketActivityFingerprint(ticket, agent);
  });

  check("assign", () => tickets.assignTicket(ticketId, agentId, agent));
  check("status", () => tickets.setTicketStatus(ticketId, "in_progress", agent));
  check("priority", () => tickets.setTicketPriority(ticketId, "high", agent));
  check("close", () => tickets.setTicketStatus(ticketId, "closed", agent));
  // The reopen path runs inside addComment and touches its own UPDATE + audit row.
  check("a reporter reply reopens it", () => {
    comments.addComment(ticketId, reporter, "Doch noch ein Problem.", "public");
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (ticket?.status !== "open") {
      throw new Error(`expected open, got ${ticket?.status}`);
    }
  });

  check("worklog", () =>
    worklogs.addWorklog(ticketId, agent, 30, "Vor Ort", new Date().toISOString().slice(0, 10)),
  );
  check("audit trail", () => audit.listAuditFor(ticketId));
  check("mark read", () => tickets.markTicketRead(ticketId, agentId));
  check("seen at", () => tickets.getTicketSeenAt(ticketId, agentId));
  check("queue fingerprint", () => tickets.queueFingerprint(agent));
  check("search by text", () => {
    const rows = tickets.searchTickets({ q: "Drucker" }, agent);
    if (rows.length !== 1) throw new Error(`expected 1 hit, got ${rows.length}`);
  });
  // The characters LIKE treats as wildcards, and the backslash that escapes them.
  // Each of these threw before the escaping in `ticketWhere` was fixed.
  check("search with a percent", () => tickets.searchTickets({ q: "50%" }, agent));
  check("search with an underscore", () => tickets.searchTickets({ q: "a_b" }, agent));
  check("search with a backslash", () => tickets.searchTickets({ q: "C:\temp" }, agent));
  check("a wildcard is literal", () => {
    // "%" must not match everything — if it did, the escaping is not happening.
    const rows = tickets.searchTickets({ q: "%" }, agent);
    if (rows.length !== 0) throw new Error(`% matched ${rows.length} rows`);
  });
  check("count", () => tickets.countSearchTickets({ q: "Drucker" }, agent));
  check("notifications feed", async () => {
    const feed = await import("../src/lib/notifications");
    return feed.listNotifications(agent, new Date(0).toISOString());
  });

  console.log("realtime");
  check("publish", () =>
    realtime.publish({ type: "queue", audience: "staff", actorId: agentId }),
  );
} finally {
  /*
   * Close before deleting, and do not fail on the delete.
   *
   * Windows refuses to unlink a file that is still open, and better-sqlite3 holds
   * the handle plus two WAL sidecars until it is told otherwise. A leftover temp
   * directory is worth nothing; a suite that reports a failure because of one
   * would be worth less than nothing.
   */
  try {
    const { db } = await import("../src/lib/db/sqlite");
    db.close();
  } catch {
    // Never opened, or already closed.
  }
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // The operating system will clear its own temp directory.
  }
}

console.log(failures === 0 ? "\nALL DB CHECKS PASSED" : `\n${failures} DB CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
