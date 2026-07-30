/**
 * Checks the JSON-Schema → zod compiler against the example schemas.
 *
 * The compiler is the part of the form engine with no visible failure mode: a
 * wrong widget or a missing constraint looks like a working form until someone
 * submits bad data. Run with `npm test`.
 */
import {
  defaultValuesFor,
  resolveFields,
  schemaToZod,
} from "../src/lib/forms/schema-to-zod";
import {
  HARDWARE_ORDER_SCHEMA,
  QUICK_TICKET_SCHEMA,
  SOFTWARE_ACCESS_SCHEMA,
  USER_ONBOARDING_SCHEMA,
} from "../src/lib/mock-schemas";
import { ticketCreatedMail, ticketReplyMail } from "../src/lib/mail-templates";
import {
  DEFAULT_PORTAL_FAQS,
  KEEP_SMTP_PASSWORD,
  MITSTicketSchema,
  PORTAL_WIDGET_ORDER,
  PortalConfigSchema,
  PortalFaqSchema,
  fillPortalText,
  formatTicketNumber,
  parseTicketNumber,
  resolveSmtpPassword,
} from "../src/types/mits";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

console.log("widget resolution");
{
  const byName = Object.fromEntries(
    resolveFields(HARDWARE_ORDER_SCHEMA).map((f) => [f.name, f]),
  );
  check("device_type -> select", byName.device_type.widget === "select");
  check("quantity -> number", byName.quantity.widget === "number");
  check("needed_by -> date", byName.needed_by.widget === "date");
  check("accessories -> multiselect", byName.accessories.widget === "multiselect");
  check("quote -> file", byName.quote.widget === "file");
  check("replaces_existing -> switch", byName.replaces_existing.widget === "switch");
  check("justification -> textarea", byName.justification.widget === "textarea");
  check(
    "accessories option labels",
    byName.accessories.options?.[0]?.label === "Dockingstation",
    JSON.stringify(byName.accessories.options?.[0]),
  );
  const onboarding = Object.fromEntries(
    resolveFields(USER_ONBOARDING_SCHEMA).map((f) => [f.name, f]),
  );
  check("manager_email -> email", onboarding.manager_email.widget === "email");
  check("employment_type -> radio", onboarding.employment_type.widget === "radio");
  check(
    "field order follows uiHints.order",
    resolveFields(USER_ONBOARDING_SCHEMA)[0].name === "first_name",
  );
}

console.log("quick ticket");
{
  const zod = schemaToZod(QUICK_TICKET_SCHEMA);
  const empty = zod.safeParse(defaultValuesFor(QUICK_TICKET_SCHEMA));
  const errors = empty.success
    ? []
    : empty.error.issues.map((i) => i.path.join("."));
  check("empty form is rejected", !empty.success);
  check("title required", errors.includes("title"), errors.join(","));
  check("description required", errors.includes("description"), errors.join(","));
  check("priority has a default, so not flagged", !errors.includes("priority"));
  check("optional attachments not flagged", !errors.includes("attachments"));

  const valid = zod.safeParse({
    title: "Drucker Etage 3 offline",
    priority: "high",
    description: "Seit heute Morgen ist der Drucker nicht erreichbar, Fehler 0x83.",
    attachments: [],
  });
  check("valid submission passes", valid.success, JSON.stringify(valid.error?.issues));

  const shortTitle = zod.safeParse({
    title: "abc",
    priority: "high",
    description: "Seit heute Morgen ist der Drucker nicht erreichbar, Fehler 0x83.",
    attachments: [],
  });
  check("minLength on title enforced", !shortTitle.success);

  const badPriority = zod.safeParse({
    title: "Drucker Etage 3 offline",
    priority: "sofort",
    description: "Seit heute Morgen ist der Drucker nicht erreichbar, Fehler 0x83.",
    attachments: [],
  });
  check("enum value outside the schema is rejected", !badPriority.success);
}

