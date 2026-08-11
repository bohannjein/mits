"use server";

import { revalidatePath } from "next/cache";

import {
  AISettingsError,
  getAISettings,
  getStoredAISettings,
  setAISettings,
} from "@/lib/ai-settings";
import { AIProviderError, verifyAIProvider } from "@/lib/services/ai/provider";
import { isRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled, setFeatureFlags } from "@/lib/features";
import { ingestMailbox } from "@/lib/mail/ingest";
import { saveFormSchema } from "@/lib/form-schemas";
import {
  conditionCycles,
  danglingConditions,
  resolveFields,
} from "@/lib/forms/schema-to-zod";
import { listCannedResponses, setCannedResponses } from "@/lib/canned-responses";
import { listMacros, setMacros } from "@/lib/macros";
import { setAnalyticsSettings } from "@/lib/analytics/settings";
import { invalidateAnalytics } from "@/lib/services/analytics-cache";
import { setNotificationSettings } from "@/lib/notification-settings";
import { setRoleVisibility } from "@/lib/role-visibility";
import { setVisibilityPresets } from "@/lib/visibility-presets";
import { verifyUserPassword } from "@/lib/auth/verify-password";
import { nothingSelected, purgeData, type PurgeScopes } from "@/lib/purge";
import { setTicketDisplaySettings } from "@/lib/ticket-display";
import { verifyS3 } from "@/lib/services/s3";
import { getS3Settings, setS3Settings } from "@/lib/services/storage";
import { LocationError, getLocation, replaceLocations } from "@/lib/locations";
import {
  CategoryError,
  isFilableCategory,
  replaceCategories,
} from "@/lib/ticket-categories";
import { TriageRuleError, setTriageRules } from "@/lib/triage-rules";
import {
  OrganizationError,
  deleteOrganization,
  getOrganization,
  organizationExists,
  saveOrganization,
} from "@/lib/organizations";
import { testMail } from "@/lib/mail-templates";
import {
  SmtpError,
  getEffectiveSmtpSettings,
  sendMail,
  setSmtpSettings,
  verifySmtp,
} from "@/lib/smtp";
import {
  setMaintenanceNotices,
  setPortalConfig,
  setPortalContent,
  setPortalFaqs,
  setPortalServices,
} from "@/lib/portal";
import { applyRetention, setDataSettings } from "@/lib/data-settings";
import { getMailSettings, incidentRuleConfig, setMailSettings } from "@/lib/mail-settings";
import { classifyDefenderAlert } from "@/lib/mail/defender";
import { planSecurityIncident } from "@/lib/mail/incident-rule";
import { queryNtp } from "@/lib/ntp";
import { normaliseDomains, setAuthSettings } from "@/lib/settings";
import {
  SystemSettingsError,
  setSystemSettings,
} from "@/lib/system-settings";
import { unusableFaqAttachments } from "@/lib/storage";
import {
  UserProfileError,
  setOrgAdmin,
  setUserOrganization,
  setUserProfile,
} from "@/lib/user-profile";
import {
  ProfileError,
  RoleChangeError,
  findUser,
  setUserName,
  setUserRole,
} from "@/lib/users";
import {
  AIProvider,
  ANALYTICS_WIDGETS,
  AnalyticsSettingsSchema,
  NOTIFICATION_CHANNELS,
  NotificationSettingsSchema,
  AI_FEATURES,
  AI_FEATURE_META,
  CannedResponseSchema,
  CATEGORY_ROOT,
  MacroSchema,
  MITSTicketCategorySchema,
  TriageRuleSchema,
  S3SettingsSchema,
  isS3Configured,
  isS3Endpoint,
  macroIsEmpty,
  resolveSmtpPassword,
  FEATURE_FLAG_META,
  FeatureFlagsSchema,
  RESTRICTABLE_ROLES,
  RoleVisibilitySchema,
  SESSION_LIFETIME_LABELS,
  toSessionLifetimeDays,
  VisibilityPresetSchema,
  MITSLocationSchema,
  MITSOrganizationSchema,
  NO_LOCATION,
  NO_ORGANIZATION,
  MailTransport,
  NO_ON_CALL,
  isMailInboundConfigured,
  PortalConfigSchema,
  PortalContentSchema,
  PortalFaqSchema,
  PortalMaintenanceSchema,
  PortalServiceSchema,
  REFRESH_LABELS,
  PURGE_CONFIRM_WORD,
  SmtpSettingsSchema,
  SystemSettingsSchema,
  TICKET_FORM_DISPLAY_META,
  TicketDisplaySettingsSchema,
  clockHealth,
  isSafeResourceHref,
  isSmtpConfigured,
  parseFormSchema,
} from "@/types/mits";
import { z } from "zod";

/* ──────────────────────────────────────────────────────────────────────────
   Admin server actions.

   Every action re-checks the caller's role. The Next.js docs are explicit that a
   Server Function is reachable as a POST to whatever route it is used from, and
   that proxy coverage can silently disappear — so the check belongs here, not
   only in the route gate.
   ────────────────────────────────────────────────────────────────────────── */

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

// Both actions take the previous state first so they can be driven by
// `useActionState` in the admin forms.

