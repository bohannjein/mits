import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  AnalyticsSettingsSchema,
  DEFAULT_ANALYTICS_SETTINGS,
  type AnalyticsSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Which widgets the panel shows, and how often it refreshes by default.

   One JSON row in `mits_setting`, like the feature flags. Every field has a
   `.default()`, so a widget added in a later release appears per its own default
   on an instance whose stored row predates it — no migration, and no chance of a
   missing key hiding a panel by accident.
   ────────────────────────────────────────────────────────────────────────── */

const KEY = "analytics";

export function getAnalyticsSettings(): AnalyticsSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_ANALYTICS_SETTINGS;

  // Parsing `{}` yields every default, so a hand-edited or partial row takes the
  // same path as a missing one instead of taking the panel down.
  const parsed = AnalyticsSettingsSchema.safeParse(safeJsonParse(row.value) ?? {});
  return parsed.success ? parsed.data : DEFAULT_ANALYTICS_SETTINGS;
}

export function setAnalyticsSettings(
  next: AnalyticsSettings,
): AnalyticsSettings {
  const settings = AnalyticsSettingsSchema.parse(next);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, JSON.stringify(settings));

  return settings;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
