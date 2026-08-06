import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_VISIBILITY_PRESETS,
  VisibilityPresetSchema,
  type VisibilityPreset,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Vorlagen für die Sichtbarkeit.

   Eine Liste in `mits_setting`, gepflegt wie Textbausteine oder Makros: ganz
   gelesen, ganz geschrieben. Kein eigener Setting-Key an der Sichtbarkeit
   selbst — zwei Masken, die einen Blob teilen, überschreiben sich gegenseitig
   Abschnitte, und hier sind es sogar zwei Knöpfe auf derselben Seite.

   **Fehlt die Zeile, gelten die drei mitgelieferten Vorlagen.** Geschrieben wird
   erst beim ersten Speichern; danach steht dort, was der Admin stehen hat —
   auch eine leere Liste. Genau so ist „löschbar" gemeint: eine gelöschte
   Vorgabe kommt nicht beim nächsten Start zurück.
   ────────────────────────────────────────────────────────────────────────── */

const PRESETS_KEY = "visibility_presets";

export function listVisibilityPresets(): VisibilityPreset[] {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(PRESETS_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_VISIBILITY_PRESETS;

  const parsed = VisibilityPresetSchema.array().safeParse(
    safeJsonParse(row.value) ?? [],
  );

  // Eine kaputte Zeile fällt auf „keine Vorlagen" zurück, nicht auf die
  // Vorgaben: die Vorgaben zurückzugeben hieße, gelöschte Einträge wieder
  // erscheinen zu lassen, sobald jemand das JSON von Hand verunstaltet.
  return parsed.success ? parsed.data : [];
}

export function setVisibilityPresets(
  next: VisibilityPreset[],
): VisibilityPreset[] {
  const presets = VisibilityPresetSchema.array().parse(next);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(PRESETS_KEY, JSON.stringify(presets));

  return presets;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