export async function updateAuthSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const registrationEnabled = formData.get("registrationEnabled") === "on";
  const domains = normaliseDomains(
    String(formData.get("allowedEmailDomains") ?? "")
      .split(/[\s,;\n]+/)
      .filter(Boolean),
  );

  const invalid = domains.filter((domain) => !isPlausibleDomain(domain));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Keine gültige Domain: ${invalid.join(", ")}`,
    };
  }

  /*
   * Die Sitzungsdauer kommt durch `toSessionLifetimeDays`, also nie ungeprüft aus
   * dem Formular. Sie wird zur Lebensdauer eines Cookies; ein getippter Wert, den
   * dieser Build nicht kennt, fällt auf den Default und nicht auf „unbegrenzt".
   */
  const sessionLifetimeDays = toSessionLifetimeDays(
    formData.get("sessionLifetimeDays"),
  );

  setAuthSettings({
    registrationEnabled,
    allowedEmailDomains: domains,
    sessionLifetimeDays,
  });
  revalidatePath("/admin");
  revalidatePath("/register");
  // Die Anmeldemaske nennt die Dauer neben dem Haken „Angemeldet bleiben".
  revalidatePath("/login");

  const policy = registrationEnabled
    ? domains.length > 0
      ? `Registrierung offen für ${domains.map((d) => `@${d}`).join(", ")}.`
      : "Registrierung offen für alle Domains."
    : "Selbstregistrierung deaktiviert.";

  /*
   * Die Dauer wird mitgemeldet, weil sie ab dem nächsten Anmelden gilt und nicht
   * für die Sitzung, in der man das gerade eingestellt hat — ohne den Satz sieht
   * es aus, als hätte der Wechsel nichts getan.
   */
  return {
    ok: true,
    message: `${policy} Angemeldet bleiben: ${SESSION_LIFETIME_LABELS[sessionLifetimeDays].toLowerCase()}, ab der nächsten Anmeldung.`,
  };
}

export async function setUserRoleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole("admin");

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId || !isRole(role)) {
    return { ok: false, error: "Ungültige Angaben." };
  }

  // Locking yourself out is a support call, not a feature.
  if (userId === actor.id && role !== "admin") {
    return {
      ok: false,
      error: "Die eigene Administrationsrolle kann nicht entzogen werden.",
    };
  }

  try {
    setUserRole(userId, role);
  } catch (error) {
    if (error instanceof RoleChangeError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/admin");
  return { ok: true, message: "Rolle aktualisiert." };
}

/** Cheap sanity check — a label, a dot, a TLD. Not a full RFC validation. */
function isPlausibleDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
    domain,
  );
}

/* ── Portal content ─────────────────────────────────────────────────────── */

export async function savePortalContentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const raw = String(formData.get("content") ?? "");
  let parsed;
  try {
    parsed = PortalContentSchema.safeParse(JSON.parse(raw));
  } catch {
    return { ok: false, error: "Inhalt konnte nicht gelesen werden." };
  }
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Meldungen oder Kacheln sind unvollständig.",
    };
  }

  // Reject rather than silently drop: an admin who typed a javascript: URL should
  // learn that it was refused.
  const unsafe = parsed.data.resources.filter(
    (resource) => !isSafeResourceHref(resource.href),
  );
  if (unsafe.length > 0) {
    return {
      ok: false,
      error: `Kein erlaubtes Ziel (nur http, https oder /pfad): ${unsafe
        .map((resource) => resource.label)
        .join(", ")}`,
    };
  }

  setPortalContent(parsed.data);
  revalidatePath("/");
  revalidatePath("/customer");
  revalidatePath("/admin/portal");
  revalidatePath("/customer/new");

  return {
    ok: true,
    message: `${parsed.data.announcements.length} Meldung(en) und ${parsed.data.resources.length} Kachel(n) gespeichert.`,
  };
}

/* ── Portal layout, FAQ and operations ──────────────────────────────────── */

/**
 * Read a JSON payload out of a hidden form field.
 *
 * Every portal editor posts its whole list as one JSON string, so the shape of
 * the parse and the shape of the error are identical for all of them.
 */
function parsePayload<T>(
  formData: FormData,
  field: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
): { ok: true; data: T } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get(field) ?? ""));
  } catch {
    return { ok: false, error: "Eingaben konnten nicht gelesen werden." };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Eingaben sind unvollständig.",
    };
  }
  return { ok: true, data: parsed.data };
}

/** Both the portal and the intake page read portal settings. */
function revalidatePortal(): void {
  // The public landing reads the hero texts, /customer renders the widgets.
  revalidatePath("/");
  revalidatePath("/customer");
  revalidatePath("/admin/portal");
  revalidatePath("/admin/faq");
  revalidatePath("/customer/new");
  // Each article has its own page; the layout segment covers every id at once.
  revalidatePath("/customer/faq/[id]", "page");
}

export async function savePortalConfigAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(formData, "config", PortalConfigSchema);
  if (!payload.ok) return { ok: false, error: payload.error };

  const config = setPortalConfig(payload.data);
  revalidatePortal();

  const active = config.widget_order.filter(
    (key) => config.enabled_widgets[key],
  ).length;

  return {
    ok: true,
    message: `Layout gespeichert — ${active} von ${config.widget_order.length} Widgets aktiv.`,
  };
}

export async function savePortalFaqsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(formData, "faqs", z.array(PortalFaqSchema));
  if (!payload.ok) return { ok: false, error: payload.error };

  // Every referenced file has to be one that was uploaded as a FAQ attachment.
  // See `unusableFaqAttachments`: pointing an article at a ticket attachment does
  // not expose it, but it does publish a link that answers 404.
  const unusable = unusableFaqAttachments(
    payload.data.flatMap((entry) =>
      entry.attachments.map((attachment) => attachment.fileId),
    ),
  );
  if (unusable.length > 0) {
    return {
      ok: false,
      error: `${unusable.length} Anhang/Anhänge sind keine FAQ-Dateien und wurden nicht gespeichert. Bitte erneut hochladen.`,
    };
  }

  const faqs = setPortalFaqs(payload.data);
  revalidatePortal();

  return {
    ok: true,
    message:
      faqs.length === 0
        ? "FAQ geleert — der Selbsthilfe-Block wird nicht mehr angezeigt."
        : `${faqs.length} FAQ-Eintrag/-Einträge gespeichert.`,
  };
}

export async function savePortalOperationsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const services = parsePayload(
    formData,
    "services",
    z.array(PortalServiceSchema),
  );
  if (!services.ok) return { ok: false, error: services.error };

  const maintenance = parsePayload(
    formData,
    "maintenance",
    z.array(PortalMaintenanceSchema),
  );
  if (!maintenance.ok) return { ok: false, error: maintenance.error };

  setPortalServices(services.data);
  setMaintenanceNotices(maintenance.data);
  revalidatePortal();

  const shown = maintenance.data.filter((notice) => notice.active).length;
  return {
    ok: true,
    message: `${services.data.length} Dienst(e) und ${shown} sichtbare Wartungsmeldung(en) gespeichert.`,
  };
}

/* ── Feature toggles ────────────────────────────────────────────────────── */

export async function saveFeatureFlagsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(formData, "flags", FeatureFlagsSchema);
  if (!payload.ok) return { ok: false, error: payload.error };

  const flags = setFeatureFlags(payload.data);

  // Every gated surface has to be re-rendered, not just the settings page.
  revalidatePath("/", "layout");

  const off = (Object.keys(FEATURE_FLAG_META) as (keyof typeof flags)[]).filter(
    (key) => !flags[key],
  );

  return {
    ok: true,
    message:
      off.length === 0
        ? "Alle Module aktiv."
        : `Gespeichert. Abgeschaltet: ${off
            .map((key) => FEATURE_FLAG_META[key].label)
            .join(", ")}.`,
  };
}

/* ── Sichtbarkeit je Rolle ──────────────────────────────────────────────── */

/**
 * Was eine Rolle nicht mehr sieht.
 *
 * Ein Blob wie die Module, und aus demselben Grund: die Maske ist eine Liste
 * von Schaltern, die gemeinsam abgeschickt wird — ein Endpunkt pro Schalter
 * wäre eine halb gespeicherte Konfiguration, sobald einer davon scheitert.
 *
 * Revalidiert das Layout und nicht nur diese Seite: die Kopfzeile, das
 * Benutzermenü und die Portalkacheln lesen die Regeln beim Rendern, und die
 * stehen auf jeder Seite.
 */
export async function saveRoleVisibilityAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(formData, "visibility", RoleVisibilitySchema);
  if (!payload.ok) return { ok: false, error: payload.error };

  const visibility = setRoleVisibility(payload.data);

  const taken = RESTRICTABLE_ROLES.reduce(
    (sum, role) =>
      sum +
      visibility[role].hidden_forms.length +
      visibility[role].hidden_areas.length,
    0,
  );

  revalidatePath("/", "layout");

  return {
    ok: true,
    message:
      taken === 0
        ? "Gespeichert. Jede Rolle sieht alles."
        : `Gespeichert. ${taken} Einschränkung${taken === 1 ? "" : "en"} aktiv.`,
  };
}

/**
 * Die Vorlagenliste, ganz ersetzt.
 *
 * Eigene Action und eigener Setting-Key neben der Sichtbarkeit selbst: die
 * beiden werden auf derselben Seite bearbeitet, aber nicht zusammen — eine
 * Vorlage anzulegen darf nicht die Schalter mitschreiben, die daneben gerade
 * halb gesetzt sind.
 *
 * Kein `revalidatePath("/", "layout")`: Vorlagen sind ein Werkzeug dieser Maske
 * und ändern für sich genommen nichts an dem, was irgendjemand sieht.
 */
export async function saveVisibilityPresetsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(
    formData,
    "presets",
    z.array(VisibilityPresetSchema),
  );
  if (!payload.ok) return { ok: false, error: payload.error };

  // Zwei Vorlagen mit einer Id teilen sich beim Anwenden den Eintrag, und
  // „Löschen" träfe dann beide. Der Browser erzeugt eine UUID pro Zeile; ein
  // handgebauter POST tut das nicht.
  const ids = new Set(payload.data.map((preset) => preset.id));
  if (ids.size !== payload.data.length) {
    return { ok: false, error: "Zwei Vorlagen haben dieselbe Kennung." };
  }

  const presets = setVisibilityPresets(payload.data);
  revalidatePath("/admin/settings/roles");

  return {
    ok: true,
    message:
      presets.length === 0
        ? "Gespeichert. Keine Vorlagen mehr hinterlegt."
        : `${presets.length} Vorlage${presets.length === 1 ? "" : "n"} gespeichert.`,
  };
}

/* ── Ticket categories ──────────────────────────────────────────────────── */

/**
 * Replace the whole category tree.
 *
 * Submitted as one list of rows with a parent each, like the locations — the
 * editor is a list and a diff-based API would only move the bookkeeping into the
 * form. `replaceCategories` is where the orphan, self-parent and duplicate-sibling
 * checks live; they are not in the mask, because a hand-built POST reaches this
 * action and not the mask.
 *
 * Revalidates the queue and the intake: the first renders the cascading filter,
 * the second the intent tiles, and both are server-rendered from this table.
 */
export async function saveCategoriesAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(
    formData,
    "categories",
    z.array(MITSTicketCategorySchema),
  );
  if (!payload.ok) return { ok: false, error: payload.error };

  let saved;
  try {
    saved = replaceCategories(payload.data);
  } catch (error) {
    if (error instanceof CategoryError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/customer/new");
  revalidatePath("/mits");

  const roots = saved.filter((entry) => entry.parent_id === CATEGORY_ROOT).length;
  return {
    ok: true,
    message: `${roots} Hauptkategorie(n) und ${saved.length - roots} Unterkategorie(n) gespeichert.`,
  };
}

/* ── Triage rules ───────────────────────────────────────────────────────── */

/**
 * Replace the keyword rules.
 *
 * The mask is a list of rules, so this is the same shape as the categories above.
 * `setTriageRules` lower-cases and de-duplicates the keywords and drops a rule
 * that has none — a row in the list that can never match is worse than an absent
 * one, because somebody will assume it works.
 *
 * `/customer/new` is revalidated as well as the queue: the same rules decide which
 * FAQ entries the intake offers while somebody types, so a new keyword has to
 * reach that page without a rebuild.
 */
export async function saveTriageRulesAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(formData, "rules", z.array(TriageRuleSchema));
  if (!payload.ok) return { ok: false, error: payload.error };

  /*
   * A rule may only point at a category that exists.
   *
   * Checked here rather than in the storage layer, which has no business reading
   * the category table: a rule with a dangling target would file tickets under an
   * id no filter resolves, and the mask would report a successful save.
   */
  for (const rule of payload.data) {
    if (rule.category_id && !isFilableCategory(rule.category_id)) {
      return {
        ok: false,
        error: `Regel „${rule.title}“ zeigt auf eine Kategorie, die es nicht gibt.`,
      };
    }
  }

  let saved;
  try {
    saved = setTriageRules(payload.data);
  } catch (error) {
    if (error instanceof TriageRuleError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/admin/settings/routing");
  revalidatePath("/customer/new");
  revalidatePath("/mits");

  const filing = saved.filter((rule) => rule.category_id !== "").length;
  return {
    ok: true,
    message:
      saved.length === 0
        ? "Keine Regeln — eingehende Tickets bleiben unkategorisiert."
        : `${saved.length} Regel(n) gespeichert, ${filing} davon vergeben eine Kategorie.`,
  };
}

/* ── Locations ──────────────────────────────────────────────────────────── */

export async function saveLocationsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(
    formData,
    "locations",
    z.array(MITSLocationSchema),
  );
  if (!payload.ok) return { ok: false, error: payload.error };

  let saved;
  try {
    saved = replaceLocations(payload.data);
  } catch (error) {
    if (error instanceof LocationError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/admin/locations");
  revalidatePath("/customer/new");
  revalidatePath("/mits");

  const active = saved.filter((location) => location.active).length;
  return {
    ok: true,
    message: `${saved.length} Standort(e) gespeichert, ${active} davon auswählbar.`,
  };
}

/* ── Canned responses ───────────────────────────────────────────────────── */

export async function saveCannedResponsesAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(
    formData,
    "responses",
    z.array(CannedResponseSchema),
  );
  if (!payload.ok) return { ok: false, error: payload.error };

  const clash = duplicateShortcut(
    payload.data,
    listMacros().map((macro) => ({ title: macro.title, shortcut: macro.shortcut })),
  );
  if (clash) return { ok: false, error: clash };

  const saved = setCannedResponses(payload.data);
  revalidatePath("/admin/canned-responses");
  // Every agent ticket page renders the list.
  revalidatePath("/mits", "layout");

  return {
    ok: true,
    message:
      saved.length === 0
        ? "Bausteine geleert — im Ticket erscheinen keine Schaltflächen mehr."
        : `${saved.length} Baustein(e) gespeichert.`,
  };
}

/* ── Macros ─────────────────────────────────────────────────────────────── */

/**
 * The first shortcut that is claimed twice, as a message — or null.
 *
 * Across both lists, because the slash menu is one menu: a canned response and
 * a macro sharing `/reset` is exactly as ambiguous as two canned responses
 * doing it, and "which one runs" would come down to the order the two lists
 * happen to be concatenated in.
 *
 * The empty shortcut is not a claim and never collides — most entries have
 * none, and treating "no shortcut" as a duplicate would make the second one
 * unsaveable.
 */
function duplicateShortcut(
  entries: { title: string; shortcut: string }[],
  others: { title: string; shortcut: string }[] = [],
): string | null {
  const seen = new Map<string, string>();
  for (const entry of others) {
    if (entry.shortcut) seen.set(entry.shortcut, entry.title);
  }

  for (const entry of entries) {
    if (!entry.shortcut) continue;
    const owner = seen.get(entry.shortcut);
    if (owner !== undefined) {
      return `Das Kürzel „/${entry.shortcut}“ ist schon an „${owner}“ vergeben.`;
    }
    seen.set(entry.shortcut, entry.title || "Ohne Titel");
  }

  return null;
}

export async function saveMacrosAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(formData, "macros", z.array(MacroSchema));
  if (!payload.ok) return { ok: false, error: payload.error };

  /*
   * Refused rather than saved.
   *
   * A macro that changes nothing reports "ausgeführt" and moves no ticket — the
   * agent believes the customer is now waiting on them. The form disables the
   * save button for this too, but a disabled button is not a check.
   */
  const inert = payload.data.filter(macroIsEmpty);
  if (inert.length > 0) {
    return {
      ok: false,
      error: `„${inert[0].title || "Ohne Titel"}“ ändert nichts. Bitte ein Feld setzen oder einen Textbaustein wählen.`,
    };
  }

  /*
   * A macro may only point at a canned response that exists.
   *
   * Checked at save time because the alternative surfaces at run time, on a real
   * ticket, after the field changes have already been applied — the agent is then
   * looking at a half-executed macro and an error about a template.
   */
  const known = new Set(listCannedResponses().map((entry) => entry.id));
  const dangling = payload.data.find(
    (macro) =>
      macro.canned_response_id !== "" && !known.has(macro.canned_response_id),
  );
  if (dangling) {
    return {
      ok: false,
      error: `„${dangling.title}“ verweist auf einen Textbaustein, den es nicht gibt.`,
    };
  }

  const clash = duplicateShortcut(
    payload.data,
    listCannedResponses().map((entry) => ({
      title: entry.title,
      shortcut: entry.shortcut,
    })),
  );
  if (clash) return { ok: false, error: clash };

  const saved = setMacros(payload.data);
  revalidatePath("/admin/macros");
  // Every agent ticket page renders the list.
  revalidatePath("/mits", "layout");

  return {
    ok: true,
    message:
      saved.length === 0
        ? "Makros geleert — im Ticket erscheinen keine Schaltflächen mehr."
        : `${saved.length} Makro(s) gespeichert.`,
  };
}

/* ── Object storage ─────────────────────────────────────────────────────── */

/**
 * Save the S3 configuration.
 *
 * The secret follows the same rule as the SMTP password and for the same reason: a
 * password input is never populated on render, so a blank field means "I did not
 * touch this". Treating it as "clear it" would wipe the credentials on every
 * unrelated save of this mask, and the failure would surface as the next upload.
 */
export async function saveS3SettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const endpoint = String(formData.get("endpoint") ?? "").trim();
  // Refused here rather than at signing time: a pasted `https://s3.example.com/`
  // would land in the canonical URI and come back as `SignatureDoesNotMatch`,
  // which says nothing about the real mistake.
  if (endpoint !== "" && !isS3Endpoint(endpoint)) {
    return {
      ok: false,
      error:
        "Der Endpunkt ist nur der Host, optional mit Port — ohne https:// und ohne Pfad.",
    };
  }

  const stored = getS3Settings();
  const saved = setS3Settings(
    S3SettingsSchema.parse({
      endpoint,
      region: String(formData.get("region") ?? ""),
      bucket: String(formData.get("bucket") ?? "").trim(),
      accessKeyId: String(formData.get("accessKeyId") ?? "").trim(),
      secretAccessKey: resolveSmtpPassword(
        String(formData.get("secretAccessKey") ?? ""),
        stored.secretAccessKey,
      ),
      secure: formData.get("secure") === "on",
      forcePathStyle: formData.get("forcePathStyle") === "on",
      prefix: String(formData.get("prefix") ?? ""),
    }),
  );

  revalidatePath("/admin/settings/storage");

  return {
    ok: true,
    message: isS3Configured(saved)
      ? "Gespeichert. Neue Anhänge gehen in den Bucket, sobald das Modul eingeschaltet ist."
      : "Gespeichert, aber noch unvollständig — bis dahin bleibt die Ablage auf der Platte.",
  };
}

