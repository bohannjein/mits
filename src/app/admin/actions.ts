"use server";

import { revalidatePath } from "next/cache";

import { AISettingsError, setAISettings } from "@/lib/ai-settings";
import { isRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { saveFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { setPortalContent } from "@/lib/portal";
import { normaliseDomains, setAuthSettings } from "@/lib/settings";
import { RoleChangeError, setUserRole } from "@/lib/users";
import {
  PortalContentSchema,
  isSafeResourceHref,
  parseFormSchema,
} from "@/types/mits";

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
    message: `„${schema.title}" gespeichert — ${fieldCount} Feld(er), ab sofort im Service-Katalog.`,
  };
}
