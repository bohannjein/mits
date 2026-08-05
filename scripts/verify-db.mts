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
  const ticketDisplay = await import("../src/lib/ticket-display");
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
  const ticketCategories = await import("../src/lib/ticket-categories");
  const triageRules = await import("../src/lib/triage-rules");
  const reminders = await import("../src/lib/ticket-reminders");
  const notifications = await import("../src/lib/notifications");
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
  check("ticket display", () => {
    ticketDisplay.setTicketDisplaySettings({ formDisplay: "panel" });
    const back = ticketDisplay.getTicketFormDisplay();
    if (back !== "panel") throw new Error(`read back ${back}`);
    // Left on the default, so the rest of the suite sees a fresh instance's value.
    return ticketDisplay.setTicketDisplaySettings(
      mits.DEFAULT_TICKET_DISPLAY_SETTINGS,
    );
  });
  check("ai", () => ai.setAISettings(mits.DEFAULT_AI_SETTINGS));
  check("portal content", () =>
    portal.setPortalContent({ announcements: [], resources: [] }),
  );

  console.log("canned responses and macros");
  const cannedId = randomUUID();
  check("canned responses", () =>
    canned.setCannedResponses([
      // Through the schema, not as a literal — the same rule the macro fixture
      // below already follows. A hand-written object goes stale the moment a
      // field is added, and reports it as a compile error in the test rather
      // than as a finding about the product.
      mits.CannedResponseSchema.parse({
        id: cannedId,
        title: "Begrüßung",
        body: "Hallo {{kunde.vorname}}, dein Ticket {{ticket.id}} läuft.",
      }),
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
  /*
   * The inventory number: assigned on insert, unchanged by an update.
   *
   * Both halves matter. Without the first, an object has no number and nothing on
   * screen says so; without the second, editing a note would silently renumber a
   * device whose sticker is already on a shelf.
   */
  check("item gets an inventory number", () => {
    const item = cmdb.getConfigurationItem(ciId);
    if (!item) throw new Error("Objekt nicht gefunden");
    if (item.inventory_number < 1) {
      throw new Error(`Nummer ist ${item.inventory_number}`);
    }
    if (mits.formatInventoryNumber(item.inventory_number) !== "INV-10000001") {
      throw new Error(mits.formatInventoryNumber(item.inventory_number));
    }
    return item.inventory_number;
  });
  check("a second item gets the next number", () => {
    const second = cmdb.saveConfigurationItem(
      mits.MITSConfigurationItemSchema.omit({
        created_at: true,
        updated_at: true,
      }).parse({ id: "", name: "Notebook 2", type: "hardware" }),
    );
    if (second.inventory_number !== 2) {
      throw new Error(`Nummer ist ${second.inventory_number}`);
    }
    // Updating it must not move the number on.
    const again = cmdb.saveConfigurationItem(
      mits.MITSConfigurationItemSchema.omit({
        created_at: true,
        updated_at: true,
      }).parse({ id: second.id, name: "Notebook 2b", type: "hardware" }),
    );
    if (again.inventory_number !== 2) {
      throw new Error(`nach dem Update ${again.inventory_number}`);
    }
    return again.inventory_number;
  });
  check("search finds an object by its number", () => {
    const hits = cmdb.listConfigurationItems({ q: "INV-10000001" });
    if (hits.length !== 1 || hits[0].id !== ciId) {
      throw new Error(`${hits.length} Treffer`);
    }
    return hits.length;
  });

  /*
   * Categories before tickets, so a ticket can actually be filed into one.
   *
   * The empty-string parent is the whole reason this section exists here rather
   * than beside the locations: the sibling-uniqueness index only works because
   * a root's parent is a value and not NULL, and that is a property of the
   * statement, which is what this suite tests.
   */
  console.log("ticket categories");
  const rootId = randomUUID();
  const childId = randomUUID();
  check("create a tree", () =>
    ticketCategories.replaceCategories([
      mits.MITSTicketCategorySchema.parse({
        id: rootId,
        name: "Hardware",
        icon: "Laptop",
      }),
      mits.MITSTicketCategorySchema.parse({
        id: childId,
        name: "Notebooks",
        parent_id: rootId,
      }),
    ]),
  );
  check("read the tree", () => {
    const tree = ticketCategories.listCategoryTree();
    if (tree.length !== 1) throw new Error(`expected 1 root, got ${tree.length}`);
    if (tree[0].children.length !== 1) throw new Error("child missing");
    return tree;
  });
  check("descendants include the root itself", () => {
    const ids = ticketCategories.descendantCategoryIds(rootId);
    if (!ids.includes(rootId) || !ids.includes(childId)) {
      throw new Error(JSON.stringify(ids));
    }
    return ids;
  });
  check("path reads root first", () => {
    const label = ticketCategories.categoryLabel(childId);
    if (label !== "Hardware / Notebooks") throw new Error(label);
    return label;
  });
  check("a deleted category has no path", () => {
    const label = ticketCategories.categoryLabel(randomUUID());
    if (label !== "") throw new Error(label);
    return label;
  });
  check("an orphan is refused", () => {
    try {
      ticketCategories.replaceCategories([
        mits.MITSTicketCategorySchema.parse({
          id: childId,
          name: "Notebooks",
          parent_id: randomUUID(),
        }),
      ]);
    } catch (error) {
      if (error instanceof ticketCategories.CategoryError) return "refused";
      throw error;
    }
    throw new Error("an orphan was accepted");
  });
  check("two roots with one name are refused", () => {
    try {
      ticketCategories.replaceCategories([
        mits.MITSTicketCategorySchema.parse({ id: randomUUID(), name: "Hardware" }),
        mits.MITSTicketCategorySchema.parse({ id: randomUUID(), name: "hardware" }),
      ]);
    } catch (error) {
      if (error instanceof ticketCategories.CategoryError) return "refused";
      throw error;
    }
    throw new Error("a duplicate sibling was accepted");
  });
  // Restore the tree the duplicate attempt above rolled back to nothing.
  check("restore the tree", () =>
    ticketCategories.replaceCategories([
      mits.MITSTicketCategorySchema.parse({ id: rootId, name: "Hardware" }),
      mits.MITSTicketCategorySchema.parse({
        id: childId,
        name: "Notebooks",
        parent_id: rootId,
      }),
    ]),
  );
  check("ticket counts", () => ticketCategories.ticketCountsByCategory());

  console.log("triage rules");
  check("save", () =>
    triageRules.setTriageRules([
      mits.TriageRuleSchema.parse({
        id: randomUUID(),
        title: "Notebooks",
        keywords: ["Notebook", "notebook", "akku"],
        category_id: childId,
        priority: "high",
      }),
    ]),
  );
  check("keywords are lower-cased and deduplicated", () => {
    const rows = triageRules.listTriageRules();
    if (rows.length !== 1) throw new Error(`expected 1, got ${rows.length}`);
    if (rows[0].keywords.join(",") !== "notebook,akku") {
      throw new Error(rows[0].keywords.join(","));
    }
    return rows;
  });
  check("a rule without keywords is dropped", () => {
    triageRules.setTriageRules([
      mits.TriageRuleSchema.parse({ id: randomUUID(), title: "Leer" }),
    ]);
    const rows = triageRules.listTriageRules();
    if (rows.length !== 0) throw new Error(`expected 0, got ${rows.length}`);
    return rows;
  });
  check("two rules with one name are refused", () => {
    try {
      triageRules.setTriageRules([
        mits.TriageRuleSchema.parse({
          id: randomUUID(),
          title: "Doppelt",
          keywords: ["a1"],
        }),
        mits.TriageRuleSchema.parse({
          id: randomUUID(),
          title: "doppelt",
          keywords: ["b1"],
        }),
      ]);
    } catch (error) {
      if (error instanceof triageRules.TriageRuleError) return "refused";
      throw error;
    }
    throw new Error("a duplicate title was accepted");
  });
  check("restore one rule", () =>
    triageRules.setTriageRules([
      mits.TriageRuleSchema.parse({
        id: randomUUID(),
        title: "Notebooks",
        keywords: ["notebook"],
        category_id: childId,
      }),
    ]),
  );

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
        // The reporter's own filing decision, which the create path checks against
        // the category table before storing. An id that does not exist is dropped
        // to null rather than stored as a reference no filter resolves.
        category_id: childId,
      }),
      reporter,
    );
    ticketId = ticket.id;
  });

  check("the category stuck", () => {
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (ticket?.category_id !== childId) {
      throw new Error(String(ticket?.category_id));
    }
    return ticket.category_id;
  });
  check("an unknown category is dropped, not stored", () => {
    const ticket = tickets.createTicket(
      mits.MITSTicketDraftSchema.parse({
        source: "legacy",
        form_schema_id: "quick-ticket",
        payload: {
          title: "Monitor flackert",
          description: "Der linke Monitor flackert seit heute Morgen dauerhaft.",
        },
        category_id: randomUUID(),
      }),
      // Filed by the agent, not the reporter: the free-text search check further
      // down asserts an exact hit count for the reporter's name, and a second
      // ticket of theirs would break an assertion that has nothing to do with
      // categories.
      agent,
    );
    if (ticket.category_id !== null) throw new Error(String(ticket.category_id));
    return ticket.category_id;
  });
  check("filter by the root finds the child's ticket", () => {
    const found = tickets.searchTickets({ categoryId: rootId }, agent);
    if (!found.some((entry) => entry.id === ticketId)) {
      throw new Error(`${found.length} rows, none of them ours`);
    }
    return found.length;
  });
  check("counting agrees with the listing", () =>
    tickets.countSearchTickets({ categoryId: rootId }, agent),
  );
  check("an unknown category matches nothing", () => {
    const n = tickets.countSearchTickets({ categoryId: randomUUID() }, agent);
    if (n !== 0) throw new Error(`expected 0, got ${n}`);
    return n;
  });
  check("re-route", () =>
    tickets.setTicketCategory(ticketId, rootId, agent),
  );
  check("re-route to nothing", () =>
    tickets.setTicketCategory(ticketId, null, agent),
  );
  check("re-route to an unknown category is refused", () => {
    try {
      tickets.setTicketCategory(ticketId, randomUUID(), agent);
    } catch (error) {
      if (error instanceof tickets.TicketUpdateError) return "refused";
      throw error;
    }
    throw new Error("an unknown category was accepted");
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

  check("cc list", () => {
    const saved = tickets.setTicketCc(
      ticketId,
      ["Chef@Firma.de", " chef@firma.de ", "kaputt", "kollege@firma.de"],
      agent,
    );
    // Lower-cased, deduped, and the entry without an @ dropped — the pure
    // `normalizeCcEmails` decides, this checks that the column round-trips it.
    if (saved.cc_emails.join(",") !== "chef@firma.de,kollege@firma.de") {
      throw new Error(saved.cc_emails.join(","));
    }
  });
  // The case the feature exists for: somebody files a ticket for a colleague and
  // puts them on the thread themselves.
  check("the reporter may add a participant to their own ticket", () => {
    const saved = tickets.setTicketCc(
      ticketId,
      ["chef@firma.de", "kollege@firma.de"],
      reporter,
    );
    if (saved.cc_emails.length !== 2) throw new Error(saved.cc_emails.join(","));
  });
  check("but not to somebody else's", () => {
    const foreign = tickets.createTicket(
      mits.MITSTicketDraftSchema.parse({
        source: "legacy",
        form_schema_id: "quick-ticket",
        payload: {
          title: "Fremdes Ticket",
          description: "Gehört jemand anderem, lang genug für das Schema.",
        },
        location_id: null,
      }),
      agent,
    );
    try {
      tickets.setTicketCc(foreign.id, ["fremd@firma.de"], reporter);
    } catch {
      return;
    }
    throw new Error("Melder durfte fremde Beteiligte setzen");
  });
  check("cc list cleared", () => {
    const saved = tickets.setTicketCc(ticketId, [], agent);
    if (saved.cc_emails.length !== 0) throw new Error("nicht geleert");
  });

  check("worklog", () =>
    worklogs.addWorklog(ticketId, agent, 30, "Vor Ort", new Date().toISOString().slice(0, 10)),
  );
  /*
   * The agent checklist. The steps come from a schema, the answers from their own
   * table, and the interesting part is the contract between them: an id the type
   * does not declare and a value its kind cannot hold are both refused, and every
   * accepted write leaves an audit row.
   */
  const checklist = await import("../src/lib/ticket-checklist");
  const listSchema = mits.parseFormSchema({
    id: "with-checklist",
    title: "Mit Checkliste",
    category: "Test",
    version: 1,
    schema: { type: "object", properties: { title: { type: "string" } } },
    checklist: [
      { id: "step-1", label: "Gerät geprüft" },
      { id: "step-2", label: "Ersatzteil vorhanden?", kind: "yesno" },
    ],
  });

  check("checklist starts unanswered", () => {
    const rows = checklist.checklistFor(ticketId, listSchema);
    if (rows.length !== 2) throw new Error(`${rows.length} Schritte`);
    if (rows.some((row) => row.value !== "")) throw new Error("schon beantwortet");
    return rows.length;
  });
  check("tick a step", () => {
    const rows = checklist.setChecklistValue(
      ticketId,
      listSchema,
      "step-1",
      "done",
      agent,
    );
    const first = rows.find((row) => row.id === "step-1");
    if (first?.value !== "done") throw new Error(`Wert ${first?.value}`);
    if (first.answeredBy !== agent.name) throw new Error(first.answeredBy);
    return first.value;
  });
  check("answer a yes/no step", () =>
    checklist.setChecklistValue(ticketId, listSchema, "step-2", "no", agent),
  );
  check("clear it again", () => {
    const rows = checklist.setChecklistValue(
      ticketId,
      listSchema,
      "step-1",
      "",
      agent,
    );
    const first = rows.find((row) => row.id === "step-1");
    if (first?.value !== "") throw new Error(`Wert ${first?.value}`);
    // Cleared means unattributed: the line under the step is about the answer that
    // stands, and there is none.
    if (first.answeredBy !== "") throw new Error(first.answeredBy);
    return "leer";
  });
  check("a value the kind cannot hold is refused", () => {
    try {
      checklist.setChecklistValue(ticketId, listSchema, "step-1", "yes", agent);
      throw new Error("wurde angenommen");
    } catch (error) {
      if (error instanceof checklist.ChecklistError) return "abgelehnt";
      throw error;
    }
  });
  check("a step the type does not declare is refused", () => {
    try {
      checklist.setChecklistValue(ticketId, listSchema, "step-99", "done", agent);
      throw new Error("wurde angenommen");
    } catch (error) {
      if (error instanceof checklist.ChecklistError) return "abgelehnt";
      throw error;
    }
  });
  check("a reporter cannot answer", () => {
    try {
      checklist.setChecklistValue(ticketId, listSchema, "step-1", "done", reporter);
      throw new Error("wurde angenommen");
    } catch (error) {
      if (error instanceof checklist.ChecklistError) return "abgelehnt";
      throw error;
    }
  });
  check("a ticket type without steps has no checklist", () => {
    const rows = checklist.checklistFor(ticketId, undefined);
    if (rows.length !== 0) throw new Error(`${rows.length} Schritte`);
    return 0;
  });

  check("audit trail", () => {
    const entries = audit.listAuditFor(ticketId);
    // Three accepted writes above, each one a row. The trail is the whole reason the
    // checklist exists, so an unlogged answer is a failed feature, not a detail.
    const ticks = entries.filter((entry) => entry.action === "checklist_set");
    if (ticks.length !== 3) throw new Error(`${ticks.length} Einträge`);
    return entries.length;
  });
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
  // The whole point of the wide search: a word that appears in the form answers
  // and nowhere in the title still finds the ticket.
  check("search reaches the payload", () => {
    const rows = tickets.searchTickets({ q: "Papierstau" }, agent);
    if (rows.length !== 1) throw new Error(`expected 1 hit, got ${rows.length}`);
  });
  check("search reaches the conversation", () => {
    const rows = tickets.searchTickets({ q: "Problem" }, agent);
    if (rows.length !== 1) throw new Error(`expected 1 hit, got ${rows.length}`);
  });
  check("a retracted message is not searchable", () => {
    // "kaputt" only ever existed in the comment the suite retracted above.
    const rows = tickets.searchTickets({ q: "kaputt" }, agent);
    if (rows.length !== 0) throw new Error("zurückgezogener Text gefunden");
  });
  // The reporter's name lives in the `user` table, which `countSearchTickets`
  // does not join — so this is also the check that the count still runs.
  check("search by reporter name", () => {
    const rows = tickets.searchTickets({ q: "Anna" }, agent);
    if (rows.length !== 1) throw new Error(`expected 1 hit, got ${rows.length}`);
    const total = tickets.countSearchTickets({ q: "Anna" }, agent);
    if (total !== 1) throw new Error(`count says ${total}`);
  });
  check("every word has to match somewhere", () => {
    // Title and payload, one word from each.
    const both = tickets.searchTickets({ q: "Drucker Papierstau" }, agent);
    if (both.length !== 1) throw new Error(`expected 1 hit, got ${both.length}`);
    const miss = tickets.searchTickets({ q: "Drucker Nordpol" }, agent);
    if (miss.length !== 0) throw new Error("ein Wort ohne Treffer zählte nicht");
  });
  check("a reporter does not search internal notes", () => {
    // "Toner" appears only in the internal note this suite wrote.
    const asAgent = tickets.searchTickets({ q: "Toner" }, agent);
    if (asAgent.length !== 1) throw new Error("Agent findet die Notiz nicht");
    const asReporter = tickets.searchTickets({ q: "Toner" }, reporter);
    if (asReporter.length !== 0) throw new Error("Melder findet die Notiz");
  });
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

  console.log("api keys");
  const apiKeys = await import("../src/lib/api-keys");
  let issued = "";
  let issuedId = "";
  check("create", () => {
    const { token, key } = apiKeys.createApiKey("Zabbix", "admin@firma.de");
    issued = token;
    issuedId = key.id;
    return key;
  });
  check("list", () => apiKeys.listApiKeys());
  // Writes `last_used_at`, which is the part with a statement to get wrong.
  check("verify touches last used", () => {
    if (!apiKeys.verifyApiKey(issued)) throw new Error("Key nicht erkannt");
    const row = apiKeys.listApiKeys().find((key) => key.id === issuedId);
    if (!row?.last_used_at) throw new Error("last_used_at nicht geschrieben");
    return row;
  });
  check("a wrong token is refused", () => {
    if (apiKeys.verifyApiKey("mits_live_nope")) {
      throw new Error("fremder Token akzeptiert");
    }
  });
  check("delete", () => apiKeys.deleteApiKey(issuedId));

  console.log("org admin view");
  const profile = await import("../src/lib/user-profile");
  // Its own company: the one above is deleted again by that section's own check.
  const companyId = randomUUID();
  organizations.saveOrganization(
    mits.MITSOrganizationSchema.parse({ id: companyId, name: "Nordwind" }),
  );
  check("assign company", () =>
    profile.setUserOrganization(reporterId, companyId, () => true),
  );
  check("grant", () => profile.setOrgAdmin(reporterId, true));
  check("read back", () => {
    if (!profile.isOrgAdmin(reporterId)) throw new Error("Flag nicht gesetzt");
  });
  // The subselect in `ticketWhere` — a join that dropped profile-less reporters
  // would show up here as an empty list rather than as an error.
  check("company scope", () =>
    tickets.searchTickets({ organizationId: companyId }, reporter),
  );
  check("count with company scope", () =>
    tickets.countSearchTickets({ organizationId: companyId }, reporter),
  );
  check("withdraw", () => profile.setOrgAdmin(reporterId, false));

  check("find item by serial", () => cmdb.findCIBySerial("SN-1"));

  /*
   * Last, because it empties the database this suite has been filling.
   *
   * The interesting part is not that DELETE works — it is that the order inside the
   * transaction survives `foreign_keys = ON` with real rows present. A ticket with
   * comments, worklogs, links, read marks, an audit trail and an attached object is
   * exactly the shape that makes a wrong order fail, and it exists at this point.
   */
  console.log("reminders");
  let reminderId = "";
  check("create", () => {
    const entry = reminders.createReminder(
      ticketId,
      agent,
      new Date(Date.now() + 60_000),
      "Beim Kunden nachfragen",
    );
    reminderId = entry.id;
  });
  check("a reminder on a foreign ticket is refused", () => {
    try {
      reminders.createReminder(
        randomUUID(),
        agent,
        new Date(Date.now() + 60_000),
        "",
      );
    } catch (error) {
      if (error instanceof reminders.ReminderError) return "refused";
      throw error;
    }
    throw new Error("a reminder was created on a ticket that does not exist");
  });
  check("list for the ticket", () => {
    const rows = reminders.listRemindersForTicket(ticketId, agentId);
    if (rows.length !== 1) throw new Error(`expected 1, got ${rows.length}`);
    return rows;
  });
  check("the next one is the badge's", () => {
    const next = reminders.nextReminderFor(ticketId, agentId);
    if (next?.id !== reminderId) throw new Error(String(next?.id));
    return next.id;
  });
  check("somebody else sees none of it", () => {
    const rows = reminders.listRemindersForTicket(ticketId, reporterId);
    if (rows.length !== 0) throw new Error(`expected 0, got ${rows.length}`);
    return rows;
  });
  check("the widget list joins the ticket", () => {
    const rows = reminders.listUpcomingReminders(agentId);
    if (rows.length !== 1) throw new Error(`expected 1, got ${rows.length}`);
    if (!rows[0].ticket_title) throw new Error("ticket title not joined");
    return rows;
  });

  /*
   * A reminder in the past is due, and `dueReminders` is what the notification
   * feed reads. The window is `since < due_at <= now`, which is what makes the
   * announcement happen exactly once without a delivery flag.
   */
  const past = new Date(Date.now() - 60_000);
  let dueId = "";
  check("create one that is already due", () => {
    const entry = reminders.createReminder(ticketId, agent, past, "Fällig");
    dueId = entry.id;
  });
  check("it is counted as due", () => {
    const n = reminders.countDueReminders(agentId);
    if (n !== 1) throw new Error(`expected 1, got ${n}`);
    return n;
  });
  check("it appears in the window", () => {
    const rows = reminders.dueReminders(
      agentId,
      new Date(Date.now() - 120_000).toISOString(),
    );
    if (!rows.some((row) => row.id === dueId)) {
      throw new Error(`${rows.length} rows, none of them ours`);
    }
    return rows.length;
  });
  check("and not in a window that has moved past it", () => {
    const rows = reminders.dueReminders(agentId, new Date().toISOString());
    if (rows.length !== 0) throw new Error(`expected 0, got ${rows.length}`);
    return rows;
  });
  check("the cron sees somebody with work due", () => {
    const ids = reminders.usersWithDueReminders();
    if (!ids.includes(agentId)) throw new Error(JSON.stringify(ids));
    return ids;
  });
  check("the notification feed carries it", () => {
    const rows = notifications.listNotifications(
      agent,
      new Date(Date.now() - 120_000).toISOString(),
    );
    if (!rows.some((row) => row.kind === "reminder")) {
      throw new Error(rows.map((row) => row.kind).join(",") || "none");
    }
    return rows.length;
  });
  check("ticking it off silences it", () => {
    reminders.setReminderDone(dueId, agentId, true);
    const n = reminders.countDueReminders(agentId);
    if (n !== 0) throw new Error(`expected 0, got ${n}`);
    return n;
  });
  check("and it can come back", () =>
    reminders.setReminderDone(dueId, agentId, false),
  );
  check("somebody else cannot tick it off", () => {
    try {
      reminders.setReminderDone(dueId, reporterId, true);
    } catch (error) {
      if (error instanceof reminders.ReminderError) return "refused";
      throw error;
    }
    throw new Error("a foreign reminder was ticked off");
  });
  check("delete", () => reminders.deleteReminder(reminderId, agentId));
  check("deleting it twice is refused", () => {
    try {
      reminders.deleteReminder(reminderId, agentId);
    } catch (error) {
      if (error instanceof reminders.ReminderError) return "refused";
      throw error;
    }
    throw new Error("a missing reminder was deleted");
  });

  console.log("purge");
  const purge = await import("../src/lib/purge");
  check("counts before", () => {
    const counts = purge.purgeCounts();
    if (counts.tickets < 1 || counts.cmdb < 1) {
      throw new Error(JSON.stringify(counts));
    }
    return counts;
  });
  check("nothing selected is a no-op", async () => {
    const report = await purge.purgeData({
      tickets: false,
      cmdb: false,
      organizations: false,
      locations: false,
    });
    if (report.tickets !== 0 || purge.purgeCounts().tickets < 1) {
      throw new Error("hat trotzdem gelöscht");
    }
    return report;
  });
  check("tickets and cmdb go", async () => {
    const report = await purge.purgeData({
      tickets: true,
      cmdb: true,
      organizations: false,
      locations: false,
    });
    if (report.tickets < 1) throw new Error("kein Ticket gelöscht");
    const left = purge.purgeCounts();
    if (left.tickets !== 0 || left.cmdb !== 0) {
      throw new Error(JSON.stringify(left));
    }
    // Sites were not selected, so they stay — the scopes have to be independent.
    if (left.locations < 1) throw new Error("Standorte mitgelöscht");
    return report;
  });
  check("sites go on their own", async () => {
    const report = await purge.purgeData({
      tickets: false,
      cmdb: false,
      organizations: true,
      locations: true,
    });
    const left = purge.purgeCounts();
    if (left.locations !== 0 || left.organizations !== 0) {
      throw new Error(JSON.stringify(left));
    }
    return report;
  });
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