/**
 * Round-trip test against the *stored* settings.
 *
 * Deliberately not against the values in the form: what matters is whether the
 * configuration this instance will actually use works. Testing unsaved input would
 * let somebody get a green result for a configuration that is not in effect.
 */
export async function testS3Action(
  _previous: ActionResult | null,
): Promise<ActionResult> {
  await requireRole("admin");

  const settings = getS3Settings();
  if (!isS3Configured(settings)) {
    return {
      ok: false,
      error: "Bitte zuerst Endpunkt, Bucket, Access Key und Secret speichern.",
    };
  }

  try {
    return { ok: true, message: await verifyS3(settings) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Verbindung fehlgeschlagen.",
    };
  }
}

/* ── SMTP ───────────────────────────────────────────────────────────────── */

export async function saveSmtpSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  let saved;
  try {
    saved = setSmtpSettings(
      SmtpSettingsSchema.parse({
        host: String(formData.get("host") ?? ""),
        port: String(formData.get("port") ?? "587"),
        user: String(formData.get("user") ?? ""),
        // Blank means keep — a password field is never populated on render, so
        // treating blank as "clear" would wipe credentials on every save.
        password: String(formData.get("password") ?? ""),
        from: String(formData.get("from") ?? ""),
        secure: formData.get("secure") === "on",
        public_url: String(formData.get("public_url") ?? ""),
      }),
    );
  } catch (error) {
    if (error instanceof SmtpError) return { ok: false, error: error.message };
    if (error instanceof Error) {
      return { ok: false, error: `Eingaben ungültig: ${error.message.slice(0, 200)}` };
    }
    throw error;
  }

  revalidatePath("/admin/settings/email");

  if (!isSmtpConfigured(saved)) {
    return {
      ok: true,
      message:
        "Gespeichert. Host oder Absenderadresse fehlen noch — es wird nichts versendet.",
    };
  }

  return {
    ok: true,
    message: saved.public_url
      ? "Gespeichert. Benachrichtigungen enthalten einen Link auf das Ticket."
      : "Gespeichert. Ohne öffentliche Adresse gehen Mails ohne Ticket-Link hinaus.",
  };
}

