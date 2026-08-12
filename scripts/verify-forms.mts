import { SHORTCUT_GROUPS, isPlainKey, swallowsKeys } from "../src/lib/shortcuts";
import { fillCannedResponse, firstNameOf } from "../src/types/mits";
import {
  QUEUE_COLUMNS,
  QUEUE_COLUMN_LABELS,
  TicketStatus,
  TicketStatusValues,
  WorkflowSettingsSchema,
  describeTicketState,
  hasAutoClose,
  nextStatusAfterReply,
  queueColumnVisible,
  toAutoCloseDays,
  toHiddenQueueColumns,
} from "../src/types/mits";
import {
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  reconnectDelay,
} from "../src/lib/realtime-backoff";
import { collectLinks } from "../src/lib/ticket-resources";
import {
  RETRACT_WINDOW_SECONDS,
  withinRetractWindow,
} from "../src/lib/retract-window";
import { NotificationSettingsSchema, channelConfig } from "../src/types/mits";
import { deterministicDigest } from "../src/lib/notification-digest";
import {
  MORNING_HOUR,
  instantForZonedTime,
  parseLocalDateTime,
  reminderDueAt,
  resolveReminderDue,
} from "../src/lib/reminder-presets";
import {
  KEYWORD_PREFIX_MIN,
  matchTriageRules,
  matchesKeyword,
  triage,
} from "../src/lib/services/auto-triage";
import { TriageRuleSchema } from "../src/types/mits";
import {
  DEFAULT_ROLE_VISIBILITY,
  DEFAULT_VISIBILITY_PRESETS,
  NAV_AREAS,
  NAV_AREA_META,
  PRESET_KEEP_FORMS,
  RESTRICTABLE_ROLES,
  RoleVisibilitySchema,
  VisibilityPresetSchema,
  areasForRole,
  presetRulesFor,
  roleSeesArea,
  roleSeesForm,
} from "../src/types/mits";
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
  BUILTIN_SCHEMAS,
  HARDWARE_ORDER_SCHEMA,
  QUICK_TICKET_SCHEMA,
  SECURITY_INCIDENT_SCHEMA,
  SOFTWARE_ACCESS_SCHEMA,
  USER_ONBOARDING_SCHEMA,
} from "../src/lib/mock-schemas";
import { pieSlice, sharePercent } from "../src/lib/chart";
import {
  clusterTickets,
  related,
  similarity,
  tokenize,
} from "../src/lib/services/ai/similarity";
import { suggestFaqs } from "../src/lib/services/ai/deflection";
import {
  AS_ATTRIBUTE,
  IGNORE_COLUMN,
  guessColumnMapping,
  mappingForSubmit,
} from "../src/lib/csv";
import {
  EXPORT_COLUMNS,
  attributeKeys,
  exportFilename,
  itemsToCsv,
} from "../src/lib/cmdb-export";
import {
  MAX_BUCKETS,
  autoGranularity,
  bucketKey,
  bucketLabel,
  bucketsFor,
  isoWeek,
  resolveRange,
} from "../src/lib/analytics/range";
import { csvCell } from "../src/lib/analytics/export";
import {
  TICKETS_PER_PAGE,
  pageCount,
  pageOffset,
  pagesToShow,
  toPage,
} from "../src/lib/ticket-paging";
import { isRoutingHint, normaliseTags } from "../src/lib/services/ai/tags";
import {
  fieldsBesidesOpening,
  formatPayloadValue,
  isSyntheticOpening,
  openingFieldName,
  openingMessageFor,
  payloadAttachments,
  payloadFields,
} from "../src/lib/ticket-opening";
import {
  ATTRIBUTE_PREFIX,
  CI_IMPORT_TARGETS,
  coerceCIStatus,
  coerceCIType,
  normaliseImportDate,
  parseDelimited,
  parseSeats,
  sniffDelimiter,
} from "../src/lib/csv";
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
  cleanSubject,
  htmlToText,
  isAutomatedMail,
  planIngest,
  sameMailbox,
  ticketNumberFromSubject,
  type InboundMail as InboundMailShape,
} from "../src/lib/mail/inbound-parse";
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
  formatMinutes,
  formatOffsetMs,
  formatRelativeTime,
  isValidTimezone,
  timezoneOffsetLabel,
} from "../src/lib/format";
import {
  MITS_ROLES,
  ROLE_LABELS,
  canViewBoard,
  isRole,
  toRole,
} from "../src/lib/auth/roles";
import {
  DEFAULT_TICKET_SORT,
  SORTABLE_ENUM_COVERAGE,
  SORT_SQL,
  TICKET_SORT_KEYS,
  TICKET_SORT_LABELS,
  nextDirection,
  orderByFor,
  parseTicketSort,
  sortHref,
} from "../src/lib/ticket-sort";
import {
  DEFAULT_PORTAL_FAQS,
  KEEP_SMTP_PASSWORD,
  type MITSFormSchema,
  type MITSTicket,
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
  formatInventoryNumber,
  formatTicketNumber,
  parseInventoryNumber,
  parseTicketNumber,
  resolveSmtpPassword,
  CIRelationKind,
  CIStatus,
  CIType,
  CI_RELATION_INVERSE_LABELS,
  CI_RELATION_LABELS,
  CI_STATUS_LABELS,
  CI_TYPE_LABELS,
  CI_ATTRIBUTE_LIMIT,
  CI_ATTRIBUTE_KEY_MAX,
  CI_ATTRIBUTE_VALUE_MAX,
  LICENCE_EXPIRY_WARN_DAYS,
  MITSConfigurationItemSchema,
  MITSOrganizationSchema,
  expiryState,
  normaliseCIAttributes,
  AISettingsSchema,
  AI_FEATURES,
  AI_FEATURE_META,
  DEFAULT_MAIL_SETTINGS,
  INTAKE_CATEGORIES,
  isAIFeatureOn,
  isAIModelReady,
  providerNeedsKey,
  isMailInboundConfigured,
  organizationIdForEmail,
  parseDurationMinutes,
  seatUsage,
  DEFAULT_S3_SETTINGS,
  MACRO_REPLY_MODE_LABELS,
  MacroReplyMode,
  MacroSchema,
  isS3Configured,
  isS3Endpoint,
  macroIsEmpty,
  normaliseS3Prefix,
  DEFAULT_TICKET_DISPLAY_SETTINGS,
  TICKET_FORM_DISPLAYS,
  TICKET_FORM_DISPLAY_META,
  toTicketFormDisplay,
  CHECKLIST_ITEM_KINDS,
  CHECKLIST_ITEM_KIND_LABELS,
  isChecklistAnswered,
  isChecklistValueFor,
  parseFormSchema,
} from "../src/types/mits";
import {
  EMPTY_BODY_SHA256,
  amzDates,
  canonicalQuery,
  canonicalUri,
  sha256Hex,
  signS3Request,
} from "../src/lib/services/s3-sign";

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
  check("optional attachments not flagged", !errors.includes("attachments"));

  const valid = zod.safeParse({
    title: "Drucker Etage 3 offline",
    description: "Seit heute Morgen ist der Drucker nicht erreichbar, Fehler 0x83.",
    attachments: [],
  });
  check("valid submission passes", valid.success, JSON.stringify(valid.error?.issues));

  const shortTitle = zod.safeParse({
    title: "abc",
    description: "Seit heute Morgen ist der Drucker nicht erreichbar, Fehler 0x83.",
    attachments: [],
  });
  check("minLength on title enforced", !shortTitle.success);

  /*
   * The field is gone as of version 2 — priority is an agent's call and
   * `createTicket` clamps a reporter's draft to the default. Asserted here rather
   * than left implicit: the compiled schema is a `strictObject`, so a form or a
   * cached client that still sends the key is refused, and somebody re-adding the
   * field to the schema would silently re-open the customer-facing control.
   */
  const stalePriority = zod.safeParse({
    title: "Drucker Etage 3 offline",
    description: "Seit heute Morgen ist der Drucker nicht erreichbar, Fehler 0x83.",
    attachments: [],
    priority: "critical",
  });
  check("the reporter form no longer accepts a priority", !stalePriority.success);
  check(
    "…and the quick ticket schema declares none",
    !("priority" in (QUICK_TICKET_SCHEMA.schema.properties ?? {})),
  );
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
  /*
   * The shape is the contract: prefix, a fixed leading 1, then the counter padded to
   * fifteen. It ends up in mail subjects and on paper, so it is asserted literally
   * rather than derived — a formatter that changed width would otherwise pass its own
   * round-trip test while breaking every reference already sent.
   */
  check(
    "a ticket renders as TCK plus sixteen digits",
    formatTicketNumber(1042) === "TCK-1000000000001042",
    formatTicketNumber(1042),
  );
  check(
    "the first ticket ever is TCK-1000000000000001",
    formatTicketNumber(1) === "TCK-1000000000000001",
    formatTicketNumber(1),
  );
  check(
    "the full form parses back",
    parseTicketNumber("TCK-1000000000001042") === 1042,
    "copy-paste out of a mail is the common path",
  );
  check(
    "…without the prefix too",
    parseTicketNumber("1000000000001042") === 1042,
  );
  check(
    "a bare number still parses",
    parseTicketNumber("1042") === 1042,
  );
  // The leading 1 is only dropped at the full width. Otherwise `1042` — which is
  // what somebody types — would come back as 42.
  check(
    "a short number keeps its leading one",
    parseTicketNumber("TCK-1042") === 1042,
  );
  check(
    "the retired TICK- form is still accepted",
    parseTicketNumber("TICK-1042") === 1042 &&
      parseTicketNumber("tick 1042") === 1042,
    "sent mail and written-down numbers carry it",
  );

  /*
   * The inventory series, same shape and eight digits wide. Separate assertions
   * rather than a loop over both: the widths are the whole point, and a helper that
   * derived them from the constants would agree with any value they happened to hold.
   */
  check(
    "an object renders as INV plus eight digits",
    formatInventoryNumber(42) === "INV-10000042",
    formatInventoryNumber(42),
  );
  check(
    "the first object ever is INV-10000001",
    formatInventoryNumber(1) === "INV-10000001",
    formatInventoryNumber(1),
  );
  check(
    "the inventory form parses back",
    parseInventoryNumber("INV-10000042") === 42,
  );
  check(
    "…case and separator do not matter",
    parseInventoryNumber("inv 10000042") === 42,
  );
  check("a bare inventory number parses", parseInventoryNumber("42") === 42);
  check(
    "a ticket number is not an inventory number",
    parseInventoryNumber("TCK-1000000000001042") === null,
    "sixteen digits is past the inventory width, and the prefix is not INV",
  );
  check("empty is not an inventory number", parseInventoryNumber("") === null);
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
    "subject carries the prefixed number in brackets",
    created.subject.includes("[TCK-1000000000001042]"),
    created.subject,
  );
  check("html carries the number", created.html.includes("TCK-1000000000001042"));
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
    reply.subject.includes("[TCK-1000000000001042]"),
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
  /*
   * A PDF is inserted as a link, not an image. Missing it would leave the row
   * unbound to the ticket, and the reporter would then get a 404 from a link
   * sitting in their own ticket.
   */
  check(
    "a linked attachment counts too",
    uploadIdsInHtml('<p><a href="/api/uploads/ccc">handbuch.pdf</a></p>')
      .join(",") === "ccc",
  );
  check(
    "an outside link is not an upload",
    uploadIdsInHtml('<a href="https://example.com/x.pdf">x.pdf</a>').length === 0,
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The agent checklist.

   Two things are worth checking without a database: that a value is only accepted
   for a step that can hold it, and that the steps survive the schema parse. The
   first is the boundary `setChecklistValue` leans on; the second decides whether a
   saved checklist comes back at all.
   ────────────────────────────────────────────────────────────────────────── */
console.log("\nagent checklist");
{
  check("a check step takes done", isChecklistValueFor("check", "done"));
  check("…and the empty value", isChecklistValueFor("check", ""));
  check("…but not yes", !isChecklistValueFor("check", "yes"));
  check("a yesno step takes yes", isChecklistValueFor("yesno", "yes"));
  check("…and no", isChecklistValueFor("yesno", "no"));
  check("…and the empty value too", isChecklistValueFor("yesno", ""));
  // `done` on a Ja/Nein step could only come from a kind an admin changed after the
  // fact, and it is not an answer to the question now being asked.
  check("…but not done", !isChecklistValueFor("yesno", "done"));
  check("nonsense is refused", !isChecklistValueFor("check", "maybe"));

  check("empty counts as unanswered", !isChecklistAnswered(""));
  check("an answer counts", isChecklistAnswered("no"));

  check(
    "every kind has a label",
    CHECKLIST_ITEM_KINDS.every((kind) => CHECKLIST_ITEM_KIND_LABELS[kind] !== ""),
  );

  /*
   * The parse carries a checklist from the builder into the store and back. A schema
   * that silently dropped it would lose every step on the first save.
   */
  const withList = parseFormSchema({
    ...QUICK_TICKET_SCHEMA,
    checklist: [
      { id: "step-1", label: "Gerät geprüft" },
      { id: "step-2", label: "Ersatzteil vorhanden?", kind: "yesno" },
    ],
  });
  check("the parse keeps the steps", withList.checklist?.length === 2);
  check(
    "…and defaults the kind to a checkbox",
    withList.checklist?.[0]?.kind === "check",
  );
  check("…and keeps an explicit kind", withList.checklist?.[1]?.kind === "yesno");
  check(
    "a schema without a checklist parses",
    parseFormSchema({ ...QUICK_TICKET_SCHEMA }).checklist === undefined,
  );

  const refuses = (checklist: unknown): boolean => {
    try {
      parseFormSchema({ ...QUICK_TICKET_SCHEMA, checklist });
      return false;
    } catch {
      return true;
    }
  };
  check("an unknown kind is refused", refuses([{ id: "step-1", label: "x", kind: "dropdown" }]));
  check("a step id with a space is refused", refuses([{ id: "step 1", label: "x" }]));
  check("an empty label is refused", refuses([{ id: "step-1", label: "" }]));
}

console.log("\ncustomer profile");
{
  // A reporter's website ends up as a link a agent clicks, so the scheme check
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
  // an arbitrary agent.
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

console.log("cmdb — labels and enums");
{
  check(
    "every CI type has a label",
    CIType.options.every((type) => Boolean(CI_TYPE_LABELS[type])),
    CIType.options.filter((type) => !CI_TYPE_LABELS[type]).join(","),
  );
  check(
    "every CI status has a label",
    CIStatus.options.every((status) => Boolean(CI_STATUS_LABELS[status])),
  );
  check(
    "every relation kind reads in both directions",
    CIRelationKind.options.every(
      (kind) => CI_RELATION_LABELS[kind] && CI_RELATION_INVERSE_LABELS[kind],
    ),
    CIRelationKind.options
      .filter((kind) => !CI_RELATION_INVERSE_LABELS[kind])
      .join(","),
  );
  check(
    "connected_to reads the same from either end",
    CI_RELATION_LABELS.connected_to === CI_RELATION_INVERSE_LABELS.connected_to,
  );
}

console.log("cmdb — seat arithmetic");
{
  const half = seatUsage(10, 5);
  check("half used -> 0.5", half.ratio === 0.5 && half.free === 5);
  check(
    "…and is neither overbooked nor untracked",
    !half.overbooked && !half.untracked,
  );

  const full = seatUsage(10, 10);
  check("exactly full is not overbooked", full.ratio === 1 && !full.overbooked);

  const over = seatUsage(10, 13);
  check("more than full is overbooked", over.overbooked);
  check("…the bar stops at full", over.ratio === 1, String(over.ratio));
  check("…and free never goes negative", over.free === 0, String(over.free));

  const none = seatUsage(0, 4);
  check(
    "no seat count is untracked, not overbooked",
    none.untracked && !none.overbooked,
  );
  check("…and its ratio is zero rather than infinite", none.ratio === 0);

  const negative = seatUsage(-5, -2);
  check("negatives are clamped", negative.total === 0 && negative.used === 0);
  const fractional = seatUsage(10.7, 3.9);
  check("fractions are truncated", fractional.total === 10 && fractional.used === 3);
}

console.log("cmdb — expiry");
{
  const now = new Date("2026-07-31T12:00:00Z");
  check("no date -> none", expiryState("", now) === "none");
  check("garbage -> none", expiryState("irgendwann", now) === "none");
  check("yesterday -> expired", expiryState("2026-07-30", now) === "expired");
  check(
    "today is not expired yet",
    expiryState("2026-07-31", now) === "soon",
    expiryState("2026-07-31", now),
  );
  check("tomorrow -> soon", expiryState("2026-08-01", now) === "soon");

  const midnight = Date.UTC(2026, 6, 31);
  const inWindow = new Date(midnight + LICENCE_EXPIRY_WARN_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const pastWindow = new Date(
    midnight + (LICENCE_EXPIRY_WARN_DAYS + 1) * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  check(
    `exactly ${LICENCE_EXPIRY_WARN_DAYS} days out is still soon`,
    expiryState(inWindow, now) === "soon",
    inWindow,
  );
  check(
    "one day past the window is ok",
    expiryState(pastWindow, now) === "ok",
    pastWindow,
  );

  // The time of day must not tip the verdict: the column holds a date, and an agent
  // whose browser has been open since yesterday morning has to see the same badge.
  check(
    "late in the day does not expire a licence early",
    expiryState("2026-07-31", new Date("2026-07-31T23:59:59Z")) === "soon",
  );
}

console.log("cmdb — attributes");
{
  check("null is an empty map", Object.keys(normaliseCIAttributes(null)).length === 0);
  check("blank keys are dropped", normaliseCIAttributes({ "   ": "x" })["   "] === undefined);
  check(
    "blank values are dropped, not stored empty",
    normaliseCIAttributes({ RAM: "   " }).RAM === undefined,
  );
  check(
    "whitespace in a key collapses",
    normaliseCIAttributes({ "RAM   Typ": "DDR5" })["RAM Typ"] === "DDR5",
  );
  check("numbers become strings", normaliseCIAttributes({ RAM: 16 }).RAM === "16");

  const long = normaliseCIAttributes({ ["k".repeat(200)]: "v".repeat(2000) });
  const [key, value] = Object.entries(long)[0];
  check("a long key is cut to the limit", key.length === CI_ATTRIBUTE_KEY_MAX, String(key.length));
  check(
    "a long value is cut to the limit",
    value.length === CI_ATTRIBUTE_VALUE_MAX,
    String(value.length),
  );

  const many = Object.fromEntries(
    Array.from({ length: CI_ATTRIBUTE_LIMIT + 20 }, (_, i) => [`k${i}`, "v"]),
  );
  check(
    "the attribute count is capped",
    Object.keys(normaliseCIAttributes(many)).length === CI_ATTRIBUTE_LIMIT,
    String(Object.keys(normaliseCIAttributes(many)).length),
  );
}

console.log("cmdb — item schema");
{
  const now = new Date();
  const minimal = MITSConfigurationItemSchema.safeParse({
    id: "ci-1",
    name: "Notebook Vertrieb 04",
    type: "hardware",
    created_at: now,
    updated_at: now,
  });
  check(
    "a name and a type are enough",
    minimal.success,
    minimal.success ? "" : (minimal.error.issues[0]?.message ?? ""),
  );
  check(
    "status defaults to in-service",
    minimal.success && minimal.data.status === "active",
  );
  check("seats default to untracked", minimal.success && minimal.data.seats_total === 0);
  check(
    "owner and site default to unassigned",
    minimal.success &&
      minimal.data.organization_id === null &&
      minimal.data.location_id === null,
  );

  const noName = MITSConfigurationItemSchema.safeParse({
    id: "ci-2",
    name: "",
    type: "hardware",
    created_at: now,
    updated_at: now,
  });
  check("a nameless item is refused", !noName.success);

  const badType = MITSConfigurationItemSchema.safeParse({
    id: "ci-3",
    name: "Etwas",
    type: "kaffeemaschine",
    created_at: now,
    updated_at: now,
  });
  check("an unknown type is refused", !badType.success);
}

console.log("cmdb — organizations");
{
  const minimal = MITSOrganizationSchema.safeParse({ id: "o1", name: "Weller GmbH" });
  check("a name is enough", minimal.success);
  check("active by default", minimal.success && minimal.data.active);

  const orgs = [
    { id: "o1", domain: "firma.de", active: true },
    { id: "o2", domain: "andere.de", active: true },
    { id: "o3", domain: "inaktiv.de", active: false },
  ];
  check(
    "a matching domain resolves",
    organizationIdForEmail("rita@firma.de", orgs) === "o1",
  );
  check("case does not matter", organizationIdForEmail("Rita@FIRMA.de", orgs) === "o1");
  check(
    "a suffix match is not a match",
    organizationIdForEmail("rita@nichtfirma.de", orgs) === null,
    String(organizationIdForEmail("rita@nichtfirma.de", orgs)),
  );
  check(
    "only the part after the last @ counts",
    organizationIdForEmail("rita@firma.de@fremd.de", orgs) === null,
  );
  check(
    "an inactive company is never suggested",
    organizationIdForEmail("rita@inaktiv.de", orgs) === null,
  );
  check("no @ at all resolves to nothing", organizationIdForEmail("rita", orgs) === null);
}

console.log("cmdb — delimited parsing");
{
  check("a semicolon file is read as semicolon", sniffDelimiter("a;b;c") === ";");
  check("a comma file is read as comma", sniffDelimiter("a,b,c") === ",");
  check("a tab paste is read as tab", sniffDelimiter("a\tb\tc") === "\t");
  check(
    "a single column falls back to semicolon rather than splitting nothing",
    sniffDelimiter("Bezeichnung") === ";",
  );
  check(
    "the header line decides, not a quoted comma further down",
    sniffDelimiter('a;b\n"x,y";z') === ";",
    sniffDelimiter('a;b\n"x,y";z'),
  );

  const simple = parseDelimited("Name;Tag\nNotebook;INV-1\nDrucker;INV-2");
  check("headers are read", simple.headers.join(",") === "Name,Tag");
  check("rows are read", simple.rows.length === 2);
  check("cells land under their header", simple.rows[0].Name === "Notebook");
  check("values are trimmed", parseDelimited("A;B\n  x  ;y").rows[0].A === "x");

  const quoted = parseDelimited('Name;Notiz\n"Notebook";"Kaputt; wirklich"');
  check(
    "a quoted delimiter stays inside the field",
    quoted.rows[0].Notiz === "Kaputt; wirklich",
    quoted.rows[0].Notiz,
  );

  const doubled = parseDelimited('Name\n"Der ""gute"" Drucker"');
  check(
    "a doubled quote becomes one quote",
    doubled.rows[0].Name === 'Der "gute" Drucker',
    doubled.rows[0].Name,
  );

  const multiline = parseDelimited('Name;Notiz\nX;"Zeile 1\nZeile 2"');
  check("a quoted line break does not end the row", multiline.rows.length === 1);
  check(
    "…and is kept in the value",
    multiline.rows[0].Notiz === "Zeile 1\nZeile 2",
    JSON.stringify(multiline.rows[0].Notiz),
  );

  const bom = parseDelimited("﻿Name;Tag\nX;1");
  check("a byte-order mark is not part of the first header", bom.headers[0] === "Name");

  const crlf = parseDelimited("Name;Tag\r\nX;1\r\n");
  check("CRLF files parse", crlf.rows.length === 1 && crlf.rows[0].Tag === "1");
  check(
    "a trailing newline does not add an empty row",
    parseDelimited("Name\nX\n\n\n").rows.length === 1,
    String(parseDelimited("Name\nX\n\n\n").rows.length),
  );

  const short = parseDelimited("Name;Tag;Notiz\nX;1");
  check(
    "a row with fewer cells is padded, not dropped",
    short.rows.length === 1 && short.rows[0].Notiz === "",
  );

  const unnamed = parseDelimited("Name;;Tag\nX;y;1");
  check(
    "an unnamed column gets a stable key",
    unnamed.headers[1] === "Spalte 2" && unnamed.rows[0]["Spalte 2"] === "y",
    unnamed.headers.join(","),
  );

  check("empty text yields nothing", parseDelimited("").rows.length === 0);
  check("empty text yields no headers", parseDelimited("").headers.length === 0);
}

console.log("cmdb — import coercion");
{
  check("German type labels map back", coerceCIType("Lizenz") === "license");
  check("English keys map back", coerceCIType("license") === "license");
  check("a device word maps to hardware", coerceCIType("Notebook") === "hardware");
  check("case and spacing do not matter", coerceCIType("  SOFTWARE ") === "software");
  check("an empty type defaults to hardware", coerceCIType("") === "hardware");
  check(
    "an unknown type becomes other rather than failing",
    coerceCIType("Kaffeemaschine") === "other",
  );
  check(
    "every coerced type is a legal enum value",
    ["Lizenz", "Notebook", "", "Unfug", "Switch"].every(
      (value) => CIType.safeParse(coerceCIType(value)).success,
    ),
  );

  check("German status labels map back", coerceCIStatus("Im Einsatz") === "active");
  check("scrapped maps to retired", coerceCIStatus("ausgemustert") === "retired");
  check("broken maps to repair", coerceCIStatus("Defekt") === "repair");
  check(
    "an unknown status is in-service, not scrapped",
    coerceCIStatus("weiß nicht") === "active",
    coerceCIStatus("weiß nicht"),
  );
  check("an empty status is in-service", coerceCIStatus("") === "active");
  check(
    "every coerced status is a legal enum value",
    ["Im Einsatz", "", "Unfug", "Lager"].every(
      (value) => CIStatus.safeParse(coerceCIStatus(value)).success,
    ),
  );

  check("ISO dates pass through", normaliseImportDate("2026-12-31") === "2026-12-31");
  check(
    "an ISO timestamp keeps only the day",
    normaliseImportDate("2026-12-31 09:14:00") === "2026-12-31",
  );
  check("German dates convert", normaliseImportDate("31.12.2026") === "2026-12-31");
  check(
    "a single-digit day is padded",
    normaliseImportDate("1.2.2026") === "2026-02-01",
    normaliseImportDate("1.2.2026"),
  );
  check("slashes work too", normaliseImportDate("31/12/2026") === "2026-12-31");
  check("an unreadable date is dropped, not guessed", normaliseImportDate("Q4") === "");
  check("an empty date stays empty", normaliseImportDate("  ") === "");

  check("a plain seat count reads", parseSeats("25") === 25);
  check("a formatted number reads", parseSeats("1.200") === 1200);
  check("nonsense is zero, not one", parseSeats("viele") === 0);
  check("an empty cell is zero", parseSeats("") === 0);

  check(
    "the attribute prefix is what the mask writes",
    ATTRIBUTE_PREFIX === "attr:",
  );
  check(
    "the only required target is the name",
    CI_IMPORT_TARGETS.filter((target) => "required" in target && target.required)
      .map((target) => target.key)
      .join(",") === "name",
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The technician → agent rename.

   The mapping is the part that has no visible failure mode: if `toRole` stops
   translating the old value, an instance restored from a pre-rename backup
   silently demotes every agent to `user`, and what shows up is "the queue is
   empty" rather than anything pointing at a role name.
   ────────────────────────────────────────────────────────────────────────── */
console.log("role rename");
{
  check("the new value is a role", isRole("agent"));
  check("the old value is not, any more", !isRole("technician"));
  check("but it still maps", toRole("technician") === "agent");
  check("and it still clears the queue gate", canViewBoard("technician"));
  check("an unknown value degrades to user", toRole("supervisor") === "user");
  check("…and never upwards", !canViewBoard("supervisor"));
  check("no role literal is left in the list", !MITS_ROLES.includes("technician" as never));
  check("every role has a label", MITS_ROLES.every((role) => Boolean(ROLE_LABELS[role])));
}

/* ──────────────────────────────────────────────────────────────────────────
   Queue sorting.

   `ORDER BY` cannot be parameterised, so the whitelist in `lib/ticket-sort.ts` is
   the only thing standing between a query string and concatenated SQL. These
   checks are that guarantee written down.
   ────────────────────────────────────────────────────────────────────────── */
console.log("ticket sort");
{
  check(
    "an unknown key falls back to the default",
    parseTicketSort("; DROP TABLE mits_ticket", "asc").key === DEFAULT_TICKET_SORT.key,
  );
  check(
    "an unknown direction falls back too",
    parseTicketSort("title", "sideways").dir === DEFAULT_TICKET_SORT.dir,
  );
  check("the default is newest first", DEFAULT_TICKET_SORT.key === "age" && DEFAULT_TICKET_SORT.dir === "desc");
  check(
    "every key has an expression",
    TICKET_SORT_KEYS.every((key) => Boolean(SORT_SQL[key])),
  );
  check(
    "every key has a label",
    TICKET_SORT_KEYS.every((key) => Boolean(TICKET_SORT_LABELS[key])),
  );
  check(
    "no expression carries a placeholder",
    TICKET_SORT_KEYS.every((key) => !SORT_SQL[key].includes("?")),
  );

  /*
   * Every status and priority the app can store has to appear in its CASE, or that
   * value sorts into the `ELSE 99` bucket and a whole class of tickets silently
   * collects at one end of the list.
   */
  check(
    "the status CASE covers every status",
    SORTABLE_ENUM_COVERAGE.status.every((value) =>
      SORT_SQL.status.includes(`'${value}'`),
    ),
    SORT_SQL.status,
  );
  check(
    "the priority CASE covers every priority",
    SORTABLE_ENUM_COVERAGE.priority.every((value) =>
      SORT_SQL.priority.includes(`'${value}'`),
    ),
    SORT_SQL.priority,
  );

  check(
    "clicking the active column flips it",
    nextDirection({ key: "title", dir: "asc" }, "title") === "desc",
  );
  check(
    "clicking a new column does not always start ascending",
    nextDirection({ key: "title", dir: "asc" }, "priority") === "desc",
  );
  check(
    "ORDER BY always carries a tiebreaker",
    orderByFor({ key: "status", dir: "asc" }).includes("mits_ticket.id"),
    orderByFor({ key: "status", dir: "asc" }),
  );

  // A sort click inside a filtered queue has to keep the filter. Dropping it would
  // widen the list, which looks like a working queue holding the wrong rows.
  const href = sortHref(
    "/mits",
    { scope: "mine", view: "waiting", status: "waiting_user", sort: "age", dir: "desc" },
    { key: "age", dir: "desc" },
    "owner",
  );
  check("sorting keeps the tab", href.includes("scope=mine") && href.includes("view=waiting"));
  check("sorting keeps the filter", href.includes("status=waiting_user"));
  check("…and replaces the old sort rather than appending", href.match(/sort=/g)?.length === 1);
  check("…with the new key", href.includes("sort=owner"));
}

/* ──────────────────────────────────────────────────────────────────────────
   Relative age and durations.

   Bucket boundaries, because an off-by-one here labels a two-hour-old ticket
   "gerade eben" and nothing on screen looks wrong.
   ────────────────────────────────────────────────────────────────────────── */
console.log("relative time");
{
  const now = Date.UTC(2026, 7, 1, 12, 0, 0);
  const ago = (ms: number) => formatRelativeTime(new Date(now - ms), now);

  check("under a minute reads as just now", ago(59_000) === "gerade eben", ago(59_000));
  check("exactly a minute switches", ago(60_000) === "vor 1 Min.", ago(60_000));
  check("minutes round down", ago(12 * 60_000 + 59_000) === "vor 12 Min.", ago(779_000));
  check("an hour switches unit", ago(3_600_000) === "vor 1 Std.", ago(3_600_000));
  check("hours round down", ago(3 * 3_600_000 + 59 * 60_000) === "vor 3 Std.");
  check("a day switches unit", ago(86_400_000) === "vor 1 Tag", ago(86_400_000));
  check("two days is plural", ago(2 * 86_400_000) === "vor 2 Tagen");
  check("a week switches unit", ago(7 * 86_400_000) === "vor 1 Wo.");
  // Clock skew is real: a container in UTC and a mail server a few seconds ahead
  // are enough, and "in -1 Min." is a bug report waiting to be filed.
  check("a future timestamp does not go negative", ago(-5_000) === "gerade eben", ago(-5_000));

  /*
   * Duration parsing. The whole risk here is a factor of sixty in the wrong
   * direction: booking "1,5" as one minute or "90" as ninety hours both look like
   * a number in the field and only surface when somebody adds up a month.
   */
  const d = parseDurationMinutes;
  check("a bare integer is minutes", d("90") === 90, String(d("90")));
  check("a bare decimal is hours", d("1,5") === 90, String(d("1,5")));
  check("a dot works like a comma", d("1.5") === 90, String(d("1.5")));
  check("clock notation reads", d("1:30") === 90, String(d("1:30")));
  check("an explicit unit reads", d("45 Min") === 45, String(d("45 Min")));
  check("hours with a unit read", d("2 Std") === 120, String(d("2 Std")));
  check("hours plus minutes read", d("1h30") === 90, String(d("1h30")));
  check("case and spacing do not matter", d("  1 STD  ") === 60, String(d("  1 STD  ")));
  // Above 59 in the minutes slot is a typo, not 1h90m — refused rather than
  // silently reinterpreted.
  check("a bad clock minute is refused", d("1:90") === null);
  check("zero is refused, not booked", d("0") === null);
  check("a negative is refused", d("-5") === null);
  check("more than a long day is refused", d("20 Std") === null);
  check("prose is refused", d("ein bisschen") === null);
  check("an empty string is refused", d("   ") === null);

  check("minutes below an hour stay minutes", formatMinutes(45) === "45 Min");
  check("a round hour drops the colon", formatMinutes(120) === "2 Std");
  check("ninety minutes reads as 1:30", formatMinutes(90) === "1:30 Std", formatMinutes(90));
  check("single-digit rest is padded", formatMinutes(65) === "1:05 Std", formatMinutes(65));
  check("negative input is clamped", formatMinutes(-10) === "0 Min");
}

/* ──────────────────────────────────────────────────────────────────────────
   AWS Signature Version 4.

   Checked against the two worked examples in Amazon's own S3 documentation
   ("Authenticating Requests: Using the Authorization Header"). This is the one
   piece of code in MITS where being wrong produces no usable diagnostic: the
   remote answers `SignatureDoesNotMatch` and says nothing about which of six
   steps was off. A published vector is the only feedback that points at a line.
   ────────────────────────────────────────────────────────────────────────── */
console.log("s3 signing");
{
  const credentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
  };
  const at = new Date("2013-05-24T00:00:00Z");
  const signatureOf = (authorization: string) =>
    authorization.match(/Signature=([0-9a-f]{64})/)?.[1] ?? "";

  check("the amz date drops separators and millis", amzDates(at).amzDate === "20130524T000000Z", amzDates(at).amzDate);
  check("the date stamp is the day", amzDates(at).dateStamp === "20130524");

  // Reserved characters in a key are singly encoded — S3 differs from every other
  // AWS service here, and double-encoding is the classic way to get this wrong.
  check("a dollar in the path is encoded", canonicalUri("/test$file.text") === "/test%24file.text", canonicalUri("/test$file.text"));
  check("slashes survive", canonicalUri("/mits/a/b.png") === "/mits/a/b.png");
  check("a space becomes %20, not +", canonicalUri("/a b.txt") === "/a%20b.txt", canonicalUri("/a b.txt"));
  check("query parameters sort by key", canonicalQuery({ b: "2", a: "1" }) === "a=1&b=2");

  // Vector 1 — PUT Object.
  const put = signS3Request(
    {
      method: "PUT",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test$file.text",
      headers: {
        date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
      },
      payloadHash:
        "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
    },
    credentials,
    at,
    "https",
  );
  check(
    "PUT Object matches the documented signature",
    signatureOf(put.headers.Authorization) ===
      "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
    signatureOf(put.headers.Authorization),
  );

  // Vector 2 — GET Object with a Range header, and an empty payload.
  const get = signS3Request(
    {
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      headers: { range: "bytes=0-9" },
      payloadHash: EMPTY_BODY_SHA256,
    },
    credentials,
    at,
    "https",
  );
  check(
    "GET Object matches the documented signature",
    signatureOf(get.headers.Authorization) ===
      "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    signatureOf(get.headers.Authorization),
  );
  check(
    "the empty-body hash is the SHA-256 of nothing",
    sha256Hex("") === EMPTY_BODY_SHA256,
  );

  /*
   * Endpoint validation. The mistake people make is pasting the URL out of a
   * provider's documentation; a scheme or a path lands inside the signed canonical
   * URI and comes back as a signature error that names nothing.
   */
  check("a bare host is accepted", isS3Endpoint("s3.eu-central-1.amazonaws.com"));
  check("a host with a port is accepted", isS3Endpoint("minio.local:9000"));
  check("a scheme is refused", !isS3Endpoint("https://s3.example.com"));
  check("a trailing path is refused", !isS3Endpoint("s3.example.com/bucket"));
  check("an empty endpoint is refused", !isS3Endpoint("   "));

  check("a prefix gains one trailing slash", normaliseS3Prefix("mits") === "mits/");
  check("…and never two", normaliseS3Prefix("mits//") === "mits/");
  check("a leading slash is dropped", normaliseS3Prefix("/mits/") === "mits/");
  check("an empty prefix stays empty", normaliseS3Prefix("  ") === "");

  const complete = {
    ...DEFAULT_S3_SETTINGS,
    endpoint: "s3.example.com",
    bucket: "mits",
    accessKeyId: "AKIA",
    secretAccessKey: "secret",
  };
  check("a complete configuration is usable", isS3Configured(complete));
  // Fail closed: a half-filled mask must not produce a request that cannot be
  // signed, so every field is required before anything is attempted.
  check("a missing secret is not", !isS3Configured({ ...complete, secretAccessKey: "" }));
  check("a missing bucket is not", !isS3Configured({ ...complete, bucket: "" }));
  check("the default configuration is not", !isS3Configured(DEFAULT_S3_SETTINGS));
}

/* ──────────────────────────────────────────────────────────────────────────
   Macros.

   The check that matters is the inert one: a macro with nothing set reports
   "ausgeführt" and moves no ticket, so the agent believes the customer is now
   waiting on them.
   ────────────────────────────────────────────────────────────────────────── */
console.log("macros");
{
  const base = MacroSchema.parse({ id: "m1", title: "Test" });
  check("a macro with nothing set is inert", macroIsEmpty(base));
  check("a status makes it real", !macroIsEmpty({ ...base, set_status: "waiting_user" }));
  check("a priority makes it real", !macroIsEmpty({ ...base, set_priority: "high" }));
  check("an assignment makes it real", !macroIsEmpty({ ...base, assign: "self" }));
  check(
    "a canned response makes it real",
    !macroIsEmpty({ ...base, canned_response_id: "c1" }),
  );
  // Insert, not send. The default has to be the one that keeps a human between the
  // template and the customer.
  check("the default reply mode is insert", base.reply_mode === "insert");
  check("every reply mode has a label", MacroReplyMode.options.every((mode) => Boolean(MACRO_REPLY_MODE_LABELS[mode])));
}

/* ──────────────────────────────────────────────────────────────────────────
   Inbound mail.

   Both failure modes are silent. Missing a reply opens a duplicate ticket and
   splits the conversation; matching one that is not a reply appends a stranger's
   message to somebody else's ticket. Neither logs anything.
   ────────────────────────────────────────────────────────────────────────── */
console.log("mail ingest");
{
  const num = ticketNumberFromSubject;
  check("the bracketed number MITS sends is found", num("[TCK-1000000000001042] Neue Antwort: Drucker") === 1042);
  check("a reply prefix does not hide it", num("AW: [TCK-1000000000001042] Drucker") === 1042);
  // What clients and people do to a subject: drop the prefix, retype it short.
  check("the number without the prefix works", num("Re: [1000000000001042] Drucker") === 1042);
  check("a short hand-typed number works", num("Re: [1042] Drucker") === 1042);
  check("a hash inside the brackets works", num("[#1042] Drucker") === 1042);
  check("an older TICK- subject still matches", num("AW: [TICK-1042] Drucker") === 1042);
  /*
   * The brackets are the whole safety margin. A bare run of digits in a subject is
   * an order number, an invoice or an IBAN fragment as often as it is a ticket,
   * and appending somebody's mail to whichever ticket that happens to hit is the
   * worse of the two mistakes.
   */
  check("a bare number is not a ticket reference", num("Rechnung 1042 vom 03.08.") === null);
  check("a number with no brackets anywhere is refused", num("Bestellung 1000000000001042") === null);
  check("zero is refused", num("[0] Test") === null);
  check("a subject with no number is refused", num("Drucker kaputt") === null);

  check("a reply prefix is stripped", cleanSubject("AW: Drucker") === "Drucker");
  check("stacked prefixes are stripped", cleanSubject("Re: AW: WG: Drucker") === "Drucker", cleanSubject("Re: AW: WG: Drucker"));
  check("a plain subject survives", cleanSubject("Drucker kaputt") === "Drucker kaputt");
  // A colon in ordinary prose must not be treated as a prefix boundary.
  check("a colon mid-subject is left alone", cleanSubject("Fehler: 0x83") === "Fehler: 0x83");

  /*
   * Auto-reply detection. Without it MITS mails a confirmation, the customer's
   * out-of-office answers it, MITS opens a ticket for the out-of-office and
   * confirms that too — a loop that fills the queue in minutes.
   */
  check("auto-submitted is caught", isAutomatedMail({ "auto-submitted": "auto-replied" }));
  check("auto-submitted: no is not", !isAutomatedMail({ "auto-submitted": "no" }));
  check("a mailing list is caught", isAutomatedMail({ "list-id": "<news.firma.de>" }));
  check("bulk precedence is caught", isAutomatedMail({ precedence: "bulk" }));
  check("Exchange suppression is caught", isAutomatedMail({ "x-auto-response-suppress": "All" }));
  check("an ordinary mail is not", !isAutomatedMail({ from: "anna@firma.de" }));

  /*
   * The sender binding for a mailed reply. For an address MITS has no account for,
   * the bracketed number is the only thing tying the mail to a ticket — and numbers
   * count up from 1, so `[42]` plus a forged `From` would otherwise be write access
   * to a stranger's conversation.
   */
  check("the same address matches", sameMailbox("anna@firma.de", "anna@firma.de"));
  check("case is folded", sameMailbox("Anna@Firma.de", "anna@firma.de"));
  check("surrounding space does not matter", sameMailbox("  anna@firma.de ", "anna@firma.de"));
  check("a display name is stripped", sameMailbox("Anna Weber <anna@firma.de>", "anna@firma.de"));
  check("a different address does not match", !sameMailbox("mallory@fremd.de", "anna@firma.de"));
  check("a lookalike does not match", !sameMailbox("anna@firma.de.fremd.de", "anna@firma.de"));
  // The one case where two identical values must not count as equal: a ticket with
  // no reporter address would otherwise be open to every mail without a sender.
  check("empty never matches empty", !sameMailbox("", ""));
  check("empty does not match an address", !sameMailbox("", "anna@firma.de"));

  const mail = (over: Partial<InboundMailShape>): InboundMailShape => ({
    uid: "1",
    from: "anna@firma.de",
    fromName: "Anna Meier",
    subject: "Drucker kaputt",
    text: "Der Drucker in Etage 3 ist seit heute Morgen offline.",
    html: "",
    messageId: "<a@firma.de>",
    references: [],
    receivedAt: new Date("2026-08-01T09:00:00Z"),
    ...over,
  });

  const fresh = planIngest(mail({}));
  check("a first message becomes a ticket", fresh.kind === "ticket");
  check("…titled from the subject", fresh.kind === "ticket" && fresh.title === "Drucker kaputt");

  const answer = planIngest(
    mail({
      subject: "AW: [0000000000001042] Neue Antwort: Drucker kaputt",
      text: "Das hat geholfen, danke!\n\nAm 01.08. schrieb IT <it@firma.de>:\n> Bitte neu starten.",
    }),
  );
  check("a reply is recognised", answer.kind === "reply");
  check("…against the right ticket", answer.kind === "reply" && answer.ticketNumber === 1042);
  check(
    "…with the quote stripped",
    answer.kind === "reply" && answer.body === "Das hat geholfen, danke!",
    answer.kind === "reply" ? JSON.stringify(answer.body) : "",
  );

  // A reply that is nothing but a quote leaves no text. An empty bubble in the
  // thread tells the agent less than no bubble at all.
  const empty = planIngest(
    mail({
      subject: "[1042] Re: Drucker",
      text: "Am 01.08. schrieb IT <it@firma.de>:\n> Bitte neu starten.",
    }),
  );
  check("an all-quote reply is skipped", empty.kind === "skip");

  /*
   * A *new* ticket keeps its quote. There is nothing to duplicate on a first
   * message, and a forwarded mail is mostly quote — trimming it would leave the
   * two words somebody typed above the forward.
   */
  const forwarded = planIngest(
    mail({
      subject: "WG: Rechnung",
      text: "Bitte prüfen.\n\nVon: buchhaltung@firma.de\nDetails im Anhang.",
    }),
  );
  check("a forward keeps its quoted part", forwarded.kind === "ticket" && forwarded.body.includes("Details im Anhang"));

  check(
    "an out-of-office never becomes a ticket",
    planIngest(mail({}), { "auto-submitted": "auto-replied" }).kind === "skip",
  );
  check("a mail without a sender is skipped", planIngest(mail({ from: "" })).kind === "skip");

  // Graph hands back HTML; the plain-text half has to keep its line structure or
  // `stripQuotedReply` can never find a marker at the start of a line.
  check(
    "block tags become newlines",
    htmlToText("<p>Eins</p><p>Zwei</p>") === "Eins\n\nZwei",
    JSON.stringify(htmlToText("<p>Eins</p><p>Zwei</p>")),
  );
  check("a break becomes a newline", htmlToText("a<br>b") === "a\nb");
  check("entities are decoded", htmlToText("<p>M&uuml;ller &amp; Co</p>").includes("&"), htmlToText("<p>M&uuml;ller &amp; Co</p>"));
  check("script content is dropped", !htmlToText("<script>alert(1)</script>ok").includes("alert"));

  check("a complete IMAP configuration is usable", isMailInboundConfigured({
    ...DEFAULT_MAIL_SETTINGS,
    transport: "imap",
    fallbackUserId: "u1",
    imapHost: "imap.firma.de",
    imapUser: "support",
    imapPassword: "secret",
  }));
  // Fail closed: without a fallback account a mail from an unknown address has no
  // owner, and `created_by` is what decides who can see the ticket.
  check("…but not without a fallback account", !isMailInboundConfigured({
    ...DEFAULT_MAIL_SETTINGS,
    transport: "imap",
    imapHost: "imap.firma.de",
    imapUser: "support",
    imapPassword: "secret",
  }));
  check("the default transport fetches nothing", !isMailInboundConfigured(DEFAULT_MAIL_SETTINGS));
}

/* ──────────────────────────────────────────────────────────────────────────
   The opening bubble.

   Derived from the payload at render time, so a wrong field pick shows the
   reporter a bubble containing their cost centre instead of their problem — and
   nothing logs it, because from the code's point of view it worked.
   ────────────────────────────────────────────────────────────────────────── */
console.log("opening message");
{
  const long = "Der Drucker in Etage 3 ist seit heute Morgen offline.";

  const ticket = (over: Record<string, unknown> = {}): MITSTicket =>
    MITSTicketSchema.parse({
      id: "t1",
      ticket_number: 1042,
      location_id: null,
      source: "legacy",
      form_schema_id: QUICK_TICKET_SCHEMA.id,
      title: "Drucker",
      payload: { title: "Drucker", description: long },
      status: "open",
      priority: "medium",
      created_by: "u1",
      created_by_email: "anna@firma.de",
      created_at: "2026-08-01T09:00:00.000Z",
      ...over,
    });

  check(
    "description is the opening field",
    openingFieldName({ title: "Drucker", description: long }) === "description",
  );
  // A title is short by design; picking it would put the ticket's own heading in
  // the bubble and leave the actual message in the sidebar.
  check(
    "a short value is never the message",
    openingFieldName({ title: "Drucker", room: "3.14" }) === null,
  );
  check(
    "a textarea field is found through the schema",
    openingFieldName(
      { device_type: "notebook", justification: long },
      HARDWARE_ORDER_SCHEMA,
    ) !== null,
  );
  check("an empty payload yields nothing", openingFieldName({}) === null);

  const bubble = openingMessageFor(ticket(), QUICK_TICKET_SCHEMA, "Anna Meier");
  check("a portal ticket gets an opening bubble", bubble !== null);
  check("…carrying the description", bubble?.body === long);
  check("…attributed to the reporter", bubble?.author_name === "Anna Meier");
  // Always the customer surface, and always plain text: the payload holds what a
  // form field collected, so the HTML branch would render a literal <b> as markup.
  check("…on the customer surface", bubble?.author_is_agent === false);
  check("…as text, not markup", bubble?.body_format === "text");
  check("…stamped when the ticket was filed", bubble?.created_at.toISOString() === "2026-08-01T09:00:00.000Z");
  check("…and marked synthetic", isSyntheticOpening(bubble?.id ?? ""));

  /*
   * The whole reason `source` grew an `email` member. A mailed ticket already
   * stores the sender's message as a real first comment, in sanitised HTML;
   * synthesising on top of it shows the same message twice, once flattened.
   */
  const mailed = openingMessageFor(ticket({ source: "email" }), QUICK_TICKET_SCHEMA, "Anna");
  check("a mailed ticket synthesises nothing", mailed === null);

  check(
    "the opening field drops out of the answer list",
    fieldsBesidesOpening(
      [{ name: "title" }, { name: "description" }],
      "description",
    ).length === 1,
  );
  check(
    "…and nothing drops when there is no bubble",
    fieldsBesidesOpening([{ name: "title" }, { name: "description" }], null)
      .length === 2,
  );

  /*
   * The answer list, now shared by the bubble, the sidebar and the accordion. It
   * was a private copy in each of the two ticket pages — two places for the same
   * answer to start reading differently, shown side by side to a reporter and an
   * agent talking about it.
   */
  check("a boolean reads as a word", formatPayloadValue(true) === "Ja");
  check("…and so does false", formatPayloadValue(false) === "Nein");
  check("a list is joined", formatPayloadValue(["Maus", "Dock"]) === "Maus, Dock");
  check(
    "an attachment list uses its names",
    formatPayloadValue([{ fileId: "f1", name: "angebot.pdf" }]) === "angebot.pdf",
  );
  check("an empty list is empty", formatPayloadValue([]) === "");
  check("a number becomes a string", formatPayloadValue(3) === "3");
  check("null is empty", formatPayloadValue(null) === "");
  // The only objects in a payload are attachment descriptors, and those belong to
  // the file list rather than to a line reading [object Object].
  check("a bare object yields nothing", formatPayloadValue({ a: 1 }) === "");

  const rows = payloadFields(
    { title: "Drucker", description: long, room: "", quantity: 2 },
    new Map([
      ["title", "Titel"],
      ["quantity", "Menge"],
    ]),
    "description",
  );
  check("the opening field is gone", !rows.some((row) => row.name === "description"));
  check("an empty answer is dropped", !rows.some((row) => row.name === "room"));
  check("a label from the schema is used", rows[0]?.label === "Titel");
  check(
    "a field without a label keeps its name",
    payloadFields({ room: "3.14" }, new Map(), null)[0]?.label === "room",
  );
  check("values are formatted", rows.some((row) => row.text === "2"));

  /*
   * Anhänge werden in der Eröffnungsbubble als Bild bzw. als Link gerendert, also
   * dürfen sie nicht zusätzlich als Textzeile in der Angaben-Liste stehen — der
   * Dateiname stünde sonst zweimal, zwei Zentimeter unter der Datei selbst.
   */
  const withFiles = {
    description: long,
    dateien: [
      { fileId: "f1", name: "screenshot.png", size: 12, type: "image/png" },
      { fileId: "f2", name: "bericht.pdf", size: 34, type: "application/pdf" },
    ],
    raum: "3.14",
  };

  check(
    "an attachment field is not a text line",
    !payloadFields(withFiles, new Map(), "description").some(
      (row) => row.name === "dateien",
    ),
  );
  check(
    "the other answers survive it",
    payloadFields(withFiles, new Map(), "description").some(
      (row) => row.name === "raum",
    ),
  );

  const files = payloadAttachments(withFiles);
  check("both attachments are found", files.length === 2);
  check("in field order", files[0]?.name === "screenshot.png");
  /*
   * Ohne `fileId` gibt es nichts zu verlinken: eine Zeile aus der Zeit vor der
   * Ablage oder ein Upload, der nie durchkam. Ein Bild-Tag darauf wäre ein
   * defektes Bild, ein Link ein 404 mitten in der ersten Nachricht.
   */
  check(
    "a descriptor without a fileId is dropped",
    payloadAttachments({ d: [{ name: "alt.png", size: 1, type: "image/png" }] })
      .length === 0,
  );
  check(
    "a plain list of strings is not an attachment field",
    payloadAttachments({ tags: ["Maus", "Dock"] }).length === 0,
  );

  /*
   * The display mode decides a layout on two pages. An unrecognised value must
   * fall back rather than throw — a row from an older version or a hand-edited
   * database would otherwise take both ticket views down over where a list goes.
   */
  check("chat is the default", DEFAULT_TICKET_DISPLAY_SETTINGS.formDisplay === "chat");
  check("a known mode is kept", toTicketFormDisplay("panel") === "panel");
  check("nonsense falls back", toTicketFormDisplay("sidebar") === "chat");
  check("undefined falls back", toTicketFormDisplay(undefined) === "chat");
  check("the fallback is overridable", toTicketFormDisplay(null, "both") === "both");
  check(
    "every mode has admin copy",
    TICKET_FORM_DISPLAYS.every(
      (mode) =>
        TICKET_FORM_DISPLAY_META[mode].label !== "" &&
        TICKET_FORM_DISPLAY_META[mode].description !== "",
    ),
  );

  /*
   * The pills and the enum have to agree: the value is stored in the payload and
   * validated against `QUICK_TICKET_SCHEMA`, so a pill outside the enum would be
   * a button that cannot be submitted.
   */
  const quick = schemaToZod(QUICK_TICKET_SCHEMA);
  for (const entry of INTAKE_CATEGORIES) {
    check(
      `the pill "${entry.label}" is submittable`,
      quick.safeParse({
        title: "Drucker Etage 3 offline",
        description: long,
        category: entry.value,
        attachments: [],
      }).success,
    );
  }
  check(
    "an invented category is refused",
    !quick.safeParse({
      title: "Drucker Etage 3 offline",
      description: long,
      category: "quantenphysik",
      attachments: [],
    }).success,
  );
  // Optional on purpose: classifying must not be a wall in front of a support
  // request from somebody who just wants to describe what broke.
  check(
    "no category at all is fine",
    quick.safeParse({
      title: "Drucker Etage 3 offline",
      description: long,
      attachments: [],
    }).success,
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The AI opt-in gates.

   The rule the whole module is built around: nothing reaches a model unless an
   administrator turned it on. A default that drifted to `true`, or a gate that
   forgot to consult the master switch, would be an outbound request from an
   instance nobody configured — and nothing on screen would say so.
   ────────────────────────────────────────────────────────────────────────── */
console.log("ai gates");
{
  const base = AISettingsSchema.parse({});

  check("all four features start off", AI_FEATURES.every((f) => base[f] === false));
  check("the default provider is local", base.provider === "ollama");
  check("Ollama needs no key", !providerNeedsKey("ollama"));
  check("OpenAI does", providerNeedsKey("openai"));
  check("Anthropic does", providerNeedsKey("anthropic"));
  check(
    "every feature has admin copy",
    AI_FEATURES.every((f) => Boolean(AI_FEATURE_META[f].label)),
  );

  const ready = { ...base, enabled: true, textModel: "llama3.1" };
  check("a local model is ready", isAIModelReady(ready));
  check("…but not with the master switch off", !isAIModelReady({ ...ready, enabled: false }));
  check("…and not without a model name", !isAIModelReady({ ...ready, textModel: "" }));
  // Fail closed. A cloud provider with no key produces an unauthenticated request
  // and a 401 somewhere the admin is not looking.
  check(
    "a cloud provider without a key is not ready",
    !isAIModelReady({ ...ready, provider: "openai", textModel: "gpt-4o-mini" }),
  );
  check(
    "…and is once the key is there",
    isAIModelReady({
      ...ready,
      provider: "openai",
      textModel: "gpt-4o-mini",
      apiKey: "sk-test",
    }),
  );

  check("a switched-off feature stays off", !isAIFeatureOn(ready, "summary"));
  check(
    "…and on once switched on",
    isAIFeatureOn({ ...ready, summary: true }, "summary"),
  );
  check(
    "the master switch overrides a switched-on feature",
    !isAIFeatureOn({ ...ready, enabled: false, summary: true }, "summary"),
  );
  /*
   * The two model-free features are the point of the `needsModel` flag: an
   * instance with no GPU and no API key can still spot an outage and still offer
   * FAQ links.
   */
  check(
    "clustering works without a model",
    isAIFeatureOn({ ...base, enabled: true, clustering: true }, "clustering"),
  );
  check(
    "deflection works without a model",
    isAIFeatureOn({ ...base, enabled: true, deflection: true }, "deflection"),
  );
  check(
    "the summary does not",
    !isAIFeatureOn({ ...base, enabled: true, summary: true }, "summary"),
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Outage detection.

   Arithmetic, so it is checkable — which is why it is arithmetic. Both failure
   directions are expensive: inventing an outage re-statuses other people's
   tickets as waiting on something unrelated, missing one leaves twelve customers
   each getting their own answer to the same question.
   ────────────────────────────────────────────────────────────────────────── */
console.log("incident clustering");
{
  check("stopwords are dropped", !tokenize("Ich habe ein Problem").includes("problem"));
  check("short tokens are dropped", !tokenize("PC ist aus").includes("ist"));
  check("umlauts survive", tokenize("Drucker gestört").includes("gestört"));
  check(
    "punctuation splits",
    tokenize("Fehler: 0x83 bei outlook.exe").includes("outlook"),
  );

  const set = (text: string) => new Set(tokenize(text));
  check("identical text scores 1", similarity(set("Drucker offline"), set("Drucker offline")) === 1);
  // Two empty sets score 0, not 1: no shared words is no evidence, and the
  // identity reading would cluster every content-free ticket together.
  check("two empty sets score 0", similarity(new Set(), new Set()) === 0);
  check(
    "unrelated text scores low",
    similarity(set("Drucker Etage drei offline"), set("Urlaubsantrag Genehmigung")) < 0.1,
  );

  /*
   * The rule Jaccard alone could not express. Those three real-looking titles
   * score 0.67, 0.25 and 0.20 against each other, because every writer picks a
   * different verb and each unshared word costs a third of a three-token set.
   * One substantive shared word is what they actually have in common.
   */
  check(
    "one substantive shared word binds",
    related(set("Outlook startet nicht mehr"), set("Outlook lässt sich nicht mehr starten")),
  );
  check(
    "a short shared token does not, on its own",
    !related(set("VPN Verbindung bricht ab"), set("VPN Zertifikat erneuern lassen bitte")),
    JSON.stringify([...set("VPN Verbindung bricht ab")]),
  );
  // Stated as a check so nobody later reads the feature as semantic: the spec's
  // own example pairs "Outlook offline" with "E-Mail geht nicht", which share no
  // vocabulary at all. Catching that needs embeddings — refused, and documented.
  check(
    "paraphrases without shared words are not detected",
    !related(set("Outlook offline"), set("E-Mail geht nicht")),
  );

  const outage = [
    { id: "a", text: "Outlook startet nicht mehr" },
    { id: "b", text: "Outlook geht nicht, startet einfach nicht" },
    { id: "c", text: "Outlook lässt sich nicht mehr starten" },
    { id: "d", text: "Neuer Monitor für das Büro bestellen" },
  ];

  const groups = clusterTickets(outage, { minSize: 3 });
  check("the three Outlook tickets group", groups.length === 1, JSON.stringify(groups));
  check("…all three of them", groups[0]?.ids.length === 3);
  check("…and the order request stays out", !groups[0]?.ids.includes("d"));
  check(
    "the shared word becomes the headline",
    groups[0]?.keywords.includes("outlook"),
    JSON.stringify(groups[0]?.keywords),
  );

  // The threshold is what stops two unrelated tickets from becoming an outage.
  check(
    "two tickets are not an outage when three are required",
    clusterTickets(outage.slice(0, 2), { minSize: 3 }).length === 0,
  );
  check(
    "…and are when two are",
    clusterTickets(outage.slice(0, 2), { minSize: 2 }).length === 1,
  );
  check(
    "a queue of unrelated tickets clusters nothing",
    clusterTickets(
      [
        { id: "a", text: "Drucker Etage drei offline" },
        { id: "b", text: "Urlaubsantrag genehmigen lassen" },
        { id: "c", text: "Neues Headset bestellen bitte" },
      ],
      { minSize: 2 },
    ).length === 0,
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Self-service suggestions and tag cleanup.
   ────────────────────────────────────────────────────────────────────────── */
console.log("deflection and tags");
{
  const faqs = [
    {
      id: "pw",
      question: "Wie setze ich mein M365-Passwort zurück?",
      answer:
        "Über das Selbstbedienungsportal lässt sich das Passwort jederzeit selbst zurücksetzen.",
      category: "",
      order_index: 0,
      attachments: [],
    },
    {
      id: "drucker",
      question: "Ein Netzlaufwerk ist nicht verbunden.",
      answer: "Bitte ab- und neu anmelden, Laufwerke werden bei der Anmeldung verbunden.",
      category: "",
      order_index: 1,
      attachments: [],
    },
  ];

  const hit = suggestFaqs("Ich möchte mein M365-Passwort zurücksetzen", faqs);
  check("a matching article is offered", hit[0]?.id === "pw", JSON.stringify(hit));

  /*
   * The threshold is the whole feature. A wrong suggestion under somebody's
   * half-typed problem says the system misunderstood them, and two of those and
   * they stop reading the area. A miss costs nothing.
   */
  check(
    "an unrelated problem gets nothing",
    suggestFaqs("Mein Monitor flackert seit heute Morgen stark", faqs).length === 0,
  );
  check(
    "a fragment gets nothing",
    suggestFaqs("Passwort", faqs).length === 0,
  );
  check("an empty query gets nothing", suggestFaqs("", faqs).length === 0);
  check(
    "at most two are offered",
    suggestFaqs("Passwort zurücksetzen M365 Netzlaufwerk Anmeldung verbunden", faqs)
      .length <= 2,
  );

  /*
   * Tag normalisation matters because a model produces `VPN`, `vpn` and
   * `VPN-Zugang` across three tickets about one thing — and three spellings of a
   * label group nothing at all.
   */
  check(
    "case is folded",
    normaliseTags(["VPN", "vpn"]).length === 1,
    JSON.stringify(normaliseTags(["VPN", "vpn"])),
  );
  check("a leading hash is dropped", normaliseTags(["#Drucker"])[0] === "drucker");
  check("spaces become hyphens", normaliseTags(["Kein Zugang"])[0] === "kein-zugang");
  check("no more than three survive", normaliseTags(["a1", "b2", "c3", "d4"]).length === 3);
  check("one-character tags are dropped", normaliseTags(["a"]).length === 0);
  check("a routing hint is recognised", isRoutingHint("passt-eher:hardware-order"));
  check("an ordinary tag is not", !isRoutingHint("drucker"));
}

/* ──────────────────────────────────────────────────────────────────────────
   Analytics ranges and buckets.

   The layer where a mistake produces a chart that *looks* fine. An off-by-one at
   a bucket boundary drops a day, an ISO-week miscount puts two weeks under one
   label, and nothing anywhere logs either.
   ────────────────────────────────────────────────────────────────────────── */
console.log("analytics ranges");
{
  // A Wednesday, mid-afternoon UTC.
  const now = new Date("2026-08-05T14:30:00.000Z");

  const today = resolveRange("today", now);
  check("today starts at UTC midnight", today.from === "2026-08-05T00:00:00.000Z", today.from);
  // The last millisecond, not the next midnight: `to` is compared with `<=`, and
  // an exclusive-looking bound written inclusively double-counts a boundary row.
  check("…and ends at the last millisecond", today.to === "2026-08-05T23:59:59.999Z", today.to);

  const week = resolveRange("7d", now);
  check("seven days means seven, not eight", week.from === "2026-07-30T00:00:00.000Z", week.from);
  const month = resolveRange("30d", now);
  check("thirty days likewise", month.from === "2026-07-07T00:00:00.000Z", month.from);
  check("the year starts in January", resolveRange("year", now).from === "2026-01-01T00:00:00.000Z");

  const all = resolveRange("all", now, { earliest: "2025-03-17T08:12:00.000Z" });
  check("all-time reaches the first ticket", all.from === "2025-03-17T00:00:00.000Z", all.from);
  // An empty instance would otherwise ask for fifty-five years of buckets.
  check(
    "…and falls back on an empty instance",
    resolveRange("all", now, { earliest: null }).from === "2026-07-06T00:00:00.000Z",
  );

  const custom = resolveRange("custom", now, { from: "2026-07-01", to: "2026-07-31" });
  check("a custom range is honoured", custom.from === "2026-07-01T00:00:00.000Z");
  check("…inclusive to the end of the last day", custom.to === "2026-07-31T23:59:59.999Z");
  // Swapped bounds are a slip, not an empty result.
  check(
    "reversed bounds are swapped, not obeyed",
    resolveRange("custom", now, { from: "2026-07-31", to: "2026-07-01" }).from ===
      "2026-07-01T00:00:00.000Z",
  );
  check(
    "an unreadable date falls back rather than throwing",
    resolveRange("custom", now, { from: "gestern", to: "" }).from ===
      "2026-07-07T00:00:00.000Z",
  );
  // A tail of empty buckets after today reads as a collapse in volume.
  check(
    "a range ending in the future is clipped to today",
    resolveRange("custom", now, { from: "2026-08-01", to: "2026-12-31" }).to ===
      "2026-08-05T23:59:59.999Z",
  );

  check("two days of data is hourly", autoGranularity(Date.parse("2026-08-04T00:00:00Z"), Date.parse("2026-08-05T00:00:00Z")) === "hour");
  check("a month is daily", autoGranularity(Date.parse("2026-07-05T00:00:00Z"), Date.parse("2026-08-05T00:00:00Z")) === "day");
  check("a year is weekly", autoGranularity(Date.parse("2025-08-05T00:00:00Z"), Date.parse("2026-08-05T00:00:00Z")) === "week");
  check("three years is monthly", autoGranularity(Date.parse("2023-08-05T00:00:00Z"), Date.parse("2026-08-05T00:00:00Z")) === "month");

  /*
   * A manual granularity that would blow the ceiling falls back. "Hourly over
   * three years" is 26 000 points and a frozen browser, and refusing with an
   * error would be a worse answer than drawing the chart somebody meant.
   */
  check(
    "an impossible manual granularity is overruled",
    resolveRange("custom", now, {
      from: "2023-01-01",
      to: "2026-08-05",
      granularity: "hour",
    }).granularity === "month",
  );
  check(
    "a sensible one is kept",
    resolveRange("30d", now, { granularity: "week" }).granularity === "week",
  );

  // The bucket key and the SQL `GROUP BY` have to agree exactly, or every bucket
  // comes back zero — a chart that renders perfectly and is entirely wrong.
  check("an hour key keeps the hour", bucketKey("2026-08-05T14:30:00.000Z", "hour") === "2026-08-05T14:00");
  check("a day key is the date", bucketKey("2026-08-05T14:30:00.000Z", "day") === "2026-08-05");
  check("a month key is the month", bucketKey("2026-08-05T14:30:00.000Z", "month") === "2026-08");
  // Monday-first, matching ISO-8601 and the SQLite expression.
  check("a week key is that week's Monday", bucketKey("2026-08-05T14:30:00.000Z", "week") === "2026-08-03", bucketKey("2026-08-05T14:30:00.000Z", "week"));
  check("…including on a Sunday", bucketKey("2026-08-09T23:00:00.000Z", "week") === "2026-08-03", bucketKey("2026-08-09T23:00:00.000Z", "week"));

  const buckets = bucketsFor(resolveRange("7d", now, { granularity: "day" }));
  check("seven days produce seven buckets", buckets.length === 7, String(buckets.length));
  check("…starting at the first day", buckets[0] === "2026-07-30");
  check("…and ending today", buckets[6] === "2026-08-05");
  check("no range exceeds the bucket ceiling", bucketsFor(resolveRange("all", now, { earliest: "2015-01-01T00:00:00Z", granularity: "hour" })).length <= MAX_BUCKETS);

  /*
   * The Thursday rule, not "day of year over seven". The first week of a year is
   * the one containing its first Thursday, so early January often belongs to week
   * 52 or 53 of the year before — exactly when somebody is comparing to December.
   */
  check("an ISO week is counted by Thursdays", isoWeek("2026-01-05") === 2, String(isoWeek("2026-01-05")));
  check("…and the first week can start in December", isoWeek("2025-12-29") === 1, String(isoWeek("2025-12-29")));

  check("an hour tick reads as a clock", bucketLabel("2026-08-05T14:00", "hour") === "14:00");
  check("a day tick is day and month", bucketLabel("2026-08-05", "day") === "05.08.");
  check("a month tick names the month", bucketLabel("2026-08", "month") === "Aug 2026");
}

/* ──────────────────────────────────────────────────────────────────────────
   CSV escaping.

   A ticket title with a semicolon in it shifts every column to its right, and
   the file opens without complaint.
   ────────────────────────────────────────────────────────────────────────── */
console.log("analytics export");
{
  check("a plain value is untouched", csvCell("Drucker") === "Drucker");
  check("a separator forces quotes", csvCell("Drucker; Etage 3") === '"Drucker; Etage 3"');
  check("a quote is doubled", csvCell('Fehler "0x83"') === '"Fehler ""0x83"""');
  check("a line break forces quotes", csvCell("Zeile eins\nZeile zwei") === '"Zeile eins\nZeile zwei"');
  check("a number passes through", csvCell(42) === "42");
  check("null is an empty cell", csvCell(null) === "");
}

/* ──────────────────────────────────────────────────────────────────────────
   Paging.

   The arithmetic is small and every mistake in it is quiet: an unclamped page
   produces an empty table that reads as "no tickets match", and a negative offset
   is a SQLite error on a page somebody bookmarked.
   ────────────────────────────────────────────────────────────────────────── */
console.log("ticket paging");
{
  check("fifty per page", TICKETS_PER_PAGE === 50);

  check("a missing page is the first", toPage(undefined) === 1);
  check("a page number reads", toPage("3") === 3);
  // Every one of these would otherwise reach `OFFSET` as a negative or a NaN.
  check("zero is refused", toPage("0") === 1);
  check("a negative is refused", toPage("-4") === 1);
  check("prose is refused", toPage("letzte") === 1);
  check("a fraction is refused", toPage("2.5") === 1);
  check("an array takes its first entry", toPage(["2", "9"]) === 2);

  // An empty list still has a page one; a pager that reported zero pages would
  // divide by it somewhere.
  check("an empty list has one page", pageCount(0) === 1);
  check("fifty fit on one page", pageCount(50) === 1);
  check("fifty-one need two", pageCount(51) === 2);
  check("two hundred need four", pageCount(200) === 4);

  check("page one starts at zero", pageOffset(1, 200) === 0);
  check("page three skips a hundred", pageOffset(3, 200) === 100);
  /*
   * The clamp. An agent on page four whose filter just narrowed the list to two
   * pages gets the last page that exists — an out-of-range offset would hand them
   * an empty table, which reads as "nothing matches".
   */
  check("a page past the end clamps to the last", pageOffset(9, 120) === 100);
  check("page zero clamps to the first", pageOffset(0, 120) === 0);
  check("an empty list has no offset", pageOffset(5, 0) === 0);

  /*
   * Re-sorting reorders everything, so page four of the new order has nothing to
   * do with page four of the old one. Carrying it would land somebody on rows
   * they have no reason to expect, or past the end of a short list.
   */
  const href = sortHref(
    "/mits",
    { scope: "mine", page: "4", sort: "age", dir: "desc" },
    { key: "age", dir: "desc" },
    "title",
  );
  check("sorting drops the page", !href.includes("page="), href);
  check("…and keeps the scope", href.includes("scope=mine"));

  // The pager's own links keep everything except the page.
  check(
    "the window keeps first and last",
    pagesToShow(5, 20)[0] === 1 && pagesToShow(5, 20).at(-1) === 20,
  );
  check(
    "…and gaps become an ellipsis",
    pagesToShow(10, 20).includes(null),
    JSON.stringify(pagesToShow(10, 20)),
  );
  // A single missing page renders as itself: an ellipsis hiding exactly one
  // number is longer than the number.
  check(
    "a one-page gap is filled, not elided",
    !pagesToShow(4, 8).includes(null),
    JSON.stringify(pagesToShow(4, 8)),
  );
  check("a short list needs no gaps", !pagesToShow(2, 4).includes(null));
  check(
    "every entry is a real page",
    pagesToShow(7, 15).every((entry) => entry === null || (entry >= 1 && entry <= 15)),
  );
}

/* --------------------------------------------------------------------------
   Notification settings and the digest.

   Both are quiet when wrong, which is why they are here. A settings row that
   fails to parse falls back to the defaults and un-mutes a channel an admin
   silenced - and a notification system that is louder than configured looks
   like a different bug entirely. The digest is the text somebody reads when the
   model is off or unreachable, so it has to be correct on its own.
   -------------------------------------------------------------------------- */
console.log("notification settings");
{
  const defaults = NotificationSettingsSchema.parse({});
  check("an empty row yields every default", defaults.position === "top-right");
  check("...including the digest threshold", defaults.digestThreshold === 5);
  check("a handed-over ticket stays on screen", defaults.assigned_sticky === true);

  // The point of the flat shape: a partial row degrades field by field instead
  // of being discarded whole.
  const partial = NotificationSettingsSchema.parse({ seconds: 12 });
  check("a partial row keeps what it sets", partial.seconds === 12);
  check("...and defaults the rest", partial.maxVisible === 4);

  // Numbers arrive from a form as strings and have to be coerced, then clamped.
  // An unclamped poll interval is a request per second per open tab.
  const coerced = NotificationSettingsSchema.safeParse({ seconds: "9" });
  check("a form string coerces", coerced.success && coerced.data.seconds === 9);
  check(
    "a dwell time below the floor is refused",
    !NotificationSettingsSchema.safeParse({ seconds: 1 }).success,
  );
  check(
    "a poll interval below the floor is refused",
    !NotificationSettingsSchema.safeParse({ pollSeconds: 1 }).success,
  );
  // Zero is the documented "off" for the digest and must survive the minimum.
  check(
    "a zero threshold switches the digest off",
    NotificationSettingsSchema.parse({ digestThreshold: 0 }).digestThreshold === 0,
  );

  check(
    "channelConfig reads the three keys",
    channelConfig(defaults, "assigned").tone === "success" &&
      channelConfig(defaults, "reply").sticky === false,
  );
}

console.log("notification digest");
{
  const events = [
    { kind: "reply" as const, title: "Anna hat geantwortet", description: "Drucker klemmt — schon probiert?" },
    { kind: "reply" as const, title: "Bea hat geantwortet", description: "VPN bricht ab — seit heute" },
    { kind: "ticket" as const, title: "Neues Ticket im Pool", description: "0000000000000042 · Monitor dunkel" },
    { kind: "assigned" as const, title: "Ticket dir zugewiesen", description: "0000000000000043 · Laptop langsam" },
  ];

  const digest = deterministicDigest(events);
  check("the count is the number of events", digest.count === 4);
  check(
    "each kind is counted and pluralised",
    digest.headline.includes("2 neue Antworten") &&
      digest.headline.includes("1 neues Ticket im Pool") &&
      digest.headline.includes("1 Ticket dir zugewiesen"),
    digest.headline,
  );
  check(
    "the last part is joined with und",
    digest.headline.includes("und 1 Ticket dir zugewiesen"),
    digest.headline,
  );
  check("at most three examples", digest.summary.split("\n").length <= 3);
  // The separator must not be a character the descriptions themselves use: a
  // pool notification already contains a middle dot between number and title,
  // which is why joining with one produced five apparent entries from three.
  check(
    "the separator cannot collide with the content",
    digest.summary.split("\n").every((line) => line.trim() !== ""),
    digest.summary,
  );
  check(
    "an example is the ticket half, not the preview",
    digest.summary.startsWith("Drucker klemmt"),
    digest.summary,
  );

  // Order must not depend on the order events arrive in, or two polls a second
  // apart read as two different things having happened.
  const shuffled = deterministicDigest([events[3], events[2], events[1], events[0]]);
  check(
    "the wording is stable across input order",
    shuffled.headline === digest.headline,
    shuffled.headline + " :: " + digest.headline,
  );

  const single = deterministicDigest([events[0]]);
  check("one event stays singular", single.headline.includes("1 neue Antwort"), single.headline);
  check("...and is not pluralised", !single.headline.includes("Antworten"), single.headline);

  const none = deterministicDigest([]);
  check("no events produce no parts", none.count === 0 && none.summary === "");
}

/* --------------------------------------------------------------------------
   Realtime backoff, shared links and the retract window.

   Three small pure things whose mistakes are all invisible at runtime. A backoff
   without jitter looks fine until forty tabs reconnect in lockstep; a link
   extractor that keeps a `javascript:` href renders a clickable one in a panel
   built from message bodies; a retract window that disagrees with the server
   produces a refusal that reads as a broken button.
   -------------------------------------------------------------------------- */
console.log("reconnect backoff");
{
  // Deterministic random, so the assertions are about the arithmetic and not
  // about which numbers came up.
  const mid = () => 0.5;

  check("the first retry is about a second", reconnectDelay(0, mid) === 750);
  check("it doubles", reconnectDelay(1, mid) === 1500);
  check("...and again", reconnectDelay(2, mid) === 3000);

  check(
    "it stops at the ceiling",
    reconnectDelay(20, mid) === Math.round(RECONNECT_MAX_MS * 0.75),
    String(reconnectDelay(20, mid)),
  );
  check(
    "a negative attempt is treated as the first",
    reconnectDelay(-3, mid) === reconnectDelay(0, mid),
  );

  // Half-jitter, not full: a delay must never collapse to almost nothing, or the
  // backoff stops being one.
  check("the floor is half the window", reconnectDelay(3, () => 0) === 4000);
  check("the ceiling is the whole window", reconnectDelay(3, () => 1) === 8000);
  check(
    "every delay is at least the base",
    [0, 1, 2, 5, 9].every((n) => reconnectDelay(n, () => 0) >= RECONNECT_BASE_MS / 2),
  );
}

console.log("shared links");
{
  const at = new Date("2026-08-01T09:00:00.000Z");
  const message = (body: string, format = "text", author = "Anna") => ({
    body,
    body_format: format,
    author_name: author,
    created_at: at,
  });

  const plain = collectLinks([
    message("Siehe https://wiki.firma.de/vpn/setup und melde dich"),
  ]);
  check("a bare url is found", plain.length === 1, JSON.stringify(plain));
  check(
    "...and labelled with host plus last segment",
    plain[0]?.label === "wiki.firma.de/setup",
    plain[0]?.label,
  );
  check("...and carries its author", plain[0]?.author === "Anna");

  // Trailing punctuation is part of the sentence, not of the address.
  const punctuated = collectLinks([message("Hier: https://firma.de/a) und fertig")]);
  check(
    "a closing bracket is not part of the url",
    punctuated[0]?.href === "https://firma.de/a",
    punctuated[0]?.href,
  );

  const anchored = collectLinks([
    message('<p>Die <a href="https://firma.de/doku">Anleitung</a> hilft.</p>', "html"),
  ]);
  check("an anchor is found", anchored.length === 1);
  check("...and uses its link text", anchored[0]?.label === "Anleitung");

  // The sanitiser already refuses these on the way in; this is the second gate,
  // because the panel turns message text into a list of things to click.
  const unsafe = collectLinks([
    message('<a href="javascript:alert(1)">klick</a>', "html"),
    message("data:text/html;base64,PHNjcmlwdD4="),
  ]);
  check("a javascript href is dropped", unsafe.length === 0, JSON.stringify(unsafe));

  const mail = collectLinks([message('<a href="mailto:it@firma.de">IT</a>', "html")]);
  check("mailto survives", mail.length === 1 && mail[0].href === "mailto:it@firma.de");

  // One resource, however often it is quoted back.
  const repeated = collectLinks([
    message("https://firma.de/x"),
    message("https://firma.de/x", "text", "Bea"),
  ]);
  check("a repeated link appears once", repeated.length === 1);
  check(
    "...attributed to whoever posted it first",
    repeated[0]?.author === "Anna",
    repeated[0]?.author,
  );
}

console.log("retract window");
{
  const now = Date.UTC(2026, 7, 1, 9, 0, 0);
  const at = (msAgo: number) => new Date(now - msAgo);

  check("fifteen seconds", RETRACT_WINDOW_SECONDS === 15);
  check("a fresh message can be taken back", withinRetractWindow(at(0), now));
  check("...and one at fourteen seconds", withinRetractWindow(at(14_000), now));
  // The boundary is exclusive: at exactly fifteen the offer is over, which is
  // what the countdown reaching zero means on screen.
  check("...but not at exactly fifteen", !withinRetractWindow(at(15_000), now));
  check("...and not an hour later", !withinRetractWindow(at(3_600_000), now));
}

/* --------------------------------------------------------------------------
   Keyboard shortcuts and template tokens.

   `isTypingTarget` is the entire safety rule of the shortcut system in one
   function, and getting it wrong in the permissive direction means pressing `m`
   mid-sentence assigns the ticket and swallows a letter — a silent, wrong write
   from a keystroke somebody meant as text. Worth asserting rather than reasoning
   about inside a keydown handler.
   -------------------------------------------------------------------------- */
console.log("shortcut safety");
{
  const probe = (
    tagName: string,
    extra: {
      inputType?: string;
      contentEditable?: boolean;
      insideOverlay?: boolean;
    } = {},
  ) => ({
    tagName,
    inputType: extra.inputType,
    contentEditable: extra.contentEditable ?? false,
    insideOverlay: extra.insideOverlay ?? false,
  });

  check("a textarea swallows keys", swallowsKeys(probe("TEXTAREA")));
  check(
    "a text input swallows keys",
    swallowsKeys(probe("INPUT", { inputType: "text" })),
  );
  // No `type` attribute means a text input, and that is the common case.
  check("an input with no type swallows keys", swallowsKeys(probe("INPUT")));
  check("a select swallows keys", swallowsKeys(probe("SELECT")));
  // The one an `instanceof HTMLInputElement` check misses entirely, and the most
  // likely place in MITS for somebody to type an `r`.
  check(
    "contenteditable swallows keys",
    swallowsKeys(probe("DIV", { contentEditable: true })),
  );
  check(
    "an open dialog swallows keys",
    swallowsKeys(probe("DIV", { insideOverlay: true })),
  );
  // Lower-case tagName happens in XHTML documents and in a few test setups.
  check("the tag name is compared case-insensitively", swallowsKeys(probe("textarea")));

  check("a plain div does not", !swallowsKeys(probe("DIV")));
  check("a button does not", !swallowsKeys(probe("BUTTON")));
  // A form of switches should not disable the shortcuts of the page it sits on.
  check(
    "a checkbox does not",
    !swallowsKeys(probe("INPUT", { inputType: "checkbox" })),
  );
  check("a radio does not", !swallowsKeys(probe("INPUT", { inputType: "radio" })));

  check(
    "a bare key is ours",
    isPlainKey({ ctrlKey: false, metaKey: false, altKey: false }),
  );
  // Ctrl+R reloads and Cmd+M minimises; claiming those takes a keystroke the
  // operating system already owns.
  check("ctrl is not", !isPlainKey({ ctrlKey: true, metaKey: false, altKey: false }));
  check("cmd is not", !isPlainKey({ ctrlKey: false, metaKey: true, altKey: false }));
  check("alt is not", !isPlainKey({ ctrlKey: false, metaKey: false, altKey: true }));
}

console.log("shortcut reference");
{
  // The failure this catches: two handlers on one page both claiming `r`.
  for (const group of SHORTCUT_GROUPS) {
    const combos = group.items.map((item) => item.keys.join("+"));
    check(
      `${group.title}: no duplicate binding`,
      new Set(combos).size === combos.length,
      combos.join(", "),
    );
    check(
      `${group.title}: every entry is explained`,
      group.items.every((item) => item.description.trim() !== "" && item.keys.length > 0),
    );
  }
}

console.log("template tokens");
{
  const values = {
    ticket_number: "0000000000000042",
    ticket_category: "Hardware-Bestellung",
    reporter_name: "Anna Meier",
    reporter_first_name: "Anna",
    agent_name: "Bea Schulz",
    agent_first_name: "Bea",
  };

  check(
    "the dotted form resolves",
    fillCannedResponse("Hallo {{kunde.vorname}},", values) === "Hallo Anna,",
  );
  check(
    "full names resolve",
    fillCannedResponse("{{kunde.name}} / {{agent.name}}", values) ===
      "Anna Meier / Bea Schulz",
  );
  check(
    "ticket tokens resolve",
    fillCannedResponse("{{ticket.id}} — {{ticket.kategorie}}", values) ===
      "0000000000000042 — Hardware-Bestellung",
  );
  // Templates written before the dotted syntax are sitting in mits_setting on
  // every existing instance; dropping them would mail the literal token out.
  check(
    "the old single-brace form still works",
    fillCannedResponse("{reporter_name} / {agent_name}", values) ===
      "Anna Meier / Bea Schulz",
  );
  check(
    "a repeated token is replaced every time",
    fillCannedResponse("{{kunde.vorname}} {{kunde.vorname}}", values) === "Anna Anna",
  );
  // An unknown token is left standing rather than blanked: an admin who mistyped
  // one sees it in the preview instead of finding a hole in a sent message.
  check(
    "an unknown token is left alone",
    fillCannedResponse("{{kunde.spitzname}}", values) === "{{kunde.spitzname}}",
  );

  check("a first name is the first word", firstNameOf("Anna Meier") === "Anna");
  check("one word is its own first name", firstNameOf("Anna") === "Anna");
  // Greeting somebody by a mangled fragment of their address is worse than
  // greeting them by the address.
  check(
    "an address is not split",
    firstNameOf("anna.meier@firma.de") === "anna.meier@firma.de",
  );
  check("empty stays empty", firstNameOf("   ") === "");
}

console.log("\nreminder presets");
{
  const BERLIN = "Europe/Berlin";

  /*
   * The offsets are plain arithmetic and must not be snapped to a wall clock:
   * "in 2 Stunden" means two hours from now, and rounding the shortest preset is
   * how it becomes the one that lies most.
   */
  const noon = new Date("2026-08-05T12:00:00.000Z");
  check(
    "two hours is two hours",
    reminderDueAt("hours-2", noon, BERLIN).toISOString() ===
      "2026-08-05T14:00:00.000Z",
  );
  check(
    "three days is three days",
    reminderDueAt("days-3", noon, BERLIN).toISOString() ===
      "2026-08-08T12:00:00.000Z",
  );

  /*
   * "Morgen 09:00" is a wall-clock time in the instance's zone, so the stored
   * instant differs by the offset. Berlin is UTC+2 in August: 09:00 local is
   * 07:00Z. Getting this wrong by one pass of the correction lands in the wrong
   * hour for every zone but UTC.
   */
  check(
    "tomorrow 09:00 Berlin is 07:00Z in summer",
    reminderDueAt("tomorrow-9", noon, BERLIN).toISOString() ===
      "2026-08-06T07:00:00.000Z",
  );
  check(
    "tomorrow 09:00 UTC is 09:00Z",
    reminderDueAt("tomorrow-9", noon, "UTC").toISOString() ===
      "2026-08-06T09:00:00.000Z",
  );

  /*
   * Late-evening UTC is already the next calendar day in Berlin, so "tomorrow"
   * has to be the day after that. Adding 24 h to the instant would answer the
   * 6th here, which is today for the person reading it.
   */
  const lateEvening = new Date("2026-08-05T22:30:00.000Z");
  check(
    "tomorrow is the next local day, not now plus 24h",
    reminderDueAt("tomorrow-9", lateEvening, BERLIN).toISOString() ===
      "2026-08-07T07:00:00.000Z",
  );

  // Winter: Berlin is UTC+1, so the same wall time is an hour earlier in UTC.
  // This is the case a single-offset implementation gets wrong twice a year.
  const january = new Date("2026-01-15T12:00:00.000Z");
  check(
    "tomorrow 09:00 Berlin is 08:00Z in winter",
    reminderDueAt("tomorrow-9", january, BERLIN).toISOString() ===
      "2026-01-16T08:00:00.000Z",
  );

  // The DST boundary itself. Clocks go forward on 29 March 2026 at 02:00 local,
  // so 09:00 that morning is already summer time.
  const beforeSwitch = new Date("2026-03-28T12:00:00.000Z");
  check(
    "the morning of the spring-forward switch is summer time",
    reminderDueAt("tomorrow-9", beforeSwitch, BERLIN).toISOString() ===
      "2026-03-29T07:00:00.000Z",
  );

  check(
    "the morning hour is nine",
    instantForZonedTime(2026, 8, 6, MORNING_HOUR, 0, "UTC").toISOString() ===
      "2026-08-06T09:00:00.000Z",
  );

  // A month boundary, so nothing depends on a hand-written month-length table.
  check(
    "tomorrow crosses into the next month",
    reminderDueAt(
      "tomorrow-9",
      new Date("2026-08-31T12:00:00.000Z"),
      "UTC",
    ).toISOString() === "2026-09-01T09:00:00.000Z",
  );

  /*
   * A datetime-local reading carries no zone. Interpreting it in the server's
   * zone would file a Berlin agent's 14:30 as 16:30 on an instance in UTC.
   */
  check(
    "a local reading resolves through the instance zone",
    parseLocalDateTime("2026-08-06T14:30", BERLIN)?.toISOString() ===
      "2026-08-06T12:30:00.000Z",
  );
  check("a malformed reading is null", parseLocalDateTime("morgen", BERLIN) === null);
  check(
    "a reading without minutes is null",
    parseLocalDateTime("2026-08-06T14", BERLIN) === null,
  );

  // The bounds. A past date is refused rather than clamped to now: a reminder
  // that fires the instant it is created looks like a broken button.
  check(
    "a preset resolves",
    resolveReminderDue({ preset: "hours-2" }, noon, BERLIN) !== null,
  );
  check(
    "an unknown preset falls through to the date, and there is none",
    resolveReminderDue({ preset: "next-week" }, noon, BERLIN) === null,
  );
  check(
    "a past date is refused",
    resolveReminderDue({ at: "2020-01-01T09:00" }, noon, BERLIN) === null,
  );
  check(
    "a date ten years out is refused",
    resolveReminderDue({ at: "2036-01-01T09:00" }, noon, BERLIN) === null,
  );
  check(
    "a date next week is accepted",
    resolveReminderDue({ at: "2026-08-12T09:00" }, noon, BERLIN) !== null,
  );
  check("nothing at all is null", resolveReminderDue({}, noon, BERLIN) === null);
}

console.log("\nauto-triage");
{
  const rule = (over: Record<string, unknown>) =>
    TriageRuleSchema.parse({ id: "r", title: "t", ...over });

  const printers = rule({
    id: "printers",
    title: "Drucker",
    keywords: ["drucker", "toner"],
    category_id: "cat-printers",
    order_index: 0,
  });
  const hardware = rule({
    id: "hardware",
    title: "Hardware",
    keywords: ["notebook"],
    category_id: "cat-hardware",
    order_index: 1,
  });

  check("an exact token matches", matchesKeyword(["drucker"], "drucker"));
  check("an absent token does not", !matchesKeyword(["monitor"], "drucker"));

  /*
   * German compounds are the whole reason the prefix rule exists:
   * "Druckereinstellungen" is one token, and a whole-word-only matcher would
   * miss most of how people write.
   */
  check(
    "a compound matches on its prefix",
    matchesKeyword(["druckereinstellungen"], "drucker"),
  );
  // Below the floor the prefix rule would fire on unrelated words - "mail" on
  // "mailand", "netz" on half the vocabulary.
  check(
    "a short keyword does not match as a prefix",
    KEYWORD_PREFIX_MIN === 5 && !matchesKeyword(["mailand"], "mail"),
  );

  check(
    "a matching rule is found",
    matchTriageRules("Der Drucker im 2. OG druckt nicht", [printers, hardware])
      .length === 1,
  );
  check(
    "nothing matches an unrelated text",
    matchTriageRules("Bildschirm flackert", [printers, hardware]).length === 0,
  );

  /*
   * Strength is the number of distinct keywords found, not their total count:
   * one word said eight times is one piece of evidence.
   */
  const both = rule({
    id: "both",
    title: "Beides",
    keywords: ["drucker", "toner"],
    category_id: "cat-both",
    order_index: 5,
  });
  const single = rule({
    id: "one",
    title: "Eins",
    keywords: ["drucker"],
    category_id: "cat-one",
    order_index: 0,
  });
  check(
    "two distinct hits beat one, whatever the order index",
    triage("Drucker braucht Toner", [single, both]).categoryId === "cat-both",
  );
  check(
    "repetition does not raise the score",
    triage("Drucker Drucker Drucker", [single, both]).categoryId === "cat-one",
  );

  // A disabled rule is invisible to the matcher.
  check(
    "a disabled rule never matches",
    triage("Drucker kaputt", [rule({ ...printers, enabled: false })])
      .categoryId === "",
  );

  /*
   * A rule may exist only to offer articles. Letting it win the category would
   * mean a better-matching filing rule below it never applies.
   */
  const articlesOnly = rule({
    id: "pw",
    title: "Passwort",
    keywords: ["passwort", "kennwort"],
    faq_ids: ["faq-1"],
    order_index: 0,
  });
  const filing = rule({
    id: "accounts",
    title: "Konten",
    keywords: ["passwort"],
    category_id: "cat-accounts",
    order_index: 1,
  });
  const outcome = triage("Passwort und Kennwort vergessen", [
    articlesOnly,
    filing,
  ]);
  check(
    "a rule without a category does not block one with it",
    outcome.categoryId === "cat-accounts",
  );
  check(
    "articles come from every match, not only the deciding one",
    outcome.faqIds.join(",") === "faq-1",
  );

  // Priority travels with the deciding rule, so the two cannot come from two
  // different statements about the same ticket.
  const urgent = rule({
    id: "server",
    title: "Server",
    keywords: ["server", "ausfall"],
    category_id: "cat-server",
    priority: "critical",
    order_index: 0,
  });
  check(
    "the deciding rule carries the priority",
    triage("Server Ausfall", [urgent]).priority === "critical",
  );
  check(
    "no match means no priority change",
    triage("Kaffeemaschine", [urgent]).priority === "",
  );
  check(
    "no match means no rule",
    triage("Kaffeemaschine", [urgent]).match === null,
  );
  check("an empty rule list is inert", triage("Drucker", []).categoryId === "");
}

console.log("\ncolumn guessing");
{
  const guess = (header: string) => guessColumnMapping([header])[header];

  /*
   * The bug this section exists for.
   *
   * The patterns are substrings and were ordered wrongly, so `nummer$` matched
   * "Seriennummer" before the serial pattern was reached. A file with both columns
   * put the tag in the tag column and then dropped every serial number: the second
   * column resolved to asset_tag too, found it taken, and became "do not import".
   * The import reported success and the field was empty on every row.
   */
  check("a serial number is a serial number", guess("Seriennummer") === "serial_number");
  check("an inventory number is the foreign tag", guess("Inventarnummer") === "asset_tag");
  check("so is a Fremdnummer", guess("Fremdnummer") === "asset_tag");

  // …and the two together, which is the case that actually failed.
  {
    const mapping = guessColumnMapping(["Fremdnummer", "Seriennummer"]);
    check(
      "both number columns land in different fields",
      mapping["Fremdnummer"] === "asset_tag" &&
        mapping["Seriennummer"] === "serial_number",
    );
  }

  // One column per target still holds: a second name column is ignored rather
  // than overwriting the first one's mapping.
  {
    const mapping = guessColumnMapping(["Bezeichnung", "Name"]);
    check(
      "a second column for one target is ignored",
      mapping["Bezeichnung"] === "name" && mapping["Name"] === IGNORE_COLUMN,
    );
  }

  check("OTRS calls the class Klasse", guess("Klasse") === "type");
  check(
    "and the deployment state Verwendungsstatus",
    guess("Verwendungsstatus") === "status",
  );
  /*
   * The incident state is kept as an attribute, not as the status.
   *
   * OTRS ITSM has two status axes and MITS has one. Folding them together would be
   * unrecoverable — "in production with an open incident" arrives as one or the
   * other — and dropping it would throw the information away. It also has to be
   * decided before the guess table, because "vorfallstatus" contains "status":
   * whichever of the two columns came first would claim the field and the other
   * would be silently dropped.
   */
  check(
    "the incident state becomes an attribute",
    guess("Vorfallstatus") === AS_ATTRIBUTE,
  );
  check("so does InciState", guess("InciState") === AS_ATTRIBUTE);
  // …and the real status axis is unaffected, whichever order they arrive in.
  {
    const mapping = guessColumnMapping(["Vorfallstatus", "Verwendungsstatus"]);
    check(
      "the deployment state still reaches the status field",
      mapping["Verwendungsstatus"] === "status" &&
        mapping["Vorfallstatus"] === AS_ATTRIBUTE,
    );
  }

  /*
   * MITS's own number is its own target and is checked before the generic number
   * pattern — it also ends in "nummer". A plain `Inventarnummer` still means
   * somebody else's number and stays the foreign one, which is the distinction that
   * keeps an OTRS export importing correctly.
   */
  check("the MITS number has its own target", guess("MITS-Nummer") === "inventory_match");
  check("MITS-Nr works too", guess("MITS-Nr") === "inventory_match");
  check(
    "a plain Inventarnummer is still the foreign number",
    guess("Inventarnummer") === "asset_tag",
  );

  // The attribute prefix wins over the guess table, which is what keeps an
  // exported attribute column an attribute.
  check(
    "an attribute column stays an attribute",
    guess(`${ATTRIBUTE_PREFIX}RAM`) === AS_ATTRIBUTE,
  );

  // …and does not gain a second prefix on the next round trip.
  {
    const submitted = mappingForSubmit({ [`${ATTRIBUTE_PREFIX}RAM`]: AS_ATTRIBUTE });
    check(
      "an already-prefixed attribute is not prefixed twice",
      submitted[`${ATTRIBUTE_PREFIX}RAM`] === `${ATTRIBUTE_PREFIX}RAM`,
    );
  }
  {
    const submitted = mappingForSubmit({ "Betriebssystem": AS_ATTRIBUTE });
    check(
      "a plain column is named after itself",
      submitted["Betriebssystem"] === `${ATTRIBUTE_PREFIX}Betriebssystem`,
    );
  }
  check(
    "an ignored column does not reach the server",
    Object.keys(mappingForSubmit({ Irgendwas: IGNORE_COLUMN })).length === 0,
  );

  // OTRS deployment states. `Wartung` is repair and not stock: not available, not
  // scrapped. `Pilot` is in service — somebody is using the machine.
  check("Wartung is repair", coerceCIStatus("Wartung") === "repair");
  check("Pilot is in service", coerceCIStatus("Pilot") === "active");
  check("Abgelaufen is retired", coerceCIStatus("Abgelaufen") === "retired");
  // The safe direction: an unknown state must not scrap an asset silently.
  check("an unknown state is in service", coerceCIStatus("Blubb") === "active");
  check("an OTRS Location class is not hardware", coerceCIType("Location") === "other");
  check("a Server class is hardware", coerceCIType("Server") === "hardware");
}

console.log("\ncmdb export");
{
  const item = (over: Record<string, unknown>) =>
    MITSConfigurationItemSchema.parse({
      id: "ci-1",
      inventory_number: 1,
      name: "Notebook 1",
      type: "hardware",
      status: "active",
      created_at: "2026-08-05T10:00:00.000Z",
      updated_at: "2026-08-05T10:00:00.000Z",
      ...over,
    });

  const lookups = {
    organizations: { "org-1": "Weller GmbH" },
    locations: { "loc-1": "Hamburg" },
    userEmails: { "user-1": "anna@firma.de" },
  };

  /*
   * The property the whole file exists for: every header the export writes is one
   * the importer's guess resolves back to the field it came from. A header renamed
   * without its guess following along would silently drop a column on re-import,
   * and the import would still report success.
   */
  {
    const csv = itemsToCsv([item({})], lookups);
    const { headers } = parseDelimited(csv);
    const mapping = guessColumnMapping(headers);

    const wrong = EXPORT_COLUMNS.filter(
      (column) => mapping[column.header] !== column.target,
    ).map((column) => `${column.header} -> ${mapping[column.header]}`);

    check(
      "every exported column maps back to its own field",
      wrong.length === 0,
      wrong.join(", "),
    );
  }

  // The MITS number is exported and comes back as a match key, not as a value.
  {
    const csv = itemsToCsv([item({ inventory_number: 42 })], lookups);
    const { headers, rows } = parseDelimited(csv);
    check(
      "the MITS number is exported in its label form",
      rows[0]["MITS-Nummer"] === "INV-10000042",
    );
    check(
      "…and maps to the match-only target",
      guessColumnMapping(headers)["MITS-Nummer"] === "inventory_match",
    );
  }

  // References become readable values, not ids — an export full of UUIDs is one
  // nobody can edit, and the importer resolves these back by name.
  {
    const csv = itemsToCsv(
      [
        item({
          organization_id: "org-1",
          location_id: "loc-1",
          assigned_user_id: "user-1",
        }),
      ],
      lookups,
    );
    const { rows } = parseDelimited(csv);
    check("the company is its name", rows[0].Firma === "Weller GmbH");
    check("the site is its name", rows[0].Standort === "Hamburg");
    check(
      "the person is their address",
      rows[0]["Zugeordnet an"] === "anna@firma.de",
    );
  }

  // A reference whose target is gone becomes empty rather than the raw id. The
  // importer would otherwise try to resolve a UUID and report it as unresolvable.
  {
    const csv = itemsToCsv([item({ organization_id: "org-weg" })], lookups);
    const { rows } = parseDelimited(csv);
    check("a dangling reference is empty", rows[0].Firma === "");
  }

  /*
   * Quoting. A note containing the separator, a quote and a line break is the row
   * that shifts every column to its right — and it opens in Excel without
   * complaint and is wrong.
   */
  {
    const nasty = 'Zeile 1;mit "Zitat"\nund Umbruch';
    const csv = itemsToCsv([item({ note: nasty })], lookups);
    const { rows } = parseDelimited(csv);
    check("a semicolon survives", rows[0].Notiz.includes(";"));
    check("a quote survives", rows[0].Notiz.includes('"Zitat"'));
    check("the row is not split by the line break", rows.length === 1);
  }

  // Attributes: one column per key found anywhere, so the sheet stays rectangular.
  {
    const csv = itemsToCsv(
      [
        item({ id: "a", attributes: { RAM: "16 GB" } }),
        item({ id: "b", attributes: { Betriebssystem: "Windows 11" } }),
      ],
      lookups,
    );
    const { headers, rows } = parseDelimited(csv);
    check(
      "both attribute columns exist",
      headers.includes(`${ATTRIBUTE_PREFIX}RAM`) &&
        headers.includes(`${ATTRIBUTE_PREFIX}Betriebssystem`),
    );
    check(
      "an asset without the attribute has an empty cell",
      rows[0][`${ATTRIBUTE_PREFIX}Betriebssystem`] === "",
    );
    check(
      "attribute keys are sorted, so two exports diff cleanly",
      attributeKeys([
        item({ attributes: { RAM: "1", Akku: "2" } }),
      ]).join(",") === "Akku,RAM",
    );
  }

  // A seat count of zero is blank rather than "0" — noise on four hundred laptops
  // whose licence rows are the only ones the number means anything for. Both read
  // back as zero through `parseSeats`.
  {
    const csv = itemsToCsv([item({ seats_total: 0 })], lookups);
    const { rows } = parseDelimited(csv);
    check("zero seats is an empty cell", rows[0]["Lizenzplätze"] === "");
  }

  // An empty selection still writes the header row: an empty file reads as a
  // failed download, a header row as "this filter matched nothing".
  {
    const { headers, rows } = parseDelimited(itemsToCsv([], lookups));
    check(
      "an empty export still has its headers",
      headers.length === EXPORT_COLUMNS.length && rows.length === 0,
    );
  }

  check(
    "the filename carries the date",
    exportFilename(new Date("2026-08-05T12:00:00.000Z")) ===
      "mits-bestand-2026-08-05.csv",
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sichtbarkeit je Rolle.

   Rein und deshalb hier prüfbar. Das Fehlerbild jeder dieser Regeln ist eine
   Oberfläche, die für eine Rolle stillschweigend weniger zeigt als gedacht —
   also nichts, was beim Klicken auffällt, solange man mit dem eigenen
   Admin-Konto testet.
   ────────────────────────────────────────────────────────────────────────── */

console.log("\nrole visibility");
{
  check(
    "nichts weggenommen ist der Default",
    DEFAULT_ROLE_VISIBILITY.user.hidden_forms.length === 0 &&
      DEFAULT_ROLE_VISIBILITY.agent.hidden_areas.length === 0,
  );

  check(
    "admin steht nicht in den einschränkbaren Rollen",
    !(RESTRICTABLE_ROLES as readonly string[]).includes("admin"),
  );

  const rules = RoleVisibilitySchema.parse({
    user: {
      hidden_forms: ["hardware-order", "hardware-order", " "],
      // Der Fall, der ohne Filter die ganze Konfiguration mitnähme.
      hidden_areas: ["mits_cmdb", "widget_das_es_nicht_mehr_gibt"],
    },
  });

  check(
    "ein unbekannter Bereichsschlüssel wird verworfen, nicht abgelehnt",
    rules.user.hidden_areas.length === 1 &&
      rules.user.hidden_areas[0] === "mits_cmdb",
  );
  check(
    "die Formularregel daneben überlebt das",
    rules.user.hidden_forms.length === 1 &&
      rules.user.hidden_forms[0] === "hardware-order",
  );
  check(
    "eine fehlende Rolle heißt: alles sichtbar",
    rules.agent.hidden_forms.length === 0 &&
      rules.agent.hidden_areas.length === 0,
  );

  check(
    "ein ausgeblendetes Formular ist für diese Rolle weg",
    !roleSeesForm(rules, "user", "hardware-order"),
  );
  check(
    "für jede andere Rolle nicht",
    roleSeesForm(rules, "agent", "hardware-order"),
  );
  check(
    "die Administration sieht alles, egal was gespeichert ist",
    roleSeesForm(rules, "admin", "hardware-order") &&
      roleSeesArea(rules, "admin", "mits_cmdb"),
  );

  check(
    "ein Bereich lässt sich nehmen",
    !roleSeesArea(rules, "user", "mits_cmdb"),
  );
  check(
    "und die anderen Bereiche bleiben",
    roleSeesArea(rules, "user", "customer_new"),
  );

  // Ein Melder bekommt in der Maske keinen Schalter für einen Agentenbereich —
  // sonst behauptete die Oberfläche, er käme sonst in die CMDB.
  check(
    "der Melder sieht nur seine eigenen Flächen",
    !areasForRole("user").includes("mits_cmdb") &&
      areasForRole("user").includes("customer_new"),
  );
  check(
    "der Agent bekommt beides",
    areasForRole("agent").includes("mits_cmdb") &&
      areasForRole("agent").includes("customer_new"),
  );

  // Jeder Bereich braucht eine Beschriftung, sonst ließe er sich nicht rendern.
  check(
    "jeder Bereich ist beschriftet",
    NAV_AREAS.every((area) => NAV_AREA_META[area].label.trim().length > 0),
  );

  // Die beiden Zuhause tragen keinen Schlüssel: sie sind das Ziel der Umleitung,
  // und ein abschaltbares Ziel wäre eine Schleife.
  check(
    "es gibt keinen Schalter für /customer oder /mits",
    !(NAV_AREAS as readonly string[]).includes("customer_home") &&
      !(NAV_AREAS as readonly string[]).includes("mits_home"),
  );
}

console.log("\nvisibility presets");
{
  const ids = BUILTIN_SCHEMAS.map((schema) => schema.id);

  // Der eine Fehler, den man an der Oberfläche nicht sieht: eine Vorlage zeigt
  // auf eine Formular-Id von gestern, die Positivliste trifft nichts, und das
  // Anwenden blendet **alles** aus.
  for (const [presetId, keep] of Object.entries(PRESET_KEEP_FORMS)) {
    check(
      `die Vorlage „${presetId}" zeigt nur auf existierende Formulare`,
      keep.every((id) => ids.includes(id)),
      JSON.stringify(keep.filter((id) => !ids.includes(id))),
    );
  }

  check(
    "die drei mitgelieferten Vorlagen sind da",
    DEFAULT_VISIBILITY_PRESETS.length === 3 &&
      DEFAULT_VISIBILITY_PRESETS.some((preset) => preset.role === "agent") &&
      DEFAULT_VISIBILITY_PRESETS.some(
        (preset) => preset.id === "personalabteilung",
      ),
  );
  check(
    "keine zwei Vorlagen teilen eine Kennung",
    new Set(DEFAULT_VISIBILITY_PRESETS.map((preset) => preset.id)).size ===
      DEFAULT_VISIBILITY_PRESETS.length,
  );

  const hr = DEFAULT_VISIBILITY_PRESETS.find(
    (preset) => preset.id === "personalabteilung",
  )!;

  // Die Positivliste wird gegen den *aktuellen* Bestand aufgelöst — ein später
  // gebautes Formular ist damit ebenfalls weg, statt still sichtbar zu bleiben.
  const applied = presetRulesFor(hr, [...ids, "spaeter-gebautes-formular"]);
  check(
    "die HR-Vorlage lässt Eintritt und Freitext stehen",
    !applied.hidden_forms.includes("user-onboarding") &&
      !applied.hidden_forms.includes("quick-ticket"),
  );
  check(
    "sie nimmt den übrigen Katalog weg",
    applied.hidden_forms.includes("hardware-order") &&
      applied.hidden_forms.includes("security-incident"),
  );
  check(
    "und auch ein Formular, das es beim Anlegen der Vorlage nicht gab",
    applied.hidden_forms.includes("spaeter-gebautes-formular"),
  );
  // Aufgelöst wird gegen den vollen Bestand, nicht gegen den bereits
  // gefilterten — sonst nähme jedes Anwenden weiter weg, bis nichts mehr da ist.
  check(
    "die Streichliste enthält nur Formulare, die es gibt",
    applied.hidden_forms.every((id) =>
      [...ids, "spaeter-gebautes-formular"].includes(id),
    ),
  );

  // Eine selbst gesicherte Vorlage ist eine Momentaufnahme und wird nicht gegen
  // den Bestand nachgerechnet — sonst hieße „gesichert" etwas anderes als das,
  // was auf den Schaltern stand.
  const own = VisibilityPresetSchema.parse({
    id: crypto.randomUUID(),
    name: "Eigene",
    role: "user",
    hidden_forms: ["hardware-order"],
    hidden_areas: ["intake_ai"],
  });
  const ownApplied = presetRulesFor(own, ids);
  check(
    "eine eigene Vorlage bleibt, was gesichert wurde",
    ownApplied.hidden_forms.length === 1 &&
      ownApplied.hidden_forms[0] === "hardware-order" &&
      ownApplied.hidden_areas[0] === "intake_ai",
  );

  check(
    "eine Vorlage ohne Namen wird abgelehnt",
    !VisibilityPresetSchema.safeParse({
      id: "x",
      name: "",
      role: "user",
    }).success,
  );
  check(
    "und eine für die Administration ebenfalls",
    !VisibilityPresetSchema.safeParse({
      id: "x",
      name: "Alles",
      role: "admin",
    }).success,
  );
}

console.log("\ndrei status: die legacy-zuordnung");
{
  /*
   * **Die Prüfung, die einen Totalausfall verhindert.**
   *
   * Sechs Werte wurden drei. Migriert wird in `lib/db/sqlite.ts` — aber eine aus
   * einem älteren Backup zurückgespielte Datenbank hat die Migration nie gesehen,
   * und ohne `LEGACY_STATUS_MAP` scheitert `MITSTicketSchema` dann an *jeder*
   * Zeile und nimmt ganze Listen mit. Dieselbe Absicherung wie bei den
   * Prioritäten, und aus demselben Grund hier festgehalten.
   */
  const parse = (status: string) => TicketStatus.safeParse(status);

  check("in_progress wird offen", parse("in_progress").data === "open");
  check("waiting_major wird offen", parse("waiting_major").data === "open");
  check("resolved wird abgeschlossen", parse("resolved").data === "closed");
  check("ein neuer wert bleibt", parse("waiting_user").data === "waiting_user");
  check("und etwas Unbekanntes wird abgelehnt", !parse("halbfertig").success);

  // Am ganzen Ticket, nicht nur am Feld: das ist der Weg, den eine gelesene Zeile
  // wirklich nimmt.
  const legacy = MITSTicketSchema.safeParse({
    id: "t1",
    created_by: "u1",
    created_by_email: "anna@firma.de",
    source: "legacy",
    title: "Alter Bestand",
    payload: {},
    status: "resolved",
    priority: "normal",
    created_at: "2024-01-01T00:00:00.000Z",
  });
  check(
    "eine alte Ticketzeile parst und zeigt auf den neuen Wert",
    legacy.success && legacy.data.status === "closed",
  );

  check("drei werte, nicht sechs", TicketStatusValues.length === 3);
}

console.log("\nballbesitz: status nach einer antwort");
{
  /*
   * Die ganze Tabelle, beide Schreiber.
   *
   * Das ist die Prüfung, die zählt: die Regel ist eine reine Funktion, und eine
   * falsche Zeile darin ist ein Ticket, das im falschen Tab liegt — sichtbar
   * erst, wenn jemand es dort sucht.
   */
  const agent = (from: (typeof TicketStatusValues)[number], assigned = true) =>
    nextStatusAfterReply(from, true, assigned);
  const reporter = (from: (typeof TicketStatusValues)[number], assigned = true) =>
    nextStatusAfterReply(from, false, assigned);

  check("agent auf offen -> wartet auf anwender", agent("open") === "waiting_user");
  check("agent auf wartend -> nichts", agent("waiting_user") === null);
  check("agent auf abgeschlossen -> nichts", agent("closed") === null);

  check("melder auf offen -> nichts", reporter("open") === null);
  check("melder auf wartend -> offen", reporter("waiting_user") === "open");
  check("melder auf abgeschlossen -> offen", reporter("closed") === "open");

  // Die Zuweisung entscheidet nichts mehr: „in Bearbeitung" wird angezeigt, nicht
  // gespeichert. Beide Richtungen geprüft, damit der Parameter nicht still wieder
  // Bedeutung bekommt.
  check(
    "der bearbeiter aendert das ergebnis nicht",
    reporter("closed", false) === "open" && reporter("closed", true) === "open",
  );

  // Jeder Status ist abgedeckt: eine neue Lebenszyklus-Stufe soll hier auffallen
  // und nicht erst dadurch, dass sie sich nie bewegt.
  check(
    "die tabelle kennt jeden status",
    TicketStatusValues.every(
      (status) => agent(status) !== undefined && reporter(status) !== undefined,
    ),
  );
}

console.log("\nabgeleiteter zustand");
{
  /*
   * Fünf lesbare Zustände aus drei gespeicherten Werten. Das ist der Tausch, der
   * die Statusliste kürzen konnte — geht er kaputt, sieht jedes Ticket gleich aus.
   */
  const state = (
    status: (typeof TicketStatusValues)[number],
    extra: { assigned_to?: string | null; parkedBehindMajor?: boolean } = {},
  ) => describeTicketState({ status, ...extra });

  check("offen und herrenlos -> Neu", state("open").agent === "Neu");
  check(
    "offen mit bearbeiter -> In Bearbeitung",
    state("open", { assigned_to: "u1" }).agent === "In Bearbeitung",
  );
  check(
    "die hauptstoerung sticht den bearbeiter",
    state("open", { assigned_to: "u1", parkedBehindMajor: true }).agent ===
      "Bekannte Störung",
  );
  check(
    "wartend nennt den melder",
    state("waiting_user").long === "Wir warten auf Ihre Antwort",
  );
  check("abgeschlossen bleibt abgeschlossen", state("closed").agent === "Abgeschlossen");

  // Eine Hauptstörung an einem abgeschlossenen Ticket darf den Endzustand nicht
  // überschreiben: das Kind ist fertig, die Störung ändert daran nichts.
  check(
    "abgeschlossen sticht die hauptstoerung",
    state("closed", { parkedBehindMajor: true }).agent === "Abgeschlossen",
  );

  check(
    "jeder wert liefert drei nicht leere texte",
    TicketStatusValues.every((status) => {
      const view = state(status);
      return (
        view.agent.length > 0 && view.short.length > 0 && view.long.length > 0
      );
    }),
  );
}

console.log("\nverfallsfristen");
{
  check("eine unbekannte frist wird zu aus", toAutoCloseDays(4) === 0);
  check("und ein tippfehler ebenfalls", toAutoCloseDays("sieben") === 0);
  check("ein angebotener wert bleibt", toAutoCloseDays("14") === 14);

  const defaults = WorkflowSettingsSchema.parse({});
  check("beide schalter sind an", defaults.claimOnReply && defaults.statusFollowsReply);
  check(
    "aber keine frist laeuft",
    defaults.waitingReminderDays === 0 && defaults.waitingCloseDays === 0,
  );
  check("also schliesst nichts", !hasAutoClose(defaults));

  // Wartend ohne Erinnerung schliesst nie — die Maske sagt das, und hier steht,
  // dass es auch stimmt.
  check(
    "wartend ohne erinnerung zaehlt nicht als automatik",
    !hasAutoClose(
      WorkflowSettingsSchema.parse({ waitingCloseDays: 7, waitingReminderDays: 0 }),
    ),
  );
  check(
    "mit erinnerung schon",
    hasAutoClose(
      WorkflowSettingsSchema.parse({ waitingCloseDays: 7, waitingReminderDays: 3 }),
    ),
  );

  // Eine kaputte Zeile darf die Texte nicht mitnehmen: ohne sie ginge eine Mail
  // mit leerem Betreff an einen Kunden. Und ein Schlüssel, den dieser Build nicht
  // mehr kennt (`resolvedCloseDays` gab es einmal), wird still verworfen statt den
  // Parse abzulehnen.
  const salvaged = WorkflowSettingsSchema.parse({
    waitingReminderDays: "morgen",
    resolvedCloseDays: 7,
    waitingReminderSubject: "Kurze Nachfrage",
  });
  check("eine unlesbare frist nimmt den betreff nicht mit", (
    salvaged.waitingReminderDays === 0 &&
    salvaged.waitingReminderSubject === "Kurze Nachfrage"
  ));
  check(
    "und die vorgabetexte stehen",
    defaults.waitingReminderBody.length > 0 && defaults.autoCloseNote.length > 0,
  );
}

console.log("\nqueue-spalten");
{
  /*
   * Gespeichert wird das Ausgeblendete, gefiltert wird statt abgelehnt.
   *
   * Der zweite Teil ist die Pruefung, die zaehlt: ein Spaltenschluessel, den eine
   * spaetere Version entfernt, darf nicht die ganze Wahl mitnehmen — sonst wird aus
   * einer gepflegten Auswahl still der Auslieferungszustand.
   */
  check("keine Zeile heisst alle Spalten", toHiddenQueueColumns(null).length === 0);
  check("kein Array wird zur leeren Menge", toHiddenQueueColumns("status").length === 0);
  check(
    "ein unbekannter Schluessel wird gefiltert, nicht abgelehnt",
    (() => {
      const kept = toHiddenQueueColumns(["status", "sternzeichen", "time"]);
      return kept.length === 2 && kept.includes("status") && kept.includes("time");
    })(),
  );
  check(
    "die Reihenfolge kommt aus QUEUE_COLUMNS, nicht aus der Eingabe",
    toHiddenQueueColumns(["age", "pin"]).join(",") === "pin,age",
  );
  check(
    "Doppelte fallen zusammen",
    toHiddenQueueColumns(["status", "status"]).length === 1,
  );

  // Nummer und Titel stehen nicht zur Wahl: der Titel ist die absorbierende
  // Spalte, ohne die das automatische Layout nichts zu verteilen hat.
  check(
    "Nummer und Titel sind keine schaltbaren Spalten",
    !(QUEUE_COLUMNS as readonly string[]).includes("number") &&
      !(QUEUE_COLUMNS as readonly string[]).includes("title"),
  );
  check(
    "jede schaltbare Spalte hat eine Beschriftung",
    QUEUE_COLUMNS.every((column) => QUEUE_COLUMN_LABELS[column].length > 0),
  );

  check(
    "eine ausgeblendete Spalte ist unsichtbar, jede andere sichtbar",
    !queueColumnVisible(["time"], "time") && queueColumnVisible(["time"], "status"),
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
