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

/**
 * Dasselbe, aber gewartet.
 *
 * `check` ruft nur auf und fängt synchron — bei einer `async`-Funktion ist der
 * Fehler eine abgewiesene Promise, die niemand liest, und der Testfall meldet
 * „ok". Für einen Pfad, der wirklich awaited werden muss (Passwort-Hash,
 * Better-Auth-Kontext), taugt das nicht.
 */
async function checkAsync(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
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
  const roleVisibility = await import("../src/lib/role-visibility");
  const presets = await import("../src/lib/visibility-presets");
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
  const pins = await import("../src/lib/ticket-pins");
  const notifications = await import("../src/lib/notifications");
  const cmdbExport = await import("../src/lib/cmdb-export");
  const cmdbImport = await import("../src/lib/cmdb-import");
  const csv = await import("../src/lib/csv");
  const sqlite = await import("../src/lib/db/sqlite");
  const db = sqlite.db;

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
  // Ein zweiter Mensch mit Zugriff, für den Fall „ein Kollege schreibt auf einem
  // Ticket, das mir gehört" — die Zuweisung darf dabei nicht wandern.
  const adminId = randomUUID();
  insertUser.run(agentId, "Bea Schulz", "bea@firma.de", now, now, "agent");
  insertUser.run(reporterId, "Anna Meier", "anna@firma.de", now, now, "user");
  insertUser.run(adminId, "Carl Weber", "carl@firma.de", now, now, "admin");

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
  const admin = {
    id: adminId,
    name: "Carl Weber",
    email: "carl@firma.de",
    role: "admin" as const,
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
    settings.setAuthSettings({
      registrationEnabled: true,
      allowedEmailDomains: ["firma.de"],
      sessionLifetimeDays: 14,
      twoFactorRequiredRoles: ["agent", "admin"],
    }),
  );
  // The session lifetime survives the round trip. It decides how long a cookie
  // lives, so a value that silently fell back to the default would mean an
  // instance logging people out on a schedule nobody configured.
  check("session lifetime round-trips", () => {
    const stored = settings.getAuthSettings();
    if (stored.sessionLifetimeDays !== 14) {
      throw new Error(String(stored.sessionLifetimeDays));
    }
    return stored.sessionLifetimeDays;
  });
  // Die Zwei-Faktor-Pflicht überlebt den Rundlauf. Ein Wert, der still auf leer
  // zurückfällt, ist eine Instanz, die glaubt, sie verlange einen zweiten Faktor.
  check("two-factor policy round-trips", () => {
    const stored = settings.getAuthSettings();
    const roles = stored.twoFactorRequiredRoles.join(",");
    if (roles !== "agent,admin") throw new Error(roles || "(leer)");
    return roles;
  });
  check("an unknown lifetime falls back instead of throwing", () => {
    const saved = settings.setAuthSettings({
      registrationEnabled: true,
      allowedEmailDomains: ["firma.de"],
      // Not one of the offered values — the mask cannot produce it, a hand-edited
      // row can. It must not take the whole auth blob down with it.
      sessionLifetimeDays: 3 as never,
      // Dasselbe für die Rollenliste: ein Name, den dieser Build nicht kennt,
      // wird herausgefiltert und nimmt die Domain-Whitelist nicht mit.
      twoFactorRequiredRoles: ["agent", "technician"] as never,
    });
    if (saved.sessionLifetimeDays !== 30) {
      throw new Error(String(saved.sessionLifetimeDays));
    }
    if (saved.allowedEmailDomains.length !== 1) {
      throw new Error("the domain whitelist was lost");
    }
    if (saved.twoFactorRequiredRoles.join(",") !== "agent") {
      throw new Error(saved.twoFactorRequiredRoles.join(",") || "(leer)");
    }
    return saved.sessionLifetimeDays;
  });
  check("system", () =>
    system.setSystemSettings({
      timezone: "Europe/Berlin",
      ntpHost: "pool.ntp.org",
      refreshMinutes: 3,
    }),
  );
  check("feature flags", () => features.setFeatureFlags(mits.DEFAULT_FEATURE_FLAGS));
  check("role visibility", () => {
    roleVisibility.setRoleVisibility(
      mits.RoleVisibilitySchema.parse({
        user: { hidden_forms: ["hardware-order"], hidden_areas: ["mits_cmdb"] },
      }),
    );
    if (roleVisibility.canSeeForm("user", "hardware-order")) {
      throw new Error("hidden form still visible");
    }
    if (!roleVisibility.canSeeForm("agent", "hardware-order")) {
      throw new Error("agent lost a form it never had taken away");
    }
    // Zurück auf den Default, sonst prüft der Rest der Suite eine Instanz mit
    // ausgeblendetem Formular — und der Katalog wäre dort um eines kürzer.
    return roleVisibility.setRoleVisibility(mits.DEFAULT_ROLE_VISIBILITY);
  });
  check("visibility presets", () => {
    // Ohne Zeile gelten die mitgelieferten drei; erst ein Schreibvorgang macht
    // die Liste zu dem, was der Admin stehen hat — auch wenn das nichts ist.
    if (presets.listVisibilityPresets().length !== 3) {
      throw new Error("a fresh instance should offer the three defaults");
    }
    presets.setVisibilityPresets([]);
    if (presets.listVisibilityPresets().length !== 0) {
      throw new Error("a deleted default came back");
    }
    return presets.setVisibilityPresets(mits.DEFAULT_VISIBILITY_PRESETS);
  });
  check("notifications", () =>
    notificationSettings.setNotificationSettings(mits.DEFAULT_NOTIFICATION_SETTINGS),
  );
  check("ticket display", () => {
    ticketDisplay.setTicketDisplaySettings({
      ...mits.DEFAULT_TICKET_DISPLAY_SETTINGS,
      formDisplay: "panel",
    });
    const back = ticketDisplay.getTicketFormDisplay();
    if (back !== "panel") throw new Error(`read back ${back}`);
    /*
     * The customer layout lives in the same blob, and that is the interesting
     * part: the reader used to hand-pick `formDisplay` out of the parsed JSON,
     * which would have dropped every switch below silently. A partial record is
     * also the shape that broke `widget_order` once — an absent key must fill in,
     * not fail the parse and take `formDisplay` with it.
     */
    const stored = ticketDisplay.getTicketDisplaySettings();
    if (stored.customerTicketList !== true) throw new Error("rail default lost");
    if (stored.customerMetaFields.assignee !== true) {
      throw new Error("meta field default lost");
    }

    const narrowed = ticketDisplay.setTicketDisplaySettings({
      ...mits.DEFAULT_TICKET_DISPLAY_SETTINGS,
      formDisplay: "panel",
      customerTicketList: false,
      customerMetaFields: {
        ...mits.DEFAULT_TICKET_DISPLAY_SETTINGS.customerMetaFields,
        assignee: false,
      },
    });
    if (narrowed.customerTicketList !== false) throw new Error("rail did not save");
    if (narrowed.customerMetaFields.assignee !== false) {
      throw new Error("meta field did not save");
    }
    // The keys that were not touched are still there, which is what the merge in
    // the transform is for.
    if (narrowed.customerMetaFields.status !== true) {
      throw new Error("an untouched meta field was dropped");
    }
    if (narrowed.formDisplay !== "panel") throw new Error("formDisplay was lost");

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
  /*
   * Export and re-import, over real rows.
   *
   * The offline suite proves the round trip on hand-built items; this proves the
   * half it cannot reach — that `exportLookups` reads the tables the export needs,
   * that a re-import of the produced file matches the same objects instead of
   * creating second copies, and that the MITS number survives it untouched.
   *
   * That last one is the whole reason the `info:` prefix exists: a plain
   * "Inventarnummer" column would be guessed as the *foreign* number on the way
   * back and overwrite the tag on a sticker.
   */
  console.log("cmdb export round trip");
  let exported = "";
  check("export", () => {
    const items = cmdb.listConfigurationItems();
    exported = cmdbExport.itemsToCsv(items, cmdb.exportLookups());
    if (!exported.includes("Bezeichnung")) throw new Error("kein Kopfsatz");
    const { rows } = csv.parseDelimited(exported);
    if (rows.length !== items.length) {
      throw new Error(`${rows.length} Zeilen für ${items.length} Objekte`);
    }
    return rows.length;
  });

  check("references are exported as readable values", () => {
    const { rows } = csv.parseDelimited(exported);
    const row = rows.find((entry) => entry.Fremdnummer === "NB-1");
    if (!row) throw new Error("Zeile NB-1 fehlt");
    // The site was named Berlin above; the assignee is the reporter fixture.
    if (row.Standort !== "Berlin") throw new Error(`Standort: ${row.Standort}`);
    return row.Standort;
  });

  check("re-importing the export updates and creates nothing", () => {
    const before = cmdb.cmdbCounts().total;
    const { headers } = csv.parseDelimited(exported);
    const mapping = csv.mappingForSubmit(csv.guessColumnMapping(headers));

    const summary = cmdbImport.importConfigurationItems(exported, mapping);

    if (summary.created !== 0) {
      throw new Error(`${summary.created} neu angelegt statt aktualisiert`);
    }
    if (summary.skipped.length > 0) {
      throw new Error(JSON.stringify(summary.skipped));
    }
    const after = cmdb.cmdbCounts().total;
    if (after !== before) throw new Error(`${before} -> ${after} Objekte`);
    return summary;
  });

  check("the MITS number survived the round trip", () => {
    const item = cmdb.getConfigurationItem(ciId);
    if (!item) throw new Error("Objekt nicht gefunden");
    if (mits.formatInventoryNumber(item.inventory_number) !== "INV-10000001") {
      throw new Error(mits.formatInventoryNumber(item.inventory_number));
    }
    // …and it did not land in the foreign number, which is the failure the
    // read-only prefix prevents.
    if (item.asset_tag !== "NB-1") throw new Error(`Fremdnummer: ${item.asset_tag}`);
    return item.inventory_number;
  });

  check("an edited cell comes back changed", () => {
    const edited = exported.replace("in Reparatur", "geprüft und wieder im Einsatz");
    const { headers } = csv.parseDelimited(edited);
    const mapping = csv.mappingForSubmit(csv.guessColumnMapping(headers));
    cmdbImport.importConfigurationItems(edited, mapping);

    const item = cmdb.getConfigurationItem(ciId);
    if (item?.note !== "geprüft und wieder im Einsatz") {
      throw new Error(`Notiz: ${item?.note}`);
    }
    return item.note;
  });

  check("attributes survive as attributes", () => {
    const withAttr = cmdb.saveConfigurationItem(
      mits.MITSConfigurationItemSchema.omit({
        created_at: true,
        updated_at: true,
      }).parse({
        id: "",
        name: "Notebook 3",
        type: "hardware",
        asset_tag: "NB-3",
        attributes: { RAM: "32 GB" },
      }),
    );

    const text = cmdbExport.itemsToCsv(
      cmdb.listConfigurationItems(),
      cmdb.exportLookups(),
    );
    const { headers } = csv.parseDelimited(text);
    const mapping = csv.mappingForSubmit(csv.guessColumnMapping(headers));
    cmdbImport.importConfigurationItems(text, mapping);

    const again = cmdb.getConfigurationItem(withAttr.id);
    if (again?.attributes.RAM !== "32 GB") {
      throw new Error(JSON.stringify(again?.attributes));
    }
    return again.attributes;
  });

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

  /*
   * Ballbesitz, Fall 1: der Agent antwortet auf ein herrenloses offenes Ticket.
   *
   * Zwei Wirkungen in einem Aufruf, und beide sind der Punkt der Änderung — vor
   * ihr lag das Ticket nach einer Antwort weiter unzugewiesen im Eingang.
   */
  check("agent reply claims the ticket and hands the ball back", () => {
    comments.addComment(ticketId, agent, "<p>Wir schauen.</p>", "public", "html");
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (ticket?.assigned_to !== agentId) {
      throw new Error(`Bearbeiter ist ${ticket?.assigned_to}`);
    }
    if (ticket.status !== "waiting_user") {
      throw new Error(`Status ist ${ticket.status}`);
    }
    return ticket.status;
  });

  // Fall 3: die Einbahnstraße, die es vorher war. Ein Melder, der auf „Wartet auf
  // Anwender" antwortet, gibt den Ball zurück.
  check("a reporter reply on waiting_user hands the ball back", () => {
    comments.addComment(ticketId, reporter, "Hier ist ein Foto.", "public");
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (ticket?.status !== "open") {
      throw new Error(`Status ist ${ticket?.status}`);
    }
    // Die Zuweisung bleibt — „in Bearbeitung" ist die *Anzeige* daraus, kein
    // eigener Statuswert mehr.
    if (ticket.assigned_to !== agentId) {
      throw new Error(`Bearbeiter ist ${ticket.assigned_to}`);
    }
    return ticket.status;
  });

  // Fall 2: wer es hält, behält es. Ein zweiter Agent, der dazwischenschreibt,
  // reißt das Ticket nicht an sich.
  check("a second agent's reply leaves the assignment alone", () => {
    comments.addComment(ticketId, admin, "Ich kenne das.", "public");
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (ticket?.assigned_to !== agentId) {
      throw new Error(`Bearbeiter ist ${ticket?.assigned_to}`);
    }
    return ticket.assigned_to;
  });

  check("internal note", () =>
    comments.addComment(ticketId, agent, "Toner bestellt.", "internal"),
  );
  // Eine interne Notiz ist Werkstattgespräch: sie bewegt nichts. Nach der
  // öffentlichen Antwort des zweiten Agenten steht das Ticket auf
  // `waiting_user`, und dort bleibt es.
  check("an internal note moves nothing", () => {
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (ticket?.status !== "waiting_user") {
      throw new Error(`Status ist ${ticket?.status}`);
    }
    return ticket.status;
  });

  let commentId = "";
  check("list comments", () => {
    // Fünf: Melder, Agent, Melder, zweiter Agent, interne Notiz — die drei
    // Ballbesitz-Prüfungen darüber schreiben mit.
    const rows = comments.listCommentsFor(ticketId, agent);
    if (rows.length !== 5) throw new Error(`expected 5, got ${rows.length}`);
    // Der älteste, und er gehört dem Melder: die zwei Prüfungen darunter
    // bearbeiten und ziehen ihn zurück, und beides darf nur der Verfasser.
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
  check("status", () => tickets.setTicketStatus(ticketId, "waiting_user", agent));
  check("priority", () => tickets.setTicketPriority(ticketId, "high", agent));
  check("close", () => tickets.setTicketStatus(ticketId, "closed", agent));
  // Ein abgeschlossenes Ticket holt der Melder zurück, und die Zuweisung bleibt
  // stehen — wer es zuletzt hatte, ist die naheliegende Person dafür.
  check("a reporter reply reopens it and keeps the assignee", () => {
    comments.addComment(ticketId, reporter, "Doch noch ein Problem.", "public");
    const ticket = tickets.getTicketFor(ticketId, agent);
    if (ticket?.status !== "open") {
      throw new Error(`expected open, got ${ticket?.status}`);
    }
    if (ticket.assigned_to !== agentId) {
      throw new Error(`Bearbeiter ist ${ticket.assigned_to}`);
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

  /*
   * A minimal, valid draft, parsed through the real schema like every other
   * fixture here. `priority` is passed in rather than defaulted, because the whole
   * point of the checks below is the difference between stating one and not.
   */
  const priorityDraft = (priority?: (typeof mits.TicketPriorityValues)[number]) =>
    mits.MITSTicketDraftSchema.parse({
      source: "legacy",
      form_schema_id: "quick-ticket",
      payload: {
        title: "Tastatur tot",
        description: "Die Tastatur reagiert seit dem Neustart auf keine Taste.",
      },
      ...(priority ? { priority } : {}),
    });

  console.log("role default priority");
  check("a reporter's ticket starts at the configured priority", () => {
    roleVisibility.setRoleVisibility({
      user: { hidden_forms: [], hidden_areas: [], default_priority: "high" },
      agent: { hidden_forms: [], hidden_areas: [], default_priority: "low" },
    });

    /*
     * No `priority` on the draft at all — which is the whole point of the field
     * being optional rather than defaulted. With a default, "said nothing" and
     * "said medium" would be the same value and the setting would be invisible to
     * every client that omits it.
     */
    const filed = tickets.createTicket(
      priorityDraft(),
      reporter,
    );
    if (filed.priority !== "high") throw new Error(filed.priority);
    return filed.priority;
  });
  check("a reporter cannot talk their way past it", () => {
    const filed = tickets.createTicket(
      priorityDraft("critical"),
      reporter,
    );
    if (filed.priority !== "high") throw new Error(filed.priority);
    return filed.priority;
  });
  check("an agent keeps what they state, and inherits what they do not", () => {
    const stated = tickets.createTicket(
      priorityDraft("critical"),
      agent,
    );
    if (stated.priority !== "critical") throw new Error(stated.priority);

    const silent = tickets.createTicket(
      priorityDraft(),
      agent,
    );
    if (silent.priority !== "low") throw new Error(silent.priority);

    return `${stated.priority}/${silent.priority}`;
  });
  check("an unknown stored priority falls back without losing the rest", () => {
    const saved = roleVisibility.setRoleVisibility({
      user: {
        hidden_forms: ["quick-ticket"],
        hidden_areas: [],
        // Not a value this build knows. It must not take the form rules with it.
        default_priority: "panic" as never,
      },
      agent: { hidden_forms: [], hidden_areas: [], default_priority: "medium" },
    });
    if (saved.user.default_priority !== "medium") {
      throw new Error(saved.user.default_priority);
    }
    if (saved.user.hidden_forms.length !== 1) {
      throw new Error("the form rules were lost");
    }
    return saved.user.default_priority;
  });
  // Back to the default, so the checks after this one are not reading a queue
  // shaped by this section.
  check("reset", () =>
    roleVisibility.setRoleVisibility({
      user: { hidden_forms: [], hidden_areas: [], default_priority: "medium" },
      agent: { hidden_forms: [], hidden_areas: [], default_priority: "medium" },
    }),
  );

  console.log("pins");
  check("pin", () => {
    const state = pins.togglePin(ticketId, agent);
    if (state !== true) throw new Error(`expected pinned, got ${state}`);
    if (!pins.isPinned(ticketId, agentId)) throw new Error("not pinned");
    return state;
  });
  check("somebody else has not pinned it", () => {
    if (pins.isPinned(ticketId, reporterId)) throw new Error("shared pin");
    return "own only";
  });
  check("a pin on a ticket that does not exist is refused", () => {
    try {
      pins.togglePin(randomUUID(), agent);
    } catch (error) {
      if (error instanceof pins.PinError) return "refused";
      throw error;
    }
    throw new Error("a pin was written for a ticket that does not exist");
  });

  /*
   * The partition, and the reason this section exists.
   *
   * `pinnedOnlyFor` and `excludePinnedFor` are complements over the same filter —
   * that is what keeps a pinned ticket from appearing twice on the queue and what
   * keeps the pager's total honest. It is also the test that catches a shifted
   * bind: `pinned` is the last expression in the SELECT list of `searchTickets`,
   * and every parameter there is positional, so an expression inserted above it
   * produces valid SQL that answers a different question. Neither `typecheck` nor
   * `build` executes a statement.
   */
  check("the two halves partition the same filter", () => {
    const all = tickets.countSearchTickets({}, agent);
    const onlyPinned = tickets.countSearchTickets(
      { pinnedOnlyFor: agentId },
      agent,
    );
    const withoutPinned = tickets.countSearchTickets(
      { excludePinnedFor: agentId },
      agent,
    );

    if (onlyPinned < 1) throw new Error("the pinned half is empty");
    if (onlyPinned + withoutPinned !== all) {
      throw new Error(`${onlyPinned} + ${withoutPinned} !== ${all}`);
    }
    return `${onlyPinned}/${all}`;
  });
  check("the pinned column reports the reader, not the row", () => {
    const mine = tickets
      .searchTickets({ pinnedOnlyFor: agentId }, agent)
      .find((row) => row.id === ticketId);
    if (!mine?.pinned) throw new Error("pinned column is false for a pinned row");

    // The same row read by somebody else is not pinned — the column carries a
    // bound user id, and a wrong bind order would report the writer's state here.
    const theirs = tickets
      .searchTickets({}, reporter)
      .find((row) => row.id === ticketId);
    if (theirs?.pinned) throw new Error("pinned column leaked across readers");

    return "per reader";
  });
  check("both halves at once match nothing", () => {
    const n = tickets.countSearchTickets(
      { pinnedOnlyFor: agentId, excludePinnedFor: agentId },
      agent,
    );
    if (n !== 0) throw new Error(`expected 0, got ${n}`);
    return n;
  });
  check("unpin", () => {
    const state = pins.togglePin(ticketId, agent);
    if (state !== false) throw new Error(`expected unpinned, got ${state}`);
    if (pins.isPinned(ticketId, agentId)) throw new Error("still pinned");
    if (pins.countPins(agentId) !== 0) throw new Error("count did not drop");
    return state;
  });

  console.log("accounts");
  const createAccountModule = await import("../src/lib/auth/create-account");
  const users = await import("../src/lib/users");
  await checkAsync("create an agent account", async () => {
    const created = await createAccountModule.createAccount({
      name: "Carla Vogt",
      email: "carla@firma.de",
      password: "GenugZeichen1",
      role: "agent",
      mustChangePassword: true,
    });
    // Die Rolle reist durch das Fenster in `auth/bootstrap.ts` und wird vom
    // User-Create-Hook gesetzt — ohne das käme hier `user` zurück.
    const stored = users.findUser(created.id);
    if (stored?.role !== "agent") {
      throw new Error(`Rolle ist ${stored?.role}, nicht agent`);
    }
    if (!users.mustChangePassword(created.id)) {
      throw new Error("das Gate ist nicht gesetzt");
    }
    // Ohne die Zeile in `account` gibt es kein Passwort zum Anmelden.
    const row = db
      .prepare(
        "SELECT COUNT(*) AS count FROM account WHERE userId = ? AND providerId = 'credential'",
      )
      .get(created.id) as { count: number };
    if (row.count !== 1) throw new Error("keine credential-Zeile");
    return created;
  });
  /*
   * Der zweite Faktor, beide Richtungen.
   *
   * Genau der Vertrag, den ein Typechecker nicht sieht: `twoFactorEnabled` ist
   * eine Spalte, die das Plugin anlegt, und `twoFactor` eine Tabelle, deren Name
   * nur in einem String steht. Ein frisch angelegtes Konto hat keinen Faktor —
   * und wenn die Spalte fehlte, wäre das hier kein `false`, sondern ein Wurf.
   */
  check("a fresh account has no second factor", () => {
    const carla = users.findUserByEmail("carla@firma.de");
    if (!carla) throw new Error("Konto nicht gefunden");
    if (users.hasTwoFactor(carla.id)) throw new Error("Faktor aus dem Nichts");
    return false;
  });
  check("resetting a second factor that is not there is harmless", () => {
    const carla = users.findUserByEmail("carla@firma.de");
    if (!carla) throw new Error("Konto nicht gefunden");
    users.resetTwoFactor(carla.id);
    return users.hasTwoFactor(carla.id);
  });

  console.log("verfalls-sweeper");
  {
    const workflowSettings = await import("../src/lib/workflow-settings");
    const sweeper = await import("../src/lib/ticket-sweeper");

    const backdate = db.prepare(
      "UPDATE mits_ticket SET status = ?, status_changed_at = ?, auto_close_off = ? WHERE id = ?",
    );
    const longAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const statusOf = (id: string) =>
      (db.prepare("SELECT status FROM mits_ticket WHERE id = ?").get(id) as {
        status: string;
      }).status;

    const setReminderStamp = db.prepare(
      "UPDATE mits_ticket SET waiting_reminder_at = ? WHERE id = ?",
    );
    const reminderStampOf = (id: string) =>
      (
        db
          .prepare("SELECT waiting_reminder_at AS at FROM mits_ticket WHERE id = ?")
          .get(id) as { at: string | null }
      ).at;

    check("beide Fristen einstellen", () =>
      workflowSettings.setWorkflowSettings(
        mits.WorkflowSettingsSchema.parse({
          waitingReminderDays: 3,
          waitingCloseDays: 7,
        }),
      ),
    );

    /*
     * Der Zustand wird von Hand gesetzt statt über `setTicketStatus`: die Uhr soll
     * zurückdatiert sein, und genau das kann kein Schreibpfad — er stempelt immer
     * „jetzt". Ohne das Zurückdatieren prüfte der Test nur, dass ein gerade
     * gewechseltes Ticket *nicht* angefasst wird.
     *
     * Die Mail geht ins Leere: ohne konfiguriertes SMTP schluckt
     * `sendNotification` den Transport selbst. Was hier geprüft wird, ist der
     * Stempel — er entscheidet, ob die Erinnerung genau einmal rausgeht.
     */
    await checkAsync("Wartend erinnert nach der Frist", async () => {
      backdate.run("waiting_user", longAgo, 0, ticketId);
      setReminderStamp.run(null, ticketId);
      const result = await sweeper.sweepWorkflow();
      if (result.remindersSent !== 1) {
        throw new Error(`erinnert: ${result.remindersSent}`);
      }
      if (reminderStampOf(ticketId) === null) throw new Error("kein Stempel");
      return "gestempelt";
    });

    await checkAsync("und erinnert nicht zweimal", async () => {
      const result = await sweeper.sweepWorkflow();
      if (result.remindersSent !== 0) {
        throw new Error(`erinnert: ${result.remindersSent}`);
      }
      return "still";
    });

    await checkAsync("nach der Erinnerung schließt es", async () => {
      setReminderStamp.run(longAgo, ticketId);
      const result = await sweeper.sweepWorkflow();
      if (result.closedWaiting !== 1) {
        throw new Error(`geschlossen: ${result.closedWaiting}`);
      }
      const after = statusOf(ticketId);
      if (after !== "closed") throw new Error(after);
      return after;
    });

    await checkAsync("der Schalter am Ticket sticht die Frist", async () => {
      backdate.run("waiting_user", longAgo, 1, ticketId);
      setReminderStamp.run(longAgo, ticketId);
      const result = await sweeper.sweepWorkflow();
      if (result.remindersSent + result.closedWaiting !== 0) {
        throw new Error(JSON.stringify(result));
      }
      const after = statusOf(ticketId);
      if (after !== "waiting_user") throw new Error(after);
      return after;
    });

    // Ohne Frist läuft gar nichts — der Auslieferungszustand, und der Grund,
    // warum ein Update keine Kundentickets schließt.
    await checkAsync("ohne Frist rührt der Sweeper nichts an", async () => {
      workflowSettings.setWorkflowSettings(mits.WorkflowSettingsSchema.parse({}));
      backdate.run("waiting_user", longAgo, 0, ticketId);
      setReminderStamp.run(longAgo, ticketId);
      const result = await sweeper.sweepWorkflow();
      if (result.remindersSent + result.closedWaiting !== 0) {
        throw new Error(JSON.stringify(result));
      }
      return statusOf(ticketId);
    });

    /*
     * Die Migration von sechs Werten auf drei.
     *
     * Von Hand geschriebene Altwerte, dann `collapseStatuses` — die Funktion, die
     * beim Serverstart läuft. Das ist die Prüfung, die einen Bestand rettet: ein
     * Ticket, das nach dem Update in keiner Liste steht, sieht aus wie ein
     * verlorenes Ticket.
     */
    check("alte Statuswerte werden zusammengelegt", () => {
      const setRaw = db.prepare("UPDATE mits_ticket SET status = ? WHERE id = ?");
      setRaw.run("in_progress", ticketId);
      sqlite.collapseStatuses(db);
      const after = statusOf(ticketId);
      if (after !== "open") throw new Error(after);

      setRaw.run("resolved", ticketId);
      sqlite.collapseStatuses(db);
      const closedNow = statusOf(ticketId);
      if (closedNow !== "closed") throw new Error(closedNow);

      setRaw.run("waiting_major", ticketId);
      sqlite.collapseStatuses(db);
      const parkedNow = statusOf(ticketId);
      if (parkedNow !== "open") throw new Error(parkedNow);

      return "drei Werte";
    });
  }

  console.log("queue-spalten");
  {
    const views = await import("../src/lib/agent-views");

    check("ohne Zeile sind alle Spalten an", () => {
      const hidden = views.getHiddenQueueColumns(agentId);
      if (hidden.length !== 0) throw new Error(hidden.join(","));
      return "alle";
    });

    check("speichern und zuruecklesen", () => {
      views.saveHiddenQueueColumns(agentId, ["time", "location"]);
      const hidden = views.getHiddenQueueColumns(agentId);
      // In der Reihenfolge von QUEUE_COLUMNS, nicht in der der Eingabe.
      if (hidden.join(",") !== "location,time") throw new Error(hidden.join(","));
      return hidden.join(",");
    });

    // Je Konto, wie die Startansicht: die Wahl des einen darf die des anderen
    // nicht anfassen.
    check("die Wahl gehoert dem Konto", () => {
      const other = views.getHiddenQueueColumns(reporterId);
      if (other.length !== 0) throw new Error(other.join(","));
      return "unberuehrt";
    });

    check("ein unbekannter Schluessel landet nicht in der Zeile", () => {
      const saved = views.saveHiddenQueueColumns(agentId, [
        "status",
        "sternzeichen",
      ] as never);
      if (saved.join(",") !== "status") throw new Error(saved.join(","));
      return saved.join(",");
    });

    check("zuruecksetzen", () => {
      views.saveHiddenQueueColumns(agentId, []);
      return views.getHiddenQueueColumns(agentId).length;
    });
  }

  console.log("auth log");
  const authLog = await import("../src/lib/auth-log");
  check("record and read back", () => {
    const before = authLog.countAuthEvents();
    authLog.recordAuthEvent(
      "role_changed",
      { id: "admin-1", email: "admin@firma.de" },
      "carla@firma.de: user → agent",
    );
    if (authLog.countAuthEvents() !== before + 1) {
      throw new Error("nichts geschrieben");
    }
    const [newest] = authLog.listAuthEvents(1);
    if (newest?.action !== "role_changed") {
      throw new Error(String(newest?.action));
    }
    return newest.detail;
  });
  /*
   * Die Anmeldung selbst hängt in `databaseHooks.session.create.after`; hier wird
   * geprüft, dass der Schreibpfad, den sie benutzt, mit einer Sitzung ohne Adresse
   * zurechtkommt — der Hook liest die Adresse aus der Tabelle und findet sie nicht
   * immer.
   *
   * Gesucht statt `[0]` genommen: `listAuthEvents` sortiert nach
   * `created_at DESC, id DESC`, und zwei Zeilen aus derselben Millisekunde
   * entscheidet damit eine UUID. Ein Test, der die vorderste Zeile erwartet, ist
   * dann in einem von zwei Läufen rot — und zwar aus einem Grund, der nichts mit
   * dem geprüften Schreibpfad zu tun hat.
   */
  check("an event without an account still lands", () => {
    const before = authLog.countAuthEvents();
    authLog.recordAuthEvent("sign_in", { id: null, email: null });
    if (authLog.countAuthEvents() !== before + 1) {
      throw new Error("nichts geschrieben");
    }
    const anonymous = authLog
      .listAuthEvents(5)
      .find((entry) => entry.action === "sign_in" && entry.actorEmail === "");
    if (!anonymous) throw new Error("die Zeile ohne Konto fehlt");
    return "(leer)";
  });
  await checkAsync("the address is refused twice", async () => {
    try {
      await createAccountModule.createAccount({
        name: "Carla Zwei",
        email: "CARLA@firma.de",
        password: "GenugZeichen2",
        role: "admin",
        mustChangePassword: false,
      });
    } catch (error) {
      if (error instanceof createAccountModule.AccountCreateError) return error;
      throw error;
    }
    throw new Error("die doppelte Adresse ging durch");
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