/**
 * Verify the connection and send one mail to the acting admin.
 *
 * Deliberately to the admin's own address rather than a free-text field: a form
 * that mails anywhere is an open relay for whoever reaches it.
 */
export async function sendTestMailAction(
  _previous: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole("admin");

  const verified = await verifySmtp();
  if (!verified.ok) {
    return { ok: false, error: `Verbindung fehlgeschlagen: ${verified.reason}` };
  }

  const url = getEffectiveSmtpSettings().public_url
    ? `${getEffectiveSmtpSettings().public_url}/customer/tickets`
    : null;

  const mail = testMail(actor.email, url);
  const sent = await sendMail({ to: actor.email, ...mail });

  if (!sent.ok) {
    return { ok: false, error: `Verbindung stand, Versand fehlgeschlagen: ${sent.reason}` };
  }

  return { ok: true, message: `Test-Mail an ${actor.email} versendet.` };
}

/* ── Analytics ──────────────────────────────────────────────────────────── */

export async function saveAnalyticsSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  /*
   * Built from the widget list rather than field by field. A widget added later
   * is then one entry in `ANALYTICS_WIDGETS` instead of a line here that somebody
   * forgets — and a forgotten line reads as `false`, which silently hides the new
   * widget on every instance.
   */
  const widgets = Object.fromEntries(
    ANALYTICS_WIDGETS.map((widget) => [widget, formData.get(widget) === "on"]),
  );

  const saved = setAnalyticsSettings(
    AnalyticsSettingsSchema.parse({
      ...widgets,
      defaultRefreshSeconds: formData.get("defaultRefreshSeconds"),
    }),
  );

  /*
   * The switches are part of the analytics cache key, so a stale entry cannot be
   * served for the new setting — but the old entries stay in the map until they
   * expire, and there is no reason to keep results for a configuration nobody
   * will ask for again.
   */
  invalidateAnalytics();

  revalidatePath("/admin/settings/analytics");
  revalidatePath("/mits/analytics");

  const on = ANALYTICS_WIDGETS.filter((widget) => saved[widget]).length;

  return {
    ok: true,
    message:
      on === 0
        ? "Gespeichert. Es ist keine Kachel eingeschaltet — das Panel zeigt nur die Kennzahlen."
        : `Gespeichert. ${on} von ${ANALYTICS_WIDGETS.length} Kacheln aktiv.`,
  };
}

