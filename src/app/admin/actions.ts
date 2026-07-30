"use server";

import { revalidatePath } from "next/cache";

import { AISettingsError, setAISettings } from "@/lib/ai-settings";
import { isRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { setFeatureFlags } from "@/lib/features";
import { saveFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { LocationError, replaceLocations } from "@/lib/locations";
import {
  setMaintenanceNotices,
  setPortalConfig,
  setPortalContent,
  setPortalFaqs,
  setPortalServices,
} from "@/lib/portal";
import { normaliseDomains, setAuthSettings } from "@/lib/settings";
import { RoleChangeError, setUserRole } from "@/lib/users";
import {
  FEATURE_FLAG_META,
  FeatureFlagsSchema,
  MITSLocationSchema,
  PortalConfigSchema,
  PortalContentSchema,
  PortalFaqSchema,
  PortalMaintenanceSchema,
  PortalServiceSchema,
  isSafeResourceHref,
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
  revalidatePath("/admin/portal");
  revalidatePath("/tickets/new");

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
  revalidatePath("/");
  revalidatePath("/admin/portal");
  revalidatePath("/tickets/new");
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
  revalidatePath("/tickets/new");
  revalidatePath("/board");

  const active = saved.filter((location) => location.active).length;
  return {
    ok: true,
    message: `${saved.length} Standort(e) gespeichert, ${active} davon auswählbar.`,
  };
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

  saveFormSchema(schema, actor.id);
  revalidatePath("/admin/forms/builder");
  revalidatePath("/tickets/new");

  return {
    ok: true,
    message: `„${schema.title}“ gespeichert — ${fieldCount} Feld(er), ab sofort im Service-Katalog.`,
  };
}
