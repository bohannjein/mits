import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_FEATURE_FLAGS,
  FeatureFlagsSchema,
  type FeatureFlagKey,
  type FeatureFlags,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Feature toggles.

   One JSON blob in `mits_setting`, read on almost every page. Every field has a
   `.default()`, so a flag added in a later release is simply on or off per its
   own default on an instance whose stored row predates it — no migration, and no
   chance of a missing key switching a module off by accident.
   ────────────────────────────────────────────────────────────────────────── */

const FEATURES_KEY = "features";

export function getFeatureFlags(): FeatureFlags {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(FEATURES_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_FEATURE_FLAGS;

  // Parsing `{}` yields every default, so a hand-edited or partial row takes the
  // same path as a missing one instead of taking the instance down.
  const parsed = FeatureFlagsSchema.safeParse(safeJsonParse(row.value) ?? {});
  return parsed.success ? parsed.data : DEFAULT_FEATURE_FLAGS;
}

/** Single-flag check, for the common `if (isEnabled("…"))` call site. */
export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  return getFeatureFlags()[key];
}

export function setFeatureFlags(next: FeatureFlags): FeatureFlags {
  const flags = FeatureFlagsSchema.parse(next);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(FEATURES_KEY, JSON.stringify(flags));

  return flags;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