/* ── Bestand löschen ────────────────────────────────────────────────────── */

/**
 * Delete tickets and CMDB data for good.
 *
 * The only action in MITS that issues real DELETEs, so it is also the only one
 * that asks for more than a session:
 *
 * 1. admin role, re-checked here rather than trusted from the page,
 * 2. the word `löschen`, typed rather than clicked,
 * 3. the account password, verified against the stored hash.
 *
 * The three confirmations before that are in the dialog. They are not security —
 * anybody who can call this action can skip them — which is exactly why the two
 * checks that *are* security live on this side of the wire.
 *
 * The password is what a stolen session does not have. A forgotten laptop in a
 * meeting room is the realistic threat for a helpdesk admin account, and it carries
 * a valid cookie.
 *
 * Recorded to the server log rather than to `mits_audit_log`: that table is one of
 * the things being emptied, so an entry in it would be deleted by the operation it
 * documents. The container log is the copy that survives.
 */
export async function purgeDataAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole("admin");

  const confirmWord = String(formData.get("confirm") ?? "").trim();
  if (confirmWord.toLowerCase() !== PURGE_CONFIRM_WORD) {
    return {
      ok: false,
      error: `Bitte „${PURGE_CONFIRM_WORD}“ eintippen, um fortzufahren.`,
    };
  }

  const scopes: PurgeScopes = {
    tickets: formData.get("scope_tickets") === "on",
    cmdb: formData.get("scope_cmdb") === "on",
    organizations: formData.get("scope_organizations") === "on",
    locations: formData.get("scope_locations") === "on",
  };
  if (nothingSelected(scopes)) {
    return { ok: false, error: "Es ist kein Bereich ausgewählt." };
  }

  const password = String(formData.get("password") ?? "");
  if (!(await verifyUserPassword(actor.id, password))) {
    // Deliberately one message for a wrong password and a missing credential row:
    // this endpoint is reachable with a stolen cookie, and the difference is
    // information about the account rather than about the request.
    return { ok: false, error: "Das Passwort stimmt nicht." };
  }

  const report = await purgeData(scopes);

  console.warn(
    `[MITS] Bestand gelöscht von ${actor.email}: ` +
      `${report.tickets} Ticket(s), ${report.comments} Beitrag/Beiträge, ` +
      `${report.attachments} Anhang/Anhänge (${report.blobsSwept} Blob(s)), ` +
      `${report.items} Objekt(e), ${report.relations} Beziehung(en), ` +
      `${report.organizations} Firma/Firmen, ${report.locations} Standort(e).`,
  );

  /*
   * Everything that counts, lists or links tickets and objects. The layout reads
   * none of this, but every one of these pages would otherwise serve a cached
   * render of rows that no longer exist.
   */
  for (const path of [
    "/admin/settings/data",
    "/admin",
    "/customer",
    "/customer/tickets",
    "/mits",
    "/mits/analytics",
    "/mits/cmdb",
    "/mits/cmdb/licenses",
  ]) {
    revalidatePath(path);
  }

  const parts = [
    scopes.tickets ? `${report.tickets} Ticket(s)` : null,
    scopes.cmdb ? `${report.items} Objekt(e)` : null,
    scopes.organizations ? `${report.organizations} Firma/Firmen` : null,
    scopes.locations ? `${report.locations} Standort(e)` : null,
  ].filter(Boolean);

  return {
    ok: true,
    message: `Gelöscht: ${parts.join(", ")}. Das ist nicht rückholbar.`,
  };
}

/* ── Ticket display ─────────────────────────────────────────────────────── */

/**
 * Where a filled-in form appears on a ticket.
 *
 * One value, and it still goes through `TicketDisplaySettingsSchema` rather than
 * being written straight from the request: the setting decides a layout on two
 * pages, and an unrecognised mode would leave both of them with answers in
 * neither place.
 */
export async function saveTicketDisplaySettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const saved = setTicketDisplaySettings(
    TicketDisplaySettingsSchema.parse({
      formDisplay: formData.get("formDisplay"),
    }),
  );

  // Both detail views and the pop-out read this on the server, so all three have
  // to be re-rendered. The queue does not show payloads and stays out of it.
  revalidatePath("/admin/settings/tickets");
  revalidatePath("/mits/tickets/[id]", "page");
  revalidatePath("/mits/tickets/[id]/popout", "page");
  revalidatePath("/customer/tickets/[id]", "page");

  return {
    ok: true,
    message: `Gespeichert. Angaben erscheinen: ${
      TICKET_FORM_DISPLAY_META[saved.formDisplay].label
    }.`,
  };
}

/* ── Notifications ──────────────────────────────────────────────────────── */

export async function saveNotificationSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  /*
   * One form, submitted whole — the same rule the mail and analytics masks
   * document. An unchecked switch is not posted at all, so a mask split across
   * two forms would have each save read the other section's switches as off.
   */
  const channels = Object.fromEntries(
    NOTIFICATION_CHANNELS.flatMap((channel) => [
      [`${channel}_enabled`, formData.get(`${channel}_enabled`) === "on"],
      [`${channel}_tone`, formData.get(`${channel}_tone`)],
      [`${channel}_sticky`, formData.get(`${channel}_sticky`) === "on"],
    ]),
  );

  const saved = setNotificationSettings(
    NotificationSettingsSchema.parse({
      ...channels,
      position: formData.get("position"),
      seconds: formData.get("seconds"),
      maxVisible: formData.get("maxVisible"),
      pollSeconds: formData.get("pollSeconds"),
      digestThreshold: formData.get("digestThreshold"),
    }),
  );

  /*
   * Every page, because the header renders the watcher and the root layout the
   * stack. A narrower revalidation would leave whichever page the admin was on
   * with the old poll interval until the next full navigation — and "I saved it
   * and nothing changed" is the report that follows.
   */
  revalidatePath("/", "layout");

  const muted = NOTIFICATION_CHANNELS.filter(
    (channel) => !saved[`${channel}_enabled`],
  ).length;

  return {
    ok: true,
    message:
      muted === 0
        ? "Gespeichert. Alle Kanäle sind aktiv."
        : `Gespeichert. ${muted} von ${NOTIFICATION_CHANNELS.length} Kanälen stumm.`,
  };
}

/* ── AI settings ────────────────────────────────────────────────────────── */

