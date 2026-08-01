import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  AISettingsSchema,
  DEFAULT_AI_SETTINGS,
  isSafeOllamaUrl,
  isValidModelName,
  providerNeedsKey,
  type AIFallbackField,
  type AISettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The AI configuration — one row in `mits_setting`, edited under
   /admin/settings/ai.

   The environment is only a fallback, so a fresh stack starts without anyone
   writing a single variable. Precedence per field:
     database value → environment variable → built-in default
   Per FIELD rather than per record: an admin who only fixes the URL keeps the
   model names that were working.

   Only the three Ollama-era fields have an environment fallback. A provider
   choice, a master switch and four feature toggles deliberately do not — those
   are decisions somebody makes on a screen, and an environment variable that
   silently enabled an outbound-traffic feature would defeat the opt-in rule that
   the whole module is built around.

   The API key lives here too, like the SMTP password and the S3 secret, with the
   same documented trade-off: whoever can read this database can already read the
   sessions.
   ────────────────────────────────────────────────────────────────────────── */

const AI_KEY = "ai";

function fromEnv(): Record<AIFallbackField, string> {
  return {
    ollamaBaseUrl:
      process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_AI_SETTINGS.ollamaBaseUrl,
    textModel:
      process.env.OLLAMA_TEXT_MODEL?.trim() || DEFAULT_AI_SETTINGS.textModel,
    visionModel:
      process.env.OLLAMA_VISION_MODEL?.trim() || DEFAULT_AI_SETTINGS.visionModel,
  };
}

/** Raw stored values — empty strings where nothing has been configured. */
export function getStoredAISettings(): AISettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(AI_KEY) as { value: string } | undefined;

  // Parsing `{}` yields every default, so a missing or hand-edited row takes the
  // same path rather than taking the admin page down.
  const parsed = AISettingsSchema.safeParse(
    row ? (safeJsonParse(row.value) ?? {}) : {},
  );
  return parsed.success
    ? parsed.data
    : AISettingsSchema.parse({});
}

/**
 * What a request should actually use.
 *
 * The name is short because this is the one every caller wants; `getStored…` is
 * for the admin form, which has to show what is set apart from what is inherited.
 */
export function getAISettings(): AISettings {
  const stored = getStoredAISettings();
  const env = fromEnv();

  return {
    ...stored,
    ollamaBaseUrl: isSafeOllamaUrl(stored.ollamaBaseUrl)
      ? stored.ollamaBaseUrl.trim()
      : env.ollamaBaseUrl,
    textModel: isValidModelName(stored.textModel)
      ? stored.textModel.trim()
      : env.textModel,
    visionModel: isValidModelName(stored.visionModel)
      ? stored.visionModel.trim()
      : env.visionModel,
  };
}

/**
 * Kept under the old name for the triage gateway, which cares about exactly the
 * three Ollama fields and nothing else.
 */
export const getEffectiveAISettings = getAISettings;

/** Where each fallback-able value came from — shown in the admin form. */
export function describeAISettingsSource(): Record<AIFallbackField, "db" | "env"> {
  const stored = getStoredAISettings();
  return {
    ollamaBaseUrl: isSafeOllamaUrl(stored.ollamaBaseUrl) ? "db" : "env",
    textModel: isValidModelName(stored.textModel) ? "db" : "env",
    visionModel: isValidModelName(stored.visionModel) ? "db" : "env",
  };
}

export class AISettingsError extends Error {}

export function setAISettings(next: AISettings): AISettings {
  const settings = AISettingsSchema.parse({
    ...next,
    ollamaBaseUrl: next.ollamaBaseUrl.trim(),
    baseUrl: next.baseUrl.trim(),
    textModel: next.textModel.trim(),
    visionModel: next.visionModel.trim(),
  });

  // An empty field means "use the fallback" and is allowed; a non-empty invalid
  // one is rejected rather than silently ignored on the next read.
  if (settings.ollamaBaseUrl && !isSafeOllamaUrl(settings.ollamaBaseUrl)) {
    throw new AISettingsError(
      "Die Ollama-URL muss mit http:// oder https:// beginnen und einen Host enthalten.",
    );
  }
  if (settings.baseUrl && !isSafeOllamaUrl(settings.baseUrl)) {
    throw new AISettingsError(
      "Die Basis-URL muss mit http:// oder https:// beginnen und einen Host enthalten.",
    );
  }
  for (const [label, value] of [
    ["Textmodell", settings.textModel],
    ["Vision-Modell", settings.visionModel],
  ] as const) {
    if (value && !isValidModelName(value)) {
      throw new AISettingsError(
        `${label}: erlaubt sind Buchstaben, Ziffern, . _ - / und ein :tag.`,
      );
    }
  }

  /*
   * Refused rather than saved as a half-configuration.
   *
   * A cloud provider with no key produces an unauthenticated request on the next
   * summary somebody asks for, and the error surfaces to an agent as "der Dienst
   * antwortete mit HTTP 401" — a long way from the page where the mistake was made.
   */
  if (
    settings.enabled &&
    providerNeedsKey(settings.provider) &&
    settings.apiKey.trim() === ""
  ) {
    throw new AISettingsError(
      "Für diesen Anbieter wird ein API-Schlüssel gebraucht.",
    );
  }

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(AI_KEY, JSON.stringify(settings));

  return settings;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