console.log("hardware order");
{
  const zod = schemaToZod(HARDWARE_ORDER_SCHEMA);
  const base = {
    device_type: "notebook",
    model_preference: "",
    quantity: "2",
    cost_center: "41200",
    needed_by: "2026-08-15",
    accessories: ["dock", "headset"],
    justification: "Ersatz für ein defektes Notebook im Vertriebsinnendienst.",
    replaces_existing: true,
    quote: [],
  };

  const ok = zod.safeParse(base);
  check("valid order passes", ok.success, JSON.stringify(ok.error?.issues));
  check(
    "quantity string is coerced to number",
    ok.success && typeof ok.data.quantity === "number" && ok.data.quantity === 2,
    JSON.stringify(ok.success ? ok.data.quantity : null),
  );
  check(
    "empty optional text stays valid",
    zod.safeParse({ ...base, model_preference: "" }).success,
  );
  check(
    "empty required number is rejected, not coerced to 0",
    !zod.safeParse({ ...base, quantity: "" }).success,
  );
  check(
    "cost_center pattern enforced",
    !zod.safeParse({ ...base, cost_center: "abc" }).success,
  );
  check(
    "quantity maximum enforced",
    !zod.safeParse({ ...base, quantity: "99" }).success,
  );
  check(
    "unknown accessory rejected",
    !zod.safeParse({ ...base, accessories: ["laserschwert"] }).success,
  );
  check(
    "optional multiselect may be empty",
    zod.safeParse({ ...base, accessories: [] }).success,
  );
}

console.log("user onboarding");
{
  const zod = schemaToZod(USER_ONBOARDING_SCHEMA);
  const base = {
    first_name: "Jana",
    last_name: "Berger",
    start_date: "2026-09-01",
    department: "it",
    employment_type: "permanent",
    manager_email: "lead@wellergruppe.de",
    systems: ["ad", "m365"],
    copy_permissions_from: "",
    notes: "",
  };
  const ok = zod.safeParse(base);
  check("valid onboarding passes", ok.success, JSON.stringify(ok.error?.issues));
  check(
    "empty optional email accepted",
    zod.safeParse({ ...base, copy_permissions_from: "" }).success,
  );
  check(
    "malformed optional email rejected",
    !zod.safeParse({ ...base, copy_permissions_from: "nope" }).success,
  );
  check(
    "required email must be valid",
    !zod.safeParse({ ...base, manager_email: "lead@" }).success,
  );
  check(
    "systems minItems enforced",
    !zod.safeParse({ ...base, systems: [] }).success,
  );
}