/**
 * Round-trip test against the *stored* configuration.
 *
 * Deliberately not the values in the form: what matters is whether the setup this
 * instance will actually use works. Testing unsaved input would hand an admin a
 * green result for a configuration that is not in effect.
 *
 * It asks for a structured answer rather than listing models, because a reachable
 * endpoint whose configured model does not exist passes a list call and fails
 * every real request.
 */
export async function testAIProviderAction(
  _previous: ActionResult | null,
): Promise<ActionResult> {
  await requireRole("admin");

  const settings = getAISettings();
  if (!settings.enabled) {
    return { ok: false, error: "Der Hauptschalter ist aus." };
  }

  try {
    return { ok: true, message: await verifyAIProvider(settings) };
  } catch (error) {
    if (error instanceof AIProviderError) return { ok: false, error: error.message };
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Test fehlgeschlagen.",
    };
  }
}

export async function saveAISettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const stored = getStoredAISettings();
  const provider = AIProvider.safeParse(formData.get("provider"));

  try {
    const saved = setAISettings({
      enabled: formData.get("enabled") === "on",
      provider: provider.success ? provider.data : stored.provider,
      ollamaBaseUrl: String(formData.get("ollamaBaseUrl") ?? ""),
      baseUrl: String(formData.get("baseUrl") ?? ""),
      // Same rule as the SMTP password and the S3 secret: a password input is
      // never populated on render, so a blank field means "not touched".
      apiKey: resolveSmtpPassword(
        String(formData.get("apiKey") ?? ""),
        stored.apiKey,
      ),
      textModel: String(formData.get("textModel") ?? ""),
      visionModel: String(formData.get("visionModel") ?? ""),
      /*
       * Built from the feature list rather than one line per switch, which is
       * what the analytics action already does and for the reason that just
       * proved itself: adding a fifth feature broke this call, and the version
       * that compiles is the one where a forgotten line silently reads as `false`
       * — a new assistance feature that can never be switched on, on every
       * instance, with nothing on screen to explain it.
       */
      ...(Object.fromEntries(
        AI_FEATURES.map((feature) => [feature, formData.get(feature) === "on"]),
      ) as Record<(typeof AI_FEATURES)[number], boolean>),
      clusterWindowMinutes: Number(formData.get("clusterWindowMinutes") ?? 60),
      clusterMinTickets: Number(formData.get("clusterMinTickets") ?? 3),
    });

    revalidatePath("/admin/settings/ai");
    // The notification mask states which of the two digest texts a reader gets,
    // and that answer is one of these toggles.
    revalidatePath("/admin/settings/notifications");
    // Every agent page reads the toggles: the queue for the banner, the ticket
    // page for the summary button.
    revalidatePath("/mits", "layout");
    revalidatePath("/customer/new");

    if (!saved.enabled) {
      return {
        ok: true,
        message:
          "Gespeichert. Der Hauptschalter ist aus — MITS stellt keine Anfragen an ein Modell.",
      };
    }

    const on = AI_FEATURES.filter((feature) => saved[feature]);
    if (on.length === 0) {
      return {
        ok: true,
        message:
          "Gespeichert. Es ist noch keine Assistenzfunktion eingeschaltet — unten auswählen.",
      };
    }

    return {
      ok: true,
      message: `Gespeichert. Aktiv: ${on
        .map((feature) => AI_FEATURE_META[feature].label)
        .join(", ")}.`,
    };
  } catch (error) {
    if (error instanceof AISettingsError) return { ok: false, error: error.message };
    throw error;
  }
}

/* ── User records, on behalf of someone else ─────────────────────────────── */

/**
 * Edit another account's name and contact details.
 *
 * `userId` comes from the form here, and that is the difference from
 * `changeOwnProfile`: this action exists precisely to act on somebody else. What
 * makes it safe is `requireRole("admin")` — the id is only as trustworthy as the role
 * that submitted it, and an admin may already read and change every account.
 *
 * The same `setUserProfile`/`setUserName` the self-service path uses, so the website
 * check, the length limits and the stale-location refusal apply identically. An admin
 * typing `javascript:` into a website field is refused for the same reason a reporter
 * is.
 */
