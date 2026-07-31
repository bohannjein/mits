/**
 * Checks the JSON-Schema → zod compiler against the example schemas.
 *
 * The compiler is the part of the form engine with no visible failure mode: a
 * wrong widget or a missing constraint looks like a working form until someone
 * submits bad data. Run with `npm test`.
 */
import {
  cascadedValues,
  conditionCycles,
  danglingConditions,
  defaultValuesFor,
  hiddenFieldNames,
  resolveFields,
  resolveFieldsFor,
  schemaToZod,
} from "../src/lib/forms/schema-to-zod";
import {
  HARDWARE_ORDER_SCHEMA,
  QUICK_TICKET_SCHEMA,
  SECURITY_INCIDENT_SCHEMA,
  SOFTWARE_ACCESS_SCHEMA,
  USER_ONBOARDING_SCHEMA,
} from "../src/lib/mock-schemas";
import { pieSlice, sharePercent } from "../src/lib/chart";
import {
  SEVERITY_TO_PRIORITY,
  classifyDefenderAlert,
  priorityForAlert,
} from "../src/lib/mail/defender";
import { planSecurityIncident } from "../src/lib/mail/incident-rule";
import {
  cleanInboundReply,
  stripQuotePrefixes,
  stripQuotedReply,
} from "../src/lib/mail/quotes";
import {
  hasVisibleContent,
  sanitizeRichText,
  uploadIdsInHtml,
} from "../src/lib/sanitize";
import { ticketCreatedMail, ticketReplyMail } from "../src/lib/mail-templates";
import {
  SYSTEM_TIMEZONES,
  formatDateTime,
  formatDateTimeShort,
  formatOffsetMs,
  isValidTimezone,
  timezoneOffsetLabel,
} from "../src/lib/format";
import {
  DEFAULT_PORTAL_FAQS,
  KEEP_SMTP_PASSWORD,
  type MITSFormSchema,
  MITSTicketSchema,
  PORTAL_WIDGET_ORDER,
  PRESENCE_IDLE_AFTER_SECONDS,
  PRESENCE_OFFLINE_AFTER_SECONDS,
  TICKET_PRIORITY_LABELS,
  TicketPriority,
  TicketPriorityValues,
  isElevatedPriority,
  presenceStateFor,
  PortalConfigSchema,
  PortalFaqSchema,
  AuditAction,
  AuditEntrySchema,
  DataSettingsSchema,
  RETENTION_YEAR_CHOICES,
  UPLOAD_SIZE_CHOICES,
  auditLabel,
  formatBytes,
  CUSTOMER_PROFILE_FIELDS,
  EMPTY_USER_PROFILE,
  MITSUserProfileSchema,
  NO_LOCATION,
  isWebsiteUrl,
  normaliseWebsite,
  REFRESH_FOLLOW_GLOBAL,
  REFRESH_INTERVALS,
  REFRESH_LABELS,
  SystemSettingsSchema,
  isRefreshInterval,
  toRefreshInterval,
  clockHealth,
  isValidNtpHost,
  fillPortalText,
  formatFileSize,
  isImageAttachment,
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
    // Seventeen digits: past the display width, and past what a JS number holds
    // exactly. Sixteen is accepted, this is not.
    "12345678901234567",
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
  check(
    "a number renders padded to sixteen digits",
    formatTicketNumber(1042) === "0000000000001042",
    formatTicketNumber(1042),
  );
  check(
    "the first ticket is all zeros but one",
    formatTicketNumber(1) === "0000000000000001",
    formatTicketNumber(1),
  );
  check(
    "the padded form parses back",
    parseTicketNumber("0000000000001042") === 1042,
    "copy-paste out of a mail is now the common path",
  );
  check(
    "a bare number still parses",
    parseTicketNumber("1042") === 1042,
  );
  check(
    "the retired TICK- form is still accepted",
    parseTicketNumber("TICK-1042") === 1042 &&
      parseTicketNumber("tick 1042") === 1042,
    "sent mail and written-down numbers carry it",
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Presence thresholds.

   The two boundaries are the entire behaviour. An off-by-one here shows a
   colleague as available when they left half an hour ago, or as gone while they
   are typing — and neither looks wrong on screen.
   ────────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────
   Priority rename.

   `normal` became `medium` and `urgent` became `critical`. The database migration
   in lib/db/sqlite.ts rewrites stored rows, but `MITSTicketSchema.priority` is the
   enum — a row the migration never reached would throw on read and take a whole
   listing with it. The preprocess is the guard against that; these checks are what
   keep it.
   ────────────────────────────────────────────────────────────────────────── */

console.log("priority rename");
{
  const parse = (value: string) => TicketPriority.safeParse(value);

  check("medium is accepted", parse("medium").data === "medium");
  check("critical is accepted", parse("critical").data === "critical");
  check("low and high are unchanged", parse("low").data === "low" && parse("high").data === "high");
  check("legacy normal maps to medium", parse("normal").data === "medium");
  check("legacy urgent maps to critical", parse("critical").data === "critical" && parse("urgent").data === "critical");
  check("nonsense is still rejected", !parse("panisch").success);
  check(
    "a ticket row carrying a legacy value still parses",
    MITSTicketSchema.parse({
      id: "t-legacy",
      source: "legacy",
      title: "Alt",
      payload: {},
      status: "open",
      priority: "urgent",
      created_by: "u",
      created_by_email: "u@example.invalid",
      created_at: "2026-01-01T00:00:00.000Z",
    }).priority === "critical",
  );
  check(
    "labels cover every value",
    TicketPriorityValues.every((p) => Boolean(TICKET_PRIORITY_LABELS[p])),
  );
  check(
    "elevated is high and critical only",
    isElevatedPriority("high") &&
      isElevatedPriority("critical") &&
      !isElevatedPriority("medium") &&
      !isElevatedPriority("low"),
  );
}

console.log("presence state");
{
  const now = Date.UTC(2026, 6, 30, 12, 0, 0);
  const agoSeconds = (s: number) => new Date(now - s * 1000);

  check("never seen is offline", presenceStateFor(null, now) === "offline");
  check("just now is active", presenceStateFor(agoSeconds(0), now) === "active");
  check(
    "one second before the idle threshold is still active",
    presenceStateFor(agoSeconds(PRESENCE_IDLE_AFTER_SECONDS - 1), now) === "active",
  );
  check(
    "exactly at the idle threshold is still active",
    presenceStateFor(agoSeconds(PRESENCE_IDLE_AFTER_SECONDS), now) === "active",
  );
  check(
    "one second past it is idle",
    presenceStateFor(agoSeconds(PRESENCE_IDLE_AFTER_SECONDS + 1), now) === "idle",
  );
  check(
    "exactly at the offline threshold is still idle",
    presenceStateFor(agoSeconds(PRESENCE_OFFLINE_AFTER_SECONDS), now) === "idle",
  );
  check(
    "one second past it is offline",
    presenceStateFor(agoSeconds(PRESENCE_OFFLINE_AFTER_SECONDS + 1), now) ===
      "offline",
  );
  check(
    "a day ago is offline",
    presenceStateFor(agoSeconds(86_400), now) === "offline",
  );
  check(
    "a future timestamp counts as just-seen, not as wrapped-around",
    presenceStateFor(new Date(now + 60_000), now) === "active",
  );
  check(
    "the heartbeat beats at least twice per idle window",
    PRESENCE_IDLE_AFTER_SECONDS / 2 < PRESENCE_IDLE_AFTER_SECONDS,
  );
  check(
    "idle comes before offline",
    PRESENCE_IDLE_AFTER_SECONDS < PRESENCE_OFFLINE_AFTER_SECONDS,
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
  /*
   * The bracketed form, not just the digits. The bracket is what makes the number
   * findable in a reply subject once inbound mail is wired up — asserting only "1042"
   * would pass on a subject that merely happened to contain those digits.
   */
  check(
    "subject carries the padded number in brackets",
    created.subject.includes("[0000000000001042]"),
    created.subject,
  );
  check("html carries the number", created.html.includes("0000000000001042"));
  check(
    "the retired prefix is gone from the subject",
    !created.subject.includes("TICK"),
  );
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
  check(
    "reply subject carries the number",
    reply.subject.includes("[0000000000001042]"),
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Conditional fields and cascading choices.

   None of these has a visible failure mode. A condition that resolves the wrong
   way produces a form that renders fine and either demands a field nobody can see
   or accepts an answer to a question it never asked.
   ────────────────────────────────────────────────────────────────────────── */

const CONDITIONAL_SCHEMA: MITSFormSchema = {
  id: "conditional-test",
  title: "Bedingungen",
  category: "Test",
  version: 1,
  schema: {
    type: "object",
    // `serial` is required *and* conditional: the combination is the one that
    // makes a form unsubmittable when the server does not re-derive visibility.
    required: ["device_kind", "device_model", "serial"],
    properties: {
      device_kind: {
        type: "string",
        title: "Gerätetyp",
        enum: ["laptop", "monitor"],
      },
      device_model: {
        type: "string",
        title: "Modell",
        enum: ["xps-13", "t14", "u2723"],
      },
      serial: { type: "string", title: "Seriennummer", maxLength: 40 },
      warranty: { type: "boolean", title: "Garantiefall" },
      warranty_note: { type: "string", title: "Hinweis", maxLength: 200 },
      warranty_ref: { type: "string", title: "RMA-Nummer", maxLength: 40 },
    },
  },
  uiHints: {
    device_model: {
      optionsFrom: {
        field: "device_kind",
        map: { laptop: ["xps-13", "t14"], monitor: ["u2723"] },
      },
    },
    serial: { visibleWhen: { field: "device_kind", equals: ["laptop"] } },
    warranty_note: { visibleWhen: { field: "warranty", equals: ["true"] } },
    // Depends on a field that is itself conditional — the fixpoint case.
    warranty_ref: { visibleWhen: { field: "warranty_note", equals: ["rma"] } },
  },
};

console.log("\nconditional visibility");
{
  const hidden = (values: Record<string, unknown>) =>
    hiddenFieldNames(CONDITIONAL_SCHEMA, values);

  check(
    "unanswered controller hides the dependent field",
    hidden({}).has("serial"),
  );
  check(
    "matching answer shows it",
    !hidden({ device_kind: "laptop" }).has("serial"),
  );
  check(
    "non-matching answer hides it again",
    hidden({ device_kind: "monitor" }).has("serial"),
  );
  check(
    "booleans compare as \"true\"",
    !hidden({ warranty: true }).has("warranty_note") &&
      hidden({ warranty: false }).has("warranty_note"),
  );
  check(
    "empty string does not satisfy a condition",
    hidden({ device_kind: "" }).has("serial"),
  );

  // The one that matters: warranty_note's own answer matches, but the question was
  // never asked, so nothing may depend on it.
  check(
    "a hidden controller does not count as a match",
    hidden({ warranty: false, warranty_note: "rma" }).has("warranty_ref"),
  );
  check(
    "…and it does once the chain is visible",
    !hidden({ warranty: true, warranty_note: "rma" }).has("warranty_ref"),
  );

  const cyclic: MITSFormSchema = {
    ...CONDITIONAL_SCHEMA,
    id: "cyclic-test",
    schema: {
      type: "object",
      properties: {
        a: { type: "string", title: "A" },
        b: { type: "string", title: "B" },
      },
    },
    uiHints: {
      a: { visibleWhen: { field: "b", equals: ["x"] } },
      b: { visibleWhen: { field: "a", equals: ["x"] } },
    },
  };
  /*
   * A cycle terminates instead of spinning. Which way it settles depends on the
   * answers: with every condition met the ring is a stable visible state, with any
   * one unmet the whole ring disappears. That ambiguity is exactly why
   * `conditionCycles` refuses the schema at save time — see below.
   */
  const satisfied = hiddenFieldNames(cyclic, { a: "x", b: "x" });
  check(
    "a satisfied cycle terminates and stays visible",
    !satisfied.has("a") && !satisfied.has("b"),
  );
  const broken = hiddenFieldNames(cyclic, { a: "x", b: "" });
  check(
    "…and an ungrounded one hides the whole chain",
    broken.has("a") && broken.has("b"),
  );
  check(
    "the cycle is reported so it can be refused",
    conditionCycles(cyclic).length === 1,
    conditionCycles(cyclic).join(" | "),
  );
  check(
    "a sound schema reports no cycle",
    conditionCycles(CONDITIONAL_SCHEMA).length === 0,
    conditionCycles(CONDITIONAL_SCHEMA).join(" | "),
  );
  check(
    "a field whose condition points at itself is a cycle",
    conditionCycles({
      ...cyclic,
      id: "self-cycle-test",
      uiHints: { a: { visibleWhen: { field: "a", equals: ["x"] } } },
    }).length === 1,
  );

  check(
    "a sound schema reports no dangling conditions",
    danglingConditions(CONDITIONAL_SCHEMA).length === 0,
  );
  check(
    "a condition on a missing field is reported",
    danglingConditions({
      ...cyclic,
      id: "dangling-test",
      uiHints: { a: { visibleWhen: { field: "gone", equals: ["x"] } } },
    }).join("") === "a → gone",
  );
  check(
    "a cascade on a missing field is reported too",
    danglingConditions({
      ...cyclic,
      id: "dangling-cascade-test",
      uiHints: { a: { optionsFrom: { field: "gone", map: {} } } },
    }).length === 1,
  );

  const empty: MITSFormSchema = {
    ...cyclic,
    id: "empty-condition-test",
    uiHints: { a: { visibleWhen: { field: "b", equals: [] } } },
  };
  check(
    "a condition with no values never shows",
    hiddenFieldNames(empty, { b: "anything" }).has("a"),
  );

  const multi: MITSFormSchema = {
    ...cyclic,
    id: "multi-controller-test",
    schema: {
      type: "object",
      properties: {
        tags: { type: "array", title: "Tags", items: { type: "string" } },
        detail: { type: "string", title: "Detail" },
      },
    },
    uiHints: { detail: { visibleWhen: { field: "tags", equals: ["vpn"] } } },
  };
  check(
    "an array controller matches on any selected entry",
    !hiddenFieldNames(multi, { tags: ["wlan", "vpn"] }).has("detail") &&
      hiddenFieldNames(multi, { tags: ["wlan"] }).has("detail"),
  );
}

console.log("\ncascading options");
{
  const modelHint = CONDITIONAL_SCHEMA.uiHints!.device_model;

  check(
    "no parent answer yields no choices",
    cascadedValues(modelHint, {})?.length === 0,
  );
  check(
    "parent narrows the choices",
    cascadedValues(modelHint, { device_kind: "laptop" })?.join(",") ===
      "xps-13,t14",
  );
  check(
    "an unmapped parent value yields none",
    cascadedValues(modelHint, { device_kind: "tablet" })?.length === 0,
  );
  check(
    "a field without a cascade is left alone",
    cascadedValues({}, { device_kind: "laptop" }) === undefined,
  );

  const narrowed = resolveFieldsFor(CONDITIONAL_SCHEMA, {
    device_kind: "monitor",
  });
  const model = narrowed.find((field) => field.name === "device_model");
  check(
    "resolveFieldsFor rewrites the options",
    model?.options?.map((option) => option.value).join(",") === "u2723",
  );
  check(
    "…and drops the fields the conditions hid",
    !narrowed.some((field) => field.name === "serial"),
  );

  const all = resolveFields(CONDITIONAL_SCHEMA);
  check(
    "without answers every field applies and keeps its declared enum",
    all.length === 6 &&
      all
        .find((field) => field.name === "device_model")
        ?.options?.length === 3,
  );
}

console.log("\nconditional validation");
{
  // With answers: serial is behind a condition that does not hold, so it is
  // neither demanded nor accepted.
  const monitor = { device_kind: "monitor", device_model: "u2723" };

  check(
    "a hidden required field is not demanded",
    schemaToZod(CONDITIONAL_SCHEMA, { values: monitor }).safeParse(monitor)
      .success,
  );
  check(
    "an answer to a hidden field is rejected",
    !schemaToZod(CONDITIONAL_SCHEMA, {
      values: { ...monitor, serial: "SN-1" },
    }).safeParse({ ...monitor, serial: "SN-1" }).success,
  );
  check(
    "a visible required field is still demanded",
    !schemaToZod(CONDITIONAL_SCHEMA, {
      values: { device_kind: "laptop", device_model: "t14" },
    }).safeParse({ device_kind: "laptop", device_model: "t14" }).success,
  );
  check(
    "…and passes once it is answered",
    schemaToZod(CONDITIONAL_SCHEMA, {
      values: { device_kind: "laptop", device_model: "t14", serial: "SN-1" },
    }).safeParse({ device_kind: "laptop", device_model: "t14", serial: "SN-1" })
      .success,
  );

  // The cascade is enforced, not just displayed: t14 is a laptop model and must
  // not survive on a monitor.
  check(
    "a child value the parent does not permit is rejected",
    !schemaToZod(CONDITIONAL_SCHEMA, {
      values: { device_kind: "monitor", device_model: "t14" },
    }).safeParse({ device_kind: "monitor", device_model: "t14" }).success,
  );

  // Without `values` nothing has been ruled out — this is the shape the admin-side
  // schema check and the label lookups compile.
  check(
    "without values the conditional field is required again",
    !schemaToZod(CONDITIONAL_SCHEMA).safeParse(monitor).success,
  );

  /*
   * What <SchemaForm>'s resolver does, without React in the way.
   *
   * The form holds an entry for every declared field — `defaultValuesFor` seeds
   * them all — so the answers it validates always contain the hidden ones too. The
   * compiled shape omits those, and `strictObject` rejects unrecognised keys, so
   * the values have to be reduced to the applicable fields *before* they reach zod.
   * Skip that and a form is unsubmittable the moment any field is conditional —
   * which nothing reveals until somebody presses the button.
   */
  const asTheFormHoldsIt: Record<string, unknown> = {
    device_kind: "monitor",
    device_model: "u2723",
    serial: "",
    warranty: false,
    warranty_note: "",
    warranty_ref: "",
  };
  const applicable = resolveFieldsFor(CONDITIONAL_SCHEMA, asTheFormHoldsIt);
  const stripped = Object.fromEntries(
    applicable.map((field) => [field.name, asTheFormHoldsIt[field.name]]),
  );

  check(
    "stripping the hidden answers first is what makes the form submittable",
    schemaToZod(CONDITIONAL_SCHEMA, { values: asTheFormHoldsIt }).safeParse(
      stripped,
    ).success,
  );
  check(
    "…and handing zod the untouched form state fails",
    !schemaToZod(CONDITIONAL_SCHEMA, { values: asTheFormHoldsIt }).safeParse(
      asTheFormHoldsIt,
    ).success,
  );
  check(
    "the stripped payload keeps only what was asked",
    Object.keys(stripped).sort().join(",") ===
      "device_kind,device_model,warranty",
  );
}

console.log("\nnew widgets");
{
  const byName = Object.fromEntries(
    resolveFields({
      id: "widget-test",
      title: "Widgets",
      category: "Test",
      version: 1,
      schema: {
        type: "object",
        properties: {
          when: { type: "string", title: "Zeitpunkt", format: "date-time" },
          day: { type: "string", title: "Tag", format: "date" },
          site: { type: "string", title: "Standort" },
          person: { type: "string", title: "Person" },
        },
      },
      uiHints: { site: { widget: "location" }, person: { widget: "user" } },
    }).map((field) => [field.name, field]),
  );

  check("date-time -> datetime", byName.when.widget === "datetime");
  check("date stays date", byName.day.widget === "date");
  check("location hint wins", byName.site.widget === "location");
  check("user hint wins", byName.person.widget === "user");

  // "Every widget has a renderer" is not checked here: FIELD_REGISTRY is typed
  // `Record<MITSFieldWidget, …>`, so `npm run typecheck` already fails on a widget
  // without one — a stronger guarantee than a runtime count, and the registry is a
  // "use client" module this offline script cannot import anyway.

  check(
    "location and user compile to a plain string, not an enum",
    schemaToZod({
      id: "picker-test",
      title: "Picker",
      category: "Test",
      version: 1,
      schema: {
        type: "object",
        required: ["site"],
        properties: { site: { type: "string", title: "Standort" } },
      },
      uiHints: { site: { widget: "location" } },
      // An id read live from mits_location must keep validating after the site is
      // renamed — an enum frozen at authoring time would invalidate stored payloads.
    }).safeParse({ site: "loc-anything-at-all" }).success,
  );
}

console.log("\nfaq attachments");
{
  check("bytes stay bytes", formatFileSize(840) === "840 B");
  check("kilobytes round", formatFileSize(320_000) === "313 KB");
  check(
    "megabytes get a german decimal comma",
    formatFileSize(1_500_000) === "1,4 MB",
    formatFileSize(1_500_000),
  );

  const png = { fileId: "a", name: "screenshot.png", size: 1, type: "image/png" };
  const pdf = { fileId: "b", name: "handbuch.pdf", size: 1, type: "application/pdf" };

  check("a png renders inline", isImageAttachment(png));
  check("a pdf does not", !isImageAttachment(pdf));
  check(
    "an svg is never inline — it can carry script",
    !isImageAttachment({ ...png, name: "logo.svg", type: "image/svg+xml" }),
  );
  check(
    "an unknown type is not inline",
    !isImageAttachment({ ...png, type: "" }),
  );

  /*
   * Entries written before attachments existed have to keep parsing. Without the
   * default, one stored FAQ row would fail the array parse and `getPortalFaqs`
   * would fall back to the built-in list — the admin's articles would silently be
   * replaced by the sample ones, which looks like a portal nobody configured.
   */
  const legacy = PortalFaqSchema.safeParse({
    id: "old",
    question: "Frage?",
    answer: "Antwort.",
    category: "",
    order_index: 0,
  });
  check(
    "a faq row without attachments still parses",
    legacy.success && legacy.data.attachments.length === 0,
  );
}

console.log("\ntimezone and clock");
{
  // Fixed instant: 2026-07-31T12:00:00Z. Berlin is UTC+2 in July, so a formatter
  // that ignored the zone would render 12:00 and pass nothing here.
  const instant = new Date("2026-07-31T12:00:00.000Z");

  check(
    "formatting honours the given zone",
    formatDateTime(instant, "Europe/Berlin").includes("14:00"),
    formatDateTime(instant, "Europe/Berlin"),
  );
  check(
    "…and a different zone gives a different time",
    formatDateTime(instant, "UTC").includes("12:00"),
    formatDateTime(instant, "UTC"),
  );
  check(
    "short format stays short",
    formatDateTimeShort(instant, "Europe/Berlin") === "31.07.26, 14:00",
    formatDateTimeShort(instant, "Europe/Berlin"),
  );

  check("a real zone is accepted", isValidTimezone("Europe/Berlin"));
  check("UTC is accepted", isValidTimezone("UTC"));
  check("nonsense is refused", !isValidTimezone("Europe/Berlyn"));
  check("empty is refused", !isValidTimezone("   "));
  check(
    "every offered zone is one the runtime knows",
    SYSTEM_TIMEZONES.every(isValidTimezone),
    SYSTEM_TIMEZONES.filter((zone) => !isValidTimezone(zone)).join(","),
  );

  check(
    "summer offset is reported, not the standard one",
    timezoneOffsetLabel("Europe/Berlin", instant) === "UTC+02:00",
    timezoneOffsetLabel("Europe/Berlin", instant),
  );
  check(
    "…and winter differs",
    timezoneOffsetLabel("Europe/Berlin", new Date("2026-01-15T12:00:00Z")) ===
      "UTC+01:00",
  );
  check(
    "zero offset is spelled out rather than left as GMT",
    timezoneOffsetLabel("UTC", instant) === "UTC+00:00",
    timezoneOffsetLabel("UTC", instant),
  );

  check("sub-second offsets stay in ms", formatOffsetMs(412) === "+412 ms");
  check(
    "a negative offset keeps its sign",
    formatOffsetMs(-1300) === "−1,3 s",
    formatOffsetMs(-1300),
  );

  check("a small offset is healthy", clockHealth(500) === "ok");
  check("a few seconds warns", clockHealth(5000) === "warn");
  check("half a minute is critical", clockHealth(-45_000) === "critical");
  check(
    "health ignores the direction",
    clockHealth(-5000) === clockHealth(5000),
  );

  check("a hostname is accepted", isValidNtpHost("pool.ntp.org"));
  check("an ip literal is accepted", isValidNtpHost("192.168.1.1"));
  check("a scheme is refused", !isValidNtpHost("http://pool.ntp.org"));
  check("a port is refused", !isValidNtpHost("pool.ntp.org:123"));
  check("a shell metacharacter is refused", !isValidNtpHost("pool.ntp.org; ls"));
  check("empty is refused", !isValidNtpHost(""));
}

console.log("\npie geometry");
{
  const R = 64;
  const C = 66;

  /*
   * Both ends of the range are degenerate and neither is visible in a screenshot
   * review: at 100 % the arc's start and end points coincide, so an SVG arc between
   * them draws nothing, and the widget would show an empty box for "everything
   * closed". At 0 % there is no slice to draw at all.
   */
  const none = pieSlice(0, R, C);
  check("an empty slice has no path", none.path === null && !none.full);

  const all = pieSlice(1, R, C);
  check(
    "a full slice is flagged instead of being drawn as an arc",
    all.path === null && all.full,
  );
  check("…and over 1 is clamped to full", pieSlice(1.2, R, C).full);
  check("…and below 0 is clamped to empty", pieSlice(-0.3, R, C).path === null);

  const half = pieSlice(0.5, R, C);
  check("a half slice has a path", half.path !== null);
  check(
    "a half slice takes the short arc",
    half.path?.includes(`A ${R} ${R} 0 0 1`) === true,
    half.path ?? "",
  );
  check(
    "a three-quarter slice takes the long arc",
    pieSlice(0.75, R, C).path?.includes(`A ${R} ${R} 0 1 1`) === true,
    pieSlice(0.75, R, C).path ?? "",
  );
  check(
    "every slice starts at twelve o'clock",
    half.path?.startsWith(`M ${C} ${C} L ${C}.000 ${C - R}.000`) === true,
    half.path ?? "",
  );

  check("a share is whole percent", sharePercent(1, 3) === 33);
  check("a full share is 100", sharePercent(4, 4) === 100);
  check(
    "no total means no percentage is claimed",
    sharePercent(0, 0) === null,
  );
}

console.log("\nrefresh interval");
{
  check("the default is one of the offered values", isRefreshInterval(3));
  check("off is a legal value", isRefreshInterval(0));
  check("an unoffered number is refused", !isRefreshInterval(2));
  check("a string is refused", !isRefreshInterval("3"));
  check(
    "every offered interval has a label",
    REFRESH_INTERVALS.every((interval) => REFRESH_LABELS[interval] !== undefined),
  );

  // The form posts strings; anything unusable has to land on the default rather
  // than disabling the timer or setting an absurd rate.
  check("a form string is parsed", toRefreshInterval("5") === 5);
  check("zero survives the parse", toRefreshInterval("0") === 0);
  check("nonsense falls back", toRefreshInterval("bogus") === 3);
  check("an unoffered number falls back", toRefreshInterval("7") === 3);
  check("undefined falls back", toRefreshInterval(undefined) === 3);
  check(
    "the fallback is overridable",
    toRefreshInterval("bogus", 10) === 10,
  );

  /*
   * A stored settings row from an older build has no `refreshMinutes`. It has to
   * default rather than fail the parse: a failed parse discards the whole object,
   * so the timezone and the NTP host would be lost with it.
   */
  const legacy = SystemSettingsSchema.safeParse({
    timezone: "Europe/Berlin",
    ntpHost: "pool.ntp.org",
  });
  check(
    "a settings row without the field still parses",
    legacy.success && legacy.data.refreshMinutes === 3,
  );

  const garbage = SystemSettingsSchema.safeParse({
    timezone: "Europe/Berlin",
    ntpHost: "pool.ntp.org",
    refreshMinutes: "every so often",
  });
  check(
    "…and a garbage value does not take the rest down with it",
    garbage.success &&
      garbage.data.refreshMinutes === 3 &&
      garbage.data.timezone === "Europe/Berlin",
  );

  check(
    "the follow-global sentinel is not a valid interval",
    !isRefreshInterval(Number(REFRESH_FOLLOW_GLOBAL)),
  );
}

console.log("\nrich-text sanitising");
{
  const clean = (input: string) => sanitizeRichText(input).html;

  // The point of the module. Each of these is a way to run code in our own origin,
  // and each would land in a ticket bubble rendered with dangerouslySetInnerHTML.
  check("script is dropped with its content", !/alert/.test(clean("<script>alert(1)</script>")));
  check(
    "an event handler is stripped",
    !/onerror/i.test(clean('<img src="/api/uploads/a" onerror="alert(1)">')),
  );
  check(
    "javascript: in an href is refused",
    !/javascript:/i.test(clean('<a href="javascript:alert(1)">x</a>')),
  );
  check(
    "style attributes are stripped",
    !/style=/i.test(clean('<p style="position:fixed;inset:0">x</p>')),
  );
  check("style elements are dropped", !/display/.test(clean("<style>body{display:none}</style>")));
  check("iframes are dropped", !/<iframe/i.test(clean('<iframe src="https://x.invalid"></iframe>')));
  check("svg is dropped", !/<svg/i.test(clean("<svg><script>alert(1)</script></svg>")));
  check(
    "form elements are dropped",
    !/<form|<input/i.test(clean('<form action="https://x.invalid"><input name="p"></form>')),
  );

  // Formatting the toolbar produces has to survive, or the editor is pointless.
  check("bold survives", /<strong>/.test(clean("<p><strong>fett</strong></p>")));
  check("lists survive", /<ul>/.test(clean("<ul><li>a</li></ul>")));
  check("code blocks survive", /<pre>/.test(clean("<pre><code>x</code></pre>")));
  check("blockquotes survive", /<blockquote>/.test(clean("<blockquote>x</blockquote>")));
  check(
    "tables survive a mailed-in reply",
    /<table>/.test(clean("<table><tr><td>a</td></tr></table>")),
  );

  const link = clean('<a href="https://example.invalid">x</a>');
  check("an allowed link survives", link.includes('href="https://example.invalid"'));
  check(
    "…and opens detached",
    link.includes('rel="noopener noreferrer nofollow"') && link.includes('target="_blank"'),
  );

  // Images: only our own upload route, because a remote one is a tracking pixel that
  // reports back every time an agent opens the ticket.
  check(
    "an upload image survives",
    clean('<img src="/api/uploads/abc-123?inline=1">').includes(
      'src="/api/uploads/abc-123?inline=1"',
    ),
  );
  check(
    "a remote image is removed",
    !/<img/.test(clean('<img src="https://tracker.invalid/p.gif">')),
  );
  check(
    "…and it is reported so the UI can say so",
    sanitizeRichText('<img src="https://tracker.invalid/p.gif">').removedRemoteImages,
  );
  check(
    "a data: image is removed",
    !/<img/.test(clean('<img src="data:image/png;base64,iVBORw0KGgo=">')),
  );
  check(
    "a path that only looks like an upload is removed",
    !/<img/.test(clean('<img src="/api/uploads/../../etc/passwd">')),
  );

  // Emptiness is judged after cleaning: a body that was only a tracking pixel has
  // nothing left, and storing it would show an empty bubble.
  check(
    "a tracking-pixel-only body counts as empty",
    !hasVisibleContent(clean('<img src="https://x.invalid/p.gif">')),
  );
  check(
    "a surviving image counts as content",
    hasVisibleContent(clean('<img src="/api/uploads/a">')),
  );
  check("whitespace-only markup counts as empty", !hasVisibleContent("<p> </p>"));
  check("text counts as content", hasVisibleContent("<p>hallo</p>"));

  // The ids are read back out of the stored markup, which is what binds the images to
  // the ticket so a reporter can see an agent's screenshot.
  check(
    "embedded upload ids are found",
    uploadIdsInHtml('<img src="/api/uploads/aaa?inline=1"><img src="/api/uploads/bbb">')
      .join(",") === "aaa,bbb",
  );
  check(
    "the same image twice yields one id",
    uploadIdsInHtml('<img src="/api/uploads/aaa"><img src="/api/uploads/aaa">').length === 1,
  );
  check("no images yields none", uploadIdsInHtml("<p>x</p>").length === 0);
}

console.log("\ncustomer profile");
{
  // A reporter's website ends up as a link a technician clicks, so the scheme check
  // is the load-bearing part. Stricter than isSafeResourceHref on purpose: that one
  // also accepts a site-relative path, which here would point at our own pages.
  check("https with a domain is accepted", isWebsiteUrl("https://example.de"));
  check("http is accepted", isWebsiteUrl("http://example.de/pfad"));
  check("javascript: is refused", !isWebsiteUrl("javascript:alert(1)"));
  check("data: is refused", !isWebsiteUrl("data:text/html,<script>alert(1)</script>"));
  check("file: is refused", !isWebsiteUrl("file:///etc/passwd"));
  check("a site-relative path is refused", !isWebsiteUrl("/admin"));
  check("a protocol-relative url is refused", !isWebsiteUrl("//evil.invalid"));
  check("a host without a dot is refused", !isWebsiteUrl("http://localhost"));
  check("empty is refused", !isWebsiteUrl("   "));

  // Typing the scheme is not something to demand of a reporter.
  check("a bare domain gains https", normaliseWebsite("example.de") === "https://example.de");
  check("an existing scheme is left alone", normaliseWebsite("http://example.de") === "http://example.de");
  check("empty stays empty", normaliseWebsite("  ") === "");
  check(
    "normalising does not rescue a bad scheme",
    !isWebsiteUrl(normaliseWebsite("javascript:alert(1)")),
  );

  // Every declared field must exist on the schema, or the form would render an input
  // whose value is dropped on save without anything looking wrong.
  const empty = EMPTY_USER_PROFILE as Record<string, unknown>;
  check(
    "every declared field exists in the schema",
    CUSTOMER_PROFILE_FIELDS.every((field) => field.key in empty),
    CUSTOMER_PROFILE_FIELDS.filter((field) => !(field.key in empty))
      .map((field) => field.key)
      .join(","),
  );
  check(
    "the empty profile has no location",
    EMPTY_USER_PROFILE.location_id === null,
  );

  // A row written before a later column existed has to parse, or the settings page
  // and the ticket sidebar would both fail to render.
  const legacy = MITSUserProfileSchema.safeParse({ city: "Hamburg" });
  check(
    "a partial row parses and defaults the rest",
    legacy.success && legacy.data.city === "Hamburg" && legacy.data.website === "",
  );
  check(
    "the location sentinel is not a usable id",
    NO_LOCATION.startsWith("__"),
  );
}

console.log("\ndefender alert recognition");
{
  const REAL_ALERT = [
    "Microsoft Defender for Endpoint",
    "",
    "Severity: High",
    "Device name: NB-VERTRIEB-07",
    "Alert title: Suspicious PowerShell execution",
    "Incident ID: 40912",
    "",
    "Diese E-Mail wurde automatisch versendet.",
  ].join("\n");

  const alert = classifyDefenderAlert({
    from: "security-noreply@microsoft.com",
    subject: "[Defender Alert] High severity alert on NB-VERTRIEB-07",
    text: REAL_ALERT,
  });

  check("a genuine alert is recognised", alert !== null);
  check("the sender is credited", alert?.matchedOn.includes("sender") === true);
  check("so is the subject", alert?.matchedOn.includes("subject") === true);
  check("severity is read", alert?.severity === "high", String(alert?.severity));
  check("host is read", alert?.host === "NB-VERTRIEB-07", alert?.host);
  check(
    "alert title comes from the body label",
    alert?.alertTitle === "Suspicious PowerShell execution",
    alert?.alertTitle,
  );
  check("incident number is read", alert?.incidentId === "40912", alert?.incidentId);

  // A forwarded alert loses the Microsoft sender but keeps the subject. Missing these
  // is the expensive direction: a real alert sitting in the queue as ordinary mail.
  const forwarded = classifyDefenderAlert({
    from: "it-verteiler@firma.de",
    subject: "WG: [Defender Alert] Critical severity alert",
    text: "Schweregrad: Kritisch\nGerät: SRV-DC-01",
  });
  check("a forwarded alert is still recognised", forwarded !== null);
  check("…on the subject alone", forwarded?.matchedOn.join() === "subject");
  check(
    "german severity is read",
    forwarded?.severity === "critical",
    String(forwarded?.severity),
  );
  check("german host label is read", forwarded?.host === "SRV-DC-01", forwarded?.host);

  // The other expensive direction: escalating something that is not an alert.
  check(
    "an ordinary mail is not an alert",
    classifyDefenderAlert({
      from: "kollege@firma.de",
      subject: "Drucker Etage 3 offline",
      text: "Der Drucker ist seit heute Morgen nicht erreichbar.",
    }) === null,
  );
  check(
    "a lookalike domain is refused",
    classifyDefenderAlert({
      from: "noreply@microsoft.com.evil.example",
      subject: "Rechnung",
      text: "",
    }) === null,
  );
  check(
    "a similar domain is refused",
    classifyDefenderAlert({
      from: "x@notmicrosoft.com",
      subject: "Newsletter",
      text: "",
    }) === null,
  );
  check(
    "a mail merely quoting an alert is not one",
    classifyDefenderAlert({
      from: "kollege@firma.de",
      subject: "Frage zu einem Alert",
      text: "Severity: High\nWas bedeutet das?",
    }) === null,
    "body text must never decide",
  );

  // The labelled field has to beat the word appearing in prose.
  const prose = classifyDefenderAlert({
    from: "security-noreply@microsoft.com",
    subject: "Microsoft Defender notification",
    text: "This is a critical business system.\nSeverity: Low\nDevice: PC-42",
  });
  check(
    "the labelled severity beats the word in prose",
    prose?.severity === "low",
    String(prose?.severity),
  );

  // "Device name" must win over the bare "Device" label.
  const both = classifyDefenderAlert({
    from: "security-noreply@microsoft.com",
    subject: "Defender Alert",
    text: "Device: wrong\nDevice name: RIGHT-01",
  });
  check("the more specific host label wins", both?.host === "RIGHT-01", both?.host);

  // Severity to priority. Medium must not collapse to low, or a finding gets buried
  // under a printer request.
  check("critical maps to critical", SEVERITY_TO_PRIORITY.critical === "critical");
  check("high maps to high", SEVERITY_TO_PRIORITY.high === "high");
  check("medium stays medium", SEVERITY_TO_PRIORITY.medium === "medium");
  check("low does not fall below medium", SEVERITY_TO_PRIORITY.low === "medium");

  const unreadable = classifyDefenderAlert({
    from: "security-noreply@microsoft.com",
    subject: "Microsoft Defender notification",
    text: "Something happened.",
  });
  check(
    "an unreadable severity yields no priority",
    unreadable !== null && priorityForAlert(unreadable) === null,
  );
}

console.log("\nincident rule");
{
  const CONFIG = {
    enabled: true,
    onCallUserId: "u-oncall",
    onCallEmail: "security@firma.invalid",
  };

  const plan = planSecurityIncident(
    {
      from: "security-noreply@microsoft.com",
      subject: "[Defender Alert] High severity alert",
      text: "Severity: High\nDevice name: NB-07\nAlert title: Malware detected\n\n--\nMicrosoft",
    },
    CONFIG,
  );

  check("the rule fires", plan !== null);
  check("it targets the security schema", plan?.formSchemaId === "security-incident");
  check("priority comes from the severity", plan?.priority === "high");
  check("and is not marked as assumed", plan?.priorityAssumed === false);
  check("it assigns to the on-call account", plan?.assignTo === "u-oncall");
  check("the payload carries the host", plan?.payload.host === "NB-07");
  check("…and the source", plan?.payload.source === "defender");
  check(
    "the footer is stripped from the detail",
    typeof plan?.payload.detail === "string" &&
      !(plan.payload.detail as string).includes("Microsoft"),
    String(plan?.payload.detail),
  );

  // A recognised alert with no readable severity is still urgent, and the plan has to
  // say the value was assumed so nobody reads it as a value Defender supplied.
  const assumed = planSecurityIncident(
    {
      from: "security-noreply@microsoft.com",
      subject: "Microsoft Defender notification",
      text: "Etwas ist passiert.",
    },
    CONFIG,
  );
  check("an unreadable severity still escalates", assumed?.priority === "high");
  check("…and is flagged as assumed", assumed?.priorityAssumed === true);

  // Without an on-call account the incident is left in the pool rather than pushed at
  // an arbitrary technician.
  const unassigned = planSecurityIncident(
    {
      from: "security-noreply@microsoft.com",
      subject: "Defender Alert",
      text: "Severity: Low",
    },
    { ...CONFIG, onCallUserId: null },
  );
  check("no on-call means unassigned", unassigned?.assignTo === null);
  check(
    "…and the reason says so",
    unassigned?.reasons.some((line) => line.includes("unzugewiesen")) === true,
  );

  check(
    "a disabled rule does not fire",
    planSecurityIncident(
      {
        from: "security-noreply@microsoft.com",
        subject: "Defender Alert",
        text: "Severity: High",
      },
      { ...CONFIG, enabled: false },
    ) === null,
  );
  check(
    "an ordinary mail does not fire",
    planSecurityIncident(
      { from: "kollege@firma.de", subject: "Drucker kaputt", text: "Hilfe" },
      CONFIG,
    ) === null,
  );

  // The plan's payload has to satisfy the schema it names, or the ticket would be
  // rejected at creation with nothing on screen explaining why.
  const payload = plan ? plan.payload : {};
  const compiled = schemaToZod(SECURITY_INCIDENT_SCHEMA, { values: payload }).safeParse(
    payload,
  );
  check(
    "the plan's payload validates against the schema",
    compiled.success,
    JSON.stringify(compiled.error?.issues),
  );
}

console.log("\nreply trimming");
{
  check(
    "an outlook quote is cut",
    stripQuotedReply("Danke!\n\nVon: IT <it@firma.de>\nGesendet: Montag\nAlter Text") ===
      "Danke!",
  );
  check(
    "a gmail quote is cut",
    stripQuotedReply("Passt so.\n\nAm 1. August schrieb IT:\n> alter Text") === "Passt so.",
  );
  check(
    "a signature is cut",
    stripQuotedReply("Kurze Antwort.\n\n--\nJana Berger\nVertrieb") === "Kurze Antwort.",
  );
  check(
    "a german sign-off is cut",
    stripQuotedReply("Erledigt.\n\nMit freundlichen Grüßen\nJana") === "Erledigt.",
  );
  check("quote prefixes are dropped", stripQuotePrefixes("neu\n> alt\n> älter") === "neu");
  check(
    "both passes together",
    cleanInboundReply("Antwort\n> zitat\n\nMit freundlichen Grüßen\nJana") === "Antwort",
  );

  // The conservative half. Losing the answer is a support call; keeping a quote is
  // merely untidy.
  check(
    "a message with no markers is untouched",
    stripQuotedReply("Nur ein Satz ohne alles.") === "Nur ein Satz ohne alles.",
  );
  check(
    "a mail that is nothing but a quote is kept whole",
    stripQuotedReply("Von: IT <it@firma.de>\nAlter Text").includes("Alter Text"),
    "cutting at line 0 would leave nothing",
  );
  check("empty stays empty", cleanInboundReply("   \n  \n") === "");
}

console.log("\ndata settings");
{
  check("bytes stay bytes", formatBytes(840) === "840 B");
  check("kilobytes round", formatBytes(320_000) === "313 KB");
  check("megabytes round", formatBytes(50_000_000) === "48 MB");
  check(
    "gigabytes get a german decimal comma",
    formatBytes(2_500_000_000) === "2,3 GB",
    formatBytes(2_500_000_000),
  );
  check("zero is not empty", formatBytes(0) === "0 B");

  // The upload limit bounds a request body, so a stored nonsense value must land on the
  // default rather than on something a single upload could use to exhaust memory.
  const bad = DataSettingsSchema.safeParse({
    maxUploadMb: 5000,
    retentionYears: 99,
  });
  check(
    "an unoffered upload size is clamped to the default",
    bad.success && bad.data.maxUploadMb === 10,
    String(bad.success ? bad.data.maxUploadMb : "parse failed"),
  );
  check(
    "an unoffered retention span is clamped too",
    bad.success && bad.data.retentionYears === 3,
    String(bad.success ? bad.data.retentionYears : "parse failed"),
  );

  const strings = DataSettingsSchema.safeParse({
    maxUploadMb: "25",
    retentionYears: "5",
  });
  check(
    "form strings are accepted",
    strings.success &&
      strings.data.maxUploadMb === 25 &&
      strings.data.retentionYears === 5,
  );

  // A row written before either field existed has to parse, or the whole page would
  // fall back and silently discard what an admin had set.
  const empty = DataSettingsSchema.safeParse({});
  check(
    "an empty row yields the defaults",
    empty.success && empty.data.maxUploadMb === 10 && empty.data.retentionYears === 3,
  );

  check(
    "every offered upload size has a sane bound",
    UPLOAD_SIZE_CHOICES.every((size) => size >= 1 && size <= 100),
  );
  check(
    "the default upload size is one of the choices",
    (UPLOAD_SIZE_CHOICES as readonly number[]).includes(10),
  );
  check(
    "the default retention span is one of the choices",
    (RETENTION_YEAR_CHOICES as readonly number[]).includes(3),
  );
}

console.log("\naudit entries");
{
  // A future version may write an action this build does not know. The log has to stay
  // readable — one unlabelled row beats a history that refuses to render.
  const unknown = AuditEntrySchema.safeParse({
    id: "a",
    ticket_id: "t",
    actor_id: "u",
    actor_email: "u@firma.invalid",
    action: "something_new",
    created_at: "2026-08-01T10:00:00.000Z",
  });
  check("an unknown action still parses", unknown.success);
  check(
    "…and falls back to its raw name",
    auditLabel("something_new") === "something_new",
  );
  check("a known action is labelled", auditLabel("status_changed") === "Status geändert");
  check(
    "missing value fields default to empty",
    unknown.success && unknown.data.old_value === "" && unknown.data.new_value === "",
  );
  check(
    "every declared action has a label",
    AuditAction.options.every((action) => auditLabel(action) !== action),
    AuditAction.options.filter((action) => auditLabel(action) === action).join(","),
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
