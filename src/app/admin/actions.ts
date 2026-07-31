"use server";

import { revalidatePath } from "next/cache";

import { AISettingsError, setAISettings } from "@/lib/ai-settings";
import { isRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { setFeatureFlags } from "@/lib/features";
import { saveFormSchema } from "@/lib/form-schemas";
import {
  conditionCycles,
  danglingConditions,
  resolveFields,
} from "@/lib/forms/schema-to-zod";
import { setCannedResponses } from "@/lib/canned-responses";
import { LocationError, replaceLocations } from "@/lib/locations";
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
import { queryNtp } from "@/lib/ntp";
import { normaliseDomains, setAuthSettings } from "@/lib/settings";
import {
  SystemSettingsError,
  setSystemSettings,
} from "@/lib/system-settings";
import { unusableFaqAttachments } from "@/lib/storage";
import { RoleChangeError, setUserRole } from "@/lib/users";
import {
  CannedResponseSchema,
  FEATURE_FLAG_META,
  FeatureFlagsSchema,
  MITSLocationSchema,
  PortalConfigSchema,
  PortalContentSchema,
  PortalFaqSchema,
  PortalMaintenanceSchema,
  PortalServiceSchema,
  REFRESH_LABELS,
  SmtpSettingsSchema,
  SystemSettingsSchema,
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

  setAuthSettings({ registrationEnabled, allowedEmailDomains: domains });
  revalidatePath("/admin");
  revalidatePath("/register");

  return {
    ok: true,
    message: registrationEnabled
      ? domains.length > 0
        ? `Registrierung offen für ${domains.map((d) => `@${d}`).join(", ")}.`
        : "Registrierung offen für alle Domains."
      : "Selbstregistrierung deaktiviert.",
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

/* ── AI settings ────────────────────────────────────────────────────────── */

export async function saveAISettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  try {
    const saved = setAISettings({
      ollamaBaseUrl: String(formData.get("ollamaBaseUrl") ?? ""),
      textModel: String(formData.get("textModel") ?? ""),
      visionModel: String(formData.get("visionModel") ?? ""),
    });

    revalidatePath("/admin/settings/ai");

    const blank = [
      !saved.ollamaBaseUrl && "URL",
      !saved.textModel && "Textmodell",
      !saved.visionModel && "Vision-Modell",
    ].filter(Boolean);

    return {
      ok: true,
      message: blank.length
        ? `Gespeichert. Leer gelassen und daher aus der Umgebung: ${blank.join(", ")}.`
        : "Gespeichert. Die nächste KI-Anfrage nutzt diese Werte.",
    };
  } catch (error) {
    if (error instanceof AISettingsError) return { ok: false, error: error.message };
    throw error;
  }
}

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

  saveFormSchema(schema, actor.id);
  revalidatePath("/admin/forms/builder");
  revalidatePath("/customer/new");

  return {
    ok: true,
    message: `„${schema.title}“ gespeichert — ${fieldCount} Feld(er), ab sofort im Service-Katalog.`,
  };
}
