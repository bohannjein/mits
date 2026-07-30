import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  AISettingsSchema,
  DEFAULT_AI_SETTINGS,
  isSafeOllamaUrl,
  isValidModelName,
  type AISettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ollama endpoint and model choice — stored in `mits_setting`, edited under
   /admin/settings/ai.

   The environment is only a fallback, so a fresh stack starts without anyone
   writing a single variable. Precedence per field:
     database value → environment variable → built-in default
   Falling back per FIELD rather than per record matters: an admin who only fixes
   the URL keeps the model names that were working.
   ────────────────────────────────────────────────────────────────────────── */

const AI_KEY = "ai";

function fromEnv(): AISettings {
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

  if (!row) return { ollamaBaseUrl: "", textModel: "", visionModel: "" };

  const parsed = AISettingsSchema.safeParse(safeJsonParse(row.value));
  return parsed.success
    ? parsed.data
    : { ollamaBaseUrl: "", textModel: "", visionModel: "" };
}

/** What the triage should actually use, with the fallbacks resolved. */
export function getEffectiveAISettings(): AISettings {
  const stored = getStoredAISettings();
  const env = fromEnv();

  return {
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

/** Where each effective value came from — shown in the admin form. */
export function describeAISettingsSource(): Record<keyof AISettings, "db" | "env"> {
  const stored = getStoredAISettings();
  return {
    ollamaBaseUrl: isSafeOllamaUrl(stored.ollamaBaseUrl) ? "db" : "env",
    textModel: isValidModelName(stored.textModel) ? "db" : "env",
    visionModel: isValidModelName(stored.visionModel) ? "db" : "env",
  };
}

export class AISettingsError extends Error {}

export function setAISettings(next: AISettings): AISettings {
  const trimmed: AISettings = {
    ollamaBaseUrl: next.ollamaBaseUrl.trim(),
    textModel: next.textModel.trim(),
    visionModel: next.visionModel.trim(),
  };

  // An empty field means "use the fallback" and is allowed; a non-empty invalid
  // one is rejected rather than silently ignored on the next read.
  if (trimmed.ollamaBaseUrl && !isSafeOllamaUrl(trimmed.ollamaBaseUrl)) {
    throw new AISettingsError(
      "Die Ollama-URL muss mit http:// oder https:// beginnen und einen Host enthalten.",
    );
  }
  for (const [label, value] of [
    ["Textmodell", trimmed.textModel],
    ["Vision-Modell", trimmed.visionModel],
  ] as const) {
    if (value && !isValidModelName(value)) {
      throw new AISettingsError(
        `${label}: erlaubt sind Buchstaben, Ziffern, . _ - / und ein :tag.`,
      );
    }
  }

  const settings = AISettingsSchema.parse(trimmed);
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