console.log("software access");
{
  const zod = schemaToZod(SOFTWARE_ACCESS_SCHEMA);
  const base = {
    application: "erp",
    application_other: "",
    access_level: "write",
    valid_until: "",
    business_justification: "Freigabe von Bestellungen im Einkauf ab August.",
    screenshot: [],
    consent: true,
  };
  check("valid request passes", zod.safeParse(base).success);
  check(
    "consent must be true (const: true)",
    !zod.safeParse({ ...base, consent: false }).success,
  );
  check(
    "empty optional date accepted",
    zod.safeParse({ ...base, valid_until: "" }).success,
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Portal configuration normalisation.

   Here for the same reason as the compiler above: it has no visible failure
   mode. A stored config that fails to parse falls back to the defaults, and a
   portal quietly showing default widgets in default order looks exactly like a
   portal an admin never configured.

   Both cases below were real bugs. Zod 4's `record` is exhaustive when keyed by
   an enum, and `array(enum)` rejects an unknown member — so a partial or
   slightly stale row threw away the admin's whole layout instead of letting the
   transforms repair it.
   ────────────────────────────────────────────────────────────────────────── */

console.log("portal config");
{
  const defaults = PortalConfigSchema.parse({});
  check(
    "empty object yields every default",
    defaults.hero_title === "Guten Tag!" &&
      defaults.ticket_button_label === "Zum Ticketsystem" &&
      defaults.widget_order.length === PORTAL_WIDGET_ORDER.length,
  );

  const partialTitles = PortalConfigSchema.safeParse({
    widget_titles: { faq: "Wissensdatenbank" },
    widget_order: ["downloads", "faq"],
  });
  check("partial widget_titles parses", partialTitles.success);
  check(
    "one renamed title keeps the others",
    partialTitles.success &&
      partialTitles.data.widget_titles.faq === "Wissensdatenbank" &&
      partialTitles.data.widget_titles.outages === "Aktuelle Störungen",
  );
  check(
    "a partial section does not discard widget_order",
    partialTitles.success &&
      partialTitles.data.widget_order[0] === "downloads" &&
      partialTitles.data.widget_order[1] === "faq",
  );

  const partialToggles = PortalConfigSchema.safeParse({
    enabled_widgets: { status: false },
  });
  check("partial enabled_widgets parses", partialToggles.success);
  check(
    "unnamed widgets stay enabled",
    partialToggles.success &&
      partialToggles.data.enabled_widgets.status === false &&
      partialToggles.data.enabled_widgets.faq === true,
  );

  const messyOrder = PortalConfigSchema.safeParse({
    widget_order: ["faq", "does-not-exist", "outages", "faq"],
  });
  check("unknown key in widget_order does not fail the parse", messyOrder.success);
  check(
    "unknown dropped, duplicate collapsed, missing appended",
    messyOrder.success &&
      messyOrder.data.widget_order.length === PORTAL_WIDGET_ORDER.length &&
      messyOrder.data.widget_order[0] === "faq" &&
      messyOrder.data.widget_order[1] === "outages" &&
      new Set(messyOrder.data.widget_order).size === PORTAL_WIDGET_ORDER.length,
  );

  check(
    "a blank title falls back for that key only",
    PortalConfigSchema.parse({ widget_titles: { faq: "   " } }).widget_titles
      .faq === "Selbsthilfe",
  );

  // Re-parsing a parsed config is what every save does: the form posts back the
  // transformed object. A non-idempotent schema would reject the admin's own data.
  const roundTrip = PortalConfigSchema.safeParse(defaults);
  check("parse is idempotent", roundTrip.success);

  check(
    "{name} is replaced",
    fillPortalText("Guten Tag, {name}!", "Jana") === "Guten Tag, Jana!",
  );
  check(
    "text without a placeholder is untouched",
    fillPortalText("Guten Tag!", "Jana") === "Guten Tag!",
  );
}

console.log("portal faq defaults");
{
  check("six default entries", DEFAULT_PORTAL_FAQS.length === 6);
  check(
    "every default parses",
    DEFAULT_PORTAL_FAQS.every((faq) => PortalFaqSchema.safeParse(faq).success),
  );
  check(
    "order_index is contiguous from zero",
    DEFAULT_PORTAL_FAQS.every((faq, index) => faq.order_index === index),
  );
  check(
    "ids are unique",
    new Set(DEFAULT_PORTAL_FAQS.map((faq) => faq.id)).size ===
      DEFAULT_PORTAL_FAQS.length,
  );
  check(
    "covers the six documented topics",
    ["referenzbenutzer", "rechte", "hardware", "netzlaufwerk", "sgate", "xphone"].every(
      (topic) => DEFAULT_PORTAL_FAQS.some((faq) => faq.id.includes(topic)),
    ),
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Mail path.

   Two rules with no visible failure mode. A blank password field that clears the
   stored credentials looks fine until the next notification silently does not
   arrive; an unescaped ticket title looks fine until someone files a ticket
   called `<img onerror=…>` and it renders in a colleague's inbox.
   ────────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────
   Ticket number parsing.

   This decides whether a search term is a direct jump or a text query. Too
   permissive and every numeric-looking search stops being a search; too strict
   and the number people read off a mail does not work.
   ────────────────────────────────────────────────────────────────────────── */

console.log("ticket number parsing");
{
  const accepts: [string, number][] = [
    ["1001", 1001],
    ["#1001", 1001],
    ["TICK-1001", 1001],
    ["tick-1001", 1001],
    ["tick 1001", 1001],
    ["TICK1001", 1001],
    ["  1001  ", 1001],
  ];
  for (const [input, expected] of accepts) {
    check(
      `"${input}" -> ${expected}`,
      parseTicketNumber(input) === expected,
      String(parseTicketNumber(input)),
    );
  }

  const rejects = [
    "",
    "   ",
    "Drucker",
    "TICK-",
    "1001a",
    "10.01",
    "-5",
    "0",
    "rita@example.invalid",
    "1234567890123",
    "TICK-1001-2",
  ];
  for (const input of rejects) {
    check(`"${input}" is not a number`, parseTicketNumber(input) === null,
      String(parseTicketNumber(input)));
  }

  check(
    "formatting round-trips",
    parseTicketNumber(formatTicketNumber(1042)) === 1042,
  );
}

console.log("smtp password handling");
{
  check(
    "blank keeps the stored password",
    resolveSmtpPassword("", "gespeichert") === "gespeichert",
  );
  check(
    "the sentinel keeps it too",
    resolveSmtpPassword(KEEP_SMTP_PASSWORD, "gespeichert") === "gespeichert",
  );
  check(
    "a new value replaces it",
    resolveSmtpPassword("neu", "alt") === "neu",
  );
  check(
    "whitespace clears it — the only way to unset",
    resolveSmtpPassword("   ", "alt") === "",
  );
  check(
    "a new value is trimmed",
    resolveSmtpPassword("  neu  ", "alt") === "neu",
  );
}

console.log("mail templates");
{
  const ticket = MITSTicketSchema.parse({
    id: "t-1",
    ticket_number: 1042,
    location_id: null,
    source: "legacy",
    form_schema_id: "quick-ticket",
    title: 'Drucker <script>alert("x")</script> & Co',
    payload: { title: "x" },
    status: "open",
    priority: "normal",
    created_by: "u-1",
    created_by_email: "rita@example.invalid",
    assigned_to: null,
    created_at: "2026-07-30T10:00:00.000Z",
  });

  const created = ticketCreatedMail(ticket, "https://mits.example.invalid/tickets/t-1");
  check("subject carries the number", created.subject.includes("TICK-1042"));
  check("html carries the number", created.html.includes("TICK-1042"));
  check(
    "html carries the absolute link",
    created.html.includes("https://mits.example.invalid/tickets/t-1"),
  );
  check("plain-text alternative exists", created.text.length > 50);
  check(
    "script tag is escaped in html",
    !created.html.includes("<script>") && created.html.includes("&lt;script&gt;"),
  );
  check(
    "ampersand is escaped in html",
    created.html.includes("&amp; Co"),
  );
  check(
    "no CSS custom properties — mail clients cannot resolve them",
    !created.html.includes("var(--"),
  );

  const noUrl = ticketCreatedMail(ticket, null);
  check(
    "without a public url there is no button",
    !noUrl.html.includes("Ticket im Browser"),
  );
  check(
    "…and the reader is told where to look instead",
    noUrl.html.includes("Meine Tickets"),
  );

  const reply = ticketReplyMail(
    ticket,
    { author: "Tim Technik", body: "Zeile eins\nZeile zwei <b>fett</b>" },
    "https://mits.example.invalid/tickets/t-1",
  );
  check("reply body is quoted", reply.html.includes("Zeile eins"));
  check(
    "newlines become <br>, markup does not survive",
    reply.html.includes("Zeile eins<br>Zeile zwei") &&
      reply.html.includes("&lt;b&gt;fett&lt;/b&gt;"),
  );
  check("reply subject carries the number", reply.subject.includes("TICK-1042"));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