export async function saveUserRecordAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false, error: "Kein Konto angegeben." };

  const target = findUser(userId);
  if (!target) return { ok: false, error: "Unbekanntes Konto." };

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  // Optional: the mask may be used to fix an address without touching the name.
  const name = text("name");
  if (name && name !== target.name) {
    try {
      setUserName(userId, name);
    } catch (error) {
      if (error instanceof ProfileError) return { ok: false, error: error.message };
      throw error;
    }
  }

  const locationId = text("location_id");
  try {
    setUserProfile(
      userId,
      {
        location_id:
          locationId === "" || locationId === NO_LOCATION ? null : locationId,
        phone: text("phone"),
        street: text("street"),
        postal_code: text("postal_code"),
        city: text("city"),
        country: text("country"),
        website: text("website"),
        note: text("note"),
      },
      (id) => getLocation(id) !== null,
    );
  } catch (error) {
    if (error instanceof UserProfileError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  /*
   * The company is written through its own setter, which is why this mask can offer it
   * and the reporter's own settings cannot: `setUserProfile` does not accept the field
   * at all. Absent from the form means "leave as is" rather than "clear" — the picker
   * always posts a value, so an empty key here is a caller that is not this mask.
   */
  if (formData.has("organization_id")) {
    const organizationId = text("organization_id");
    try {
      setUserOrganization(
        userId,
        organizationId === "" || organizationId === NO_ORGANIZATION
          ? null
          : organizationId,
        organizationExists,
      );
    } catch (error) {
      if (error instanceof UserProfileError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  }

  /*
   * The department view, through its own setter for the same reason as the
   * company: `setUserProfile` does not accept the field, so the only way to
   * grant it is this line, behind this admin check. Same absent-means-unchanged
   * rule — a checkbox posts nothing when it is off, so the mask sends a hidden
   * marker beside it and this reads the marker, not the box.
   */
  if (formData.has("is_org_admin_present")) {
    setOrgAdmin(userId, formData.get("is_org_admin") === "on");
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin/staff");
  // The agent sidebar renders these, and the header prints the name.
  revalidatePath("/mits/tickets/[id]", "page");
  revalidatePath("/customer/tickets");
  revalidatePath("/", "layout");

  return { ok: true, message: `Angaben zu ${name || target.name} gespeichert.` };
}

/* ── Organizations ──────────────────────────────────────────────────────── */

/**
 * Create or update one company.
 *
 * One row per submission, not the whole list: a form that omits a row would delete it,
 * and a customer record has assets and people hanging off it. See `lib/organizations.ts`.
 */
export async function saveOrganizationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const payload = parsePayload(formData, "organization", MITSOrganizationSchema);
  if (!payload.ok) return { ok: false, error: payload.error };

  let saved;
  try {
    saved = saveOrganization(payload.data);
  } catch (error) {
    if (error instanceof OrganizationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidateOrganizations();
  return { ok: true, message: `${saved.name} gespeichert.` };
}

/**
 * Delete a company. Refused while assets or people still point at it — the store
 * decides that and says what is in the way.
 */
export async function deleteOrganizationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const id = String(formData.get("organizationId") ?? "");
  if (!id) return { ok: false, error: "Keine Firma angegeben." };

  const organization = getOrganization(id);
  if (!organization) return { ok: false, error: "Unbekannte Firma." };

  try {
    deleteOrganization(id);
  } catch (error) {
    if (error instanceof OrganizationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidateOrganizations();
  return { ok: true, message: `${organization.name} gelöscht.` };
}

/** Everything that resolves a company name or filters by one. */
function revalidateOrganizations(): void {
  revalidatePath("/admin/organizations");
  revalidatePath("/admin/customers");
  revalidatePath("/mits/cmdb");
  revalidatePath("/mits/cmdb/licenses");
}

/* ── Data: upload limit and retention ───────────────────────────────────── */

export async function saveDataSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const saved = setDataSettings({
    maxUploadMb: formData.get("maxUploadMb"),
    retentionYears: formData.get("retentionYears"),
  } as never);

  revalidatePath("/admin/settings/data");

  return {
    ok: true,
    message: `Anhänge bis ${saved.maxUploadMb} MB, Aufbewahrung ${saved.retentionYears} Jahre.`,
  };
}

/**
 * Run the retention policy now.
 *
 * Explicitly triggered, never scheduled: MITS has no job runner, and a settings page
 * that implied a nightly run would be claiming something untrue. It is also the only
 * operation in the application that destroys data, so it happens when somebody presses
 * a button and sees the count first.
 */
export async function applyRetentionAction(
  _previous: ActionResult | null,
): Promise<ActionResult> {
  await requireRole("admin");

  const { tickets, comments } = applyRetention();

  if (tickets === 0) {
    return {
      ok: true,
      message: "Nichts zu anonymisieren — kein Ticket ist älter als die Aufbewahrung.",
    };
  }

  revalidatePath("/admin/settings/data");
  revalidatePath("/mits");

  return {
    ok: true,
    message: `${tickets} Ticket(s) anonymisiert, davon ${comments} Melder-Beitrag/Beiträge. Nicht umkehrbar.`,
  };
}

/* ── Mail ingest and the Defender rule ──────────────────────────────────── */

export async function saveMailSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const onCallUserId = String(formData.get("onCallUserId") ?? "").trim();

  // An id that no longer exists would leave every incident assigned to nobody while
  // the mask claimed otherwise.
  if (onCallUserId && onCallUserId !== NO_ON_CALL && !findUser(onCallUserId)) {
    return { ok: false, error: "Das gewählte Konto gibt es nicht." };
  }

  const stored = getMailSettings();

  const fallbackUserId = String(formData.get("fallbackUserId") ?? "").trim();
  const cleanFallback =
    fallbackUserId === NO_ON_CALL ? "" : fallbackUserId;
  if (cleanFallback && !findUser(cleanFallback)) {
    return { ok: false, error: "Das gewählte Auffang-Konto gibt es nicht." };
  }

  const transport = MailTransport.safeParse(formData.get("transport"));

  /*
   * The whole mask is saved as one object, including the transport half.
   *
   * Spread over the stored settings rather than rebuilt from scratch: the two
   * secrets are not sent back to the browser, so a field the form did not post
   * has to keep its stored value. Building a fresh object would clear the IMAP
   * password every time somebody toggled the Defender rule.
   */
  const saved = setMailSettings({
    ...stored,
    supportAddress: String(formData.get("supportAddress") ?? "").trim(),
    defenderRuleEnabled: formData.get("defenderRuleEnabled") === "on",
    onCallUserId: onCallUserId === NO_ON_CALL ? "" : onCallUserId,
    onCallEmail: String(formData.get("onCallEmail") ?? "").trim(),

    transport: transport.success ? transport.data : stored.transport,
    fallbackUserId: cleanFallback,

    imapHost: String(formData.get("imapHost") ?? stored.imapHost).trim(),
    imapPort: Number(formData.get("imapPort") ?? stored.imapPort) || 993,
    imapSecure: formData.get("imapSecure") === "on",
    imapUser: String(formData.get("imapUser") ?? stored.imapUser).trim(),
    // Same rule as the SMTP password: a blank field means "not touched", because
    // a password input is never populated on render.
    imapPassword: resolveSmtpPassword(
      String(formData.get("imapPassword") ?? ""),
      stored.imapPassword,
    ),
    imapMailbox:
      String(formData.get("imapMailbox") ?? stored.imapMailbox).trim() || "INBOX",

    graphTenantId: String(formData.get("graphTenantId") ?? stored.graphTenantId).trim(),
    graphClientId: String(formData.get("graphClientId") ?? stored.graphClientId).trim(),
    graphClientSecret: resolveSmtpPassword(
      String(formData.get("graphClientSecret") ?? ""),
      stored.graphClientSecret,
    ),
    graphMailbox: String(formData.get("graphMailbox") ?? stored.graphMailbox).trim(),
  });

  revalidatePath("/admin/mail");

  if (saved.transport !== "none" && !isMailInboundConfigured(saved)) {
    return {
      ok: true,
      message:
        "Gespeichert, aber der Abruf ist noch unvollständig — es fehlen Zugangsdaten oder das Auffang-Konto.",
    };
  }

  return {
    ok: true,
    message: saved.defenderRuleEnabled
      ? saved.onCallUserId
        ? "Gespeichert. Defender-Alerts werden erkannt und der Bereitschaft zugewiesen."
        : "Gespeichert. Defender-Alerts werden erkannt, bleiben aber unzugewiesen im Eingang."
      : "Gespeichert. Die Defender-Regel ist aus — Alerts werden zu gewöhnlichen Tickets.",
  };
}

/**
 * Fetch the mailbox now.
 *
 * The only trigger MITS ships with, on purpose. An in-process timer would run once
 * per Node worker — two workers means every mail becomes two tickets — and it
 * would keep polling a mailbox on an instance nobody is using. A button plus the
 * token-protected `POST /api/mail/poll` lets an operator drive it from whatever
 * scheduler they already run, which is where a recurring job belongs.
 */
export async function fetchMailboxAction(
  _previous: ActionResult | null,
): Promise<ActionResult> {
  await requireRole("admin");

  if (!isFeatureEnabled("feature_mail_inbound")) {
    return { ok: false, error: "Der E-Mail-Abruf ist abgeschaltet." };
  }

  try {
    const report = await ingestMailbox();
    revalidatePath("/mits");
    revalidatePath("/admin/mail");

    const summary =
      `${report.fetched} Nachricht(en) geholt: ${report.created} neue Ticket(s), ` +
      `${report.replied} Antwort(en), ${report.skipped} übersprungen.`;

    // The notes carry the per-message reasons. Truncated, because a mailbox with
    // twenty-five newsletters would otherwise produce an unreadable wall.
    const detail = report.notes.slice(0, 5).join(" · ");
    return { ok: true, message: detail ? `${summary} ${detail}` : summary };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Abruf fehlgeschlagen.",
    };
  }
}

/**
 * Run the classifier over a pasted message and report what it would do.
 *
 * The reason this exists: the rule's mistakes are expensive in both directions, and
 * without a transport there is otherwise no way to try it at all. An admin pastes a real
 * alert from their tenant and sees the verdict, the extracted fields and the reasoning
 * before a single ticket is created. Nothing is written.
 */
export async function testDefenderRuleAction(
  _previous: DefenderTestResult | null,
  formData: FormData,
): Promise<DefenderTestResult> {
  await requireRole("admin");

  const message = {
    from: String(formData.get("from") ?? "").trim(),
    subject: String(formData.get("subject") ?? "").trim(),
    text: String(formData.get("text") ?? ""),
  };

  if (!message.from && !message.subject && !message.text.trim()) {
    return { ok: false, error: "Bitte mindestens Absender, Betreff oder Text angeben." };
  }

  const plan = planSecurityIncident(message, incidentRuleConfig());
  if (!plan) {
    // Distinguished for the admin: "not recognised" and "rule is off" look identical in
    // the queue but mean very different things here.
    const recognised = classifyDefenderAlert(message) !== null;
    return {
      ok: true,
      matched: false,
      note: recognised
        ? "Als Defender-Alert erkannt, aber die Regel ist ausgeschaltet."
        : "Kein Defender-Alert. Die Mail würde ein gewöhnliches Ticket.",
    };
  }

  return {
    ok: true,
    matched: true,
    note: plan.reasons.join(" "),
    severity: plan.alert.severity,
    priority: plan.priority,
    priorityAssumed: plan.priorityAssumed,
    host: plan.alert.host,
    alertTitle: plan.alert.alertTitle,
    incidentId: plan.alert.incidentId,
    assigned: plan.assignTo !== null,
  };
}

export type DefenderTestResult =
  | { ok: false; error: string }
  | {
      ok: true;
      matched: false;
      note: string;
    }
  | {
      ok: true;
      matched: true;
      note: string;
      severity: string | null;
      priority: string;
      priorityAssumed: boolean;
      host: string;
      alertTitle: string;
      incidentId: string;
      assigned: boolean;
    };

/* ── System: timezone and time server ───────────────────────────────────── */

export async function saveSystemSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const parsed = SystemSettingsSchema.safeParse({
    timezone: String(formData.get("timezone") ?? ""),
    ntpHost: String(formData.get("ntpHost") ?? ""),
    refreshMinutes: formData.get("refreshMinutes"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Zeitzone oder Zeitserver fehlen." };
  }

  let saved;
  try {
    saved = setSystemSettings(parsed.data);
  } catch (error) {
    if (error instanceof SystemSettingsError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  /*
   * The timezone is read in the root layout, so every rendered page carries it.
   * Revalidating the layout is what makes a change visible without a restart —
   * without it a cached page would keep formatting in the previous zone, and the
   * setting would look like it had not been saved.
   */
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: `Zeitzone ${saved.timezone}, Zeitserver ${saved.ntpHost}, Aktualisierung: ${REFRESH_LABELS[saved.refreshMinutes].toLowerCase()}.`,
  };
}

/**
 * Measure the system clock against the configured time server.
 *
 * Read-only by design — see `lib/ntp.ts`. The host owns the clock, so this reports
 * a number and names who has to act on it.
 */
export async function checkTimeSyncAction(
  _previous: TimeSyncResult | null,
  formData: FormData,
): Promise<TimeSyncResult> {
  await requireRole("admin");

  const host = String(formData.get("ntpHost") ?? "").trim();
  const result = await queryNtp(host);

  if (!result.ok) return { ok: false, error: result.error };

  const health = clockHealth(result.offsetMs);
  return {
    ok: true,
    offsetMs: result.offsetMs,
    roundTripMs: result.roundTripMs,
    stratum: result.stratum,
    health,
    message:
      health === "ok"
        ? `${host} bestätigt die Systemzeit.`
        : `${host} meldet eine Abweichung. Die Korrektur erfolgt auf dem Host, nicht in MITS.`,
  };
}

export type TimeSyncResult =
  | {
      ok: true;
      message: string;
      offsetMs: number;
      roundTripMs: number;
      stratum: number;
      health: "ok" | "warn" | "critical";
    }
  | { ok: false; error: string };

/* ── Form schemas ───────────────────────────────────────────────────────── */

export async function saveFormSchemaAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole("admin");

  let schema;
  try {
    schema = parseFormSchema(JSON.parse(String(formData.get("definition") ?? "")));
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Schema ungültig: ${error.message.slice(0, 300)}`
          : "Schema ungültig.",
    };
  }

  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(schema.id)) {
    return {
      ok: false,
      error: "Die ID darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.",
    };
  }
  if (schema.schema.type !== "object" || !schema.schema.properties) {
    return { ok: false, error: "Das Schema muss ein Objekt mit properties sein." };
  }

  // Compile it the way the renderer will: a schema that cannot be resolved into
  // fields would render as an empty form for every user.
  let fieldCount = 0;
  try {
    fieldCount = resolveFields(schema).length;
  } catch (error) {
    return {
      ok: false,
      error: `Schema lässt sich nicht rendern: ${
        error instanceof Error ? error.message.slice(0, 200) : "unbekannter Fehler"
      }`,
    };
  }
  if (fieldCount === 0) {
    return { ok: false, error: "Das Formular hat kein renderbares Feld." };
  }

  /*
   * Conditions have to point at fields that exist.
   *
   * The builder rewrites references when a field is renamed and clears them when
   * one is deleted, but the JSON pane accepts anything. A condition naming a
   * property that is gone hides its field permanently — and if that field is
   * required, the form can never be submitted by anyone, with nothing on screen to
   * explain why. Cheaper to refuse the save than to debug it later.
   */
  const dangling = danglingConditions(schema);
  if (dangling.length > 0) {
    return {
      ok: false,
      error: `Bedingung verweist auf ein Feld, das es nicht gibt: ${dangling
        .slice(0, 5)
        .join(", ")}.`,
    };
  }

  // A ring of conditions has no sensible runtime answer — see `conditionCycles`.
  const cycles = conditionCycles(schema);
  if (cycles.length > 0) {
    return {
      ok: false,
      error: `Bedingungen bilden einen Kreis: ${cycles.slice(0, 3).join("; ")}.`,
    };
  }

  /*
   * Checklist step ids have to be unique.
   *
   * The builder generates them and cannot collide; the JSON pane accepts anything.
   * Two steps sharing an id would share a row in `mits_ticket_checklist`, so
   * answering one would answer the other — a documentation feature quietly
   * recording something that did not happen. `parseFormSchema` checks the shape of
   * each item, not the set.
   */
  const stepIds = (schema.checklist ?? []).map((item) => item.id);
  const duplicate = stepIds.find((id, index) => stepIds.indexOf(id) !== index);
  if (duplicate) {
    return {
      ok: false,
      error: `Zwei Checklisten-Schritte haben dieselbe ID: ${duplicate}.`,
    };
  }

  saveFormSchema(schema, actor.id);
  revalidatePath("/admin/forms/builder");
  revalidatePath("/customer/new");

  const steps = stepIds.length;

  return {
    ok: true,
    message: `„${schema.title}“ gespeichert — ${fieldCount} Feld(er)${
      steps > 0 ? `, ${steps} Checklisten-Schritt(e)` : ""
    }, ab sofort im Service-Katalog.`,
  };
}
