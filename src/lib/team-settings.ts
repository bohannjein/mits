import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_TEAM_SETTINGS,
  TeamSettingsSchema,
  type TeamSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Was auf der Team-Übersicht steht — eine Zeile in `mits_setting`, gepflegt
   unter /admin/settings/team.

   Instanzweit und nicht pro Konto, wie bei den Benachrichtigungen und aus
   demselben Grund: ob eine Angabe über eine Person auf einem geteilten
   Bildschirm steht, entscheidet nicht jeder für sich. Was pro Konto liegt, ist
   die Kapazität — und die ist keine Sichtbarkeitsfrage, sondern ein Maßstab.
   ────────────────────────────────────────────────────────────────────────── */

const TEAM_KEY = "team";

export function getTeamSettings(): TeamSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(TEAM_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_TEAM_SETTINGS;

  /*
   * Eine kaputte oder von einem älteren Build geschriebene Zeile nimmt denselben
   * Weg wie eine fehlende. Der Fehler, den das verhindert, ist gerichtet: ein
   * abgelehnter Parse fiele auf die Defaults zurück, und die Defaults *zeigen*
   * mehr als eine Konfiguration, in der jemand etwas abgeschaltet hat.
   */
  const parsed = TeamSettingsSchema.safeParse(safeJsonParse(row.value) ?? {});
  return parsed.success ? parsed.data : DEFAULT_TEAM_SETTINGS;
}

export function setTeamSettings(next: TeamSettings): TeamSettings {
  const settings = TeamSettingsSchema.parse(next);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(TEAM_KEY, JSON.stringify(settings));

  return settings;
}

/* ──────────────────────────────────────────────────────────────────────────
   Kapazität je Konto.

   Ein eigener Setting-Schlüssel pro Person statt eines Feldes im Blob darüber —
   dieselbe Bauart wie `agent_view:<userId>` und `queue_columns:<userId>`. Der
   Grund ist derselbe: zwei Masken auf einer Zeile überschreiben sich gegenseitig
   den Abschnitt der jeweils anderen, und hier kommt der eine Wert aus einer
   Liste mit einem Feld pro Agent, während der Rest aus einem Formular mit
   Schaltern kommt.

   Kein Eintrag heißt „nimm den Instanzwert", nicht „Kapazität null". Der
   Unterschied ist die ganze Ergonomie der Maske: ein frisch angelegtes Konto
   soll denselben Maßstab bekommen wie die anderen, ohne dass jemand eine Zahl
   nachträgt.
   ────────────────────────────────────────────────────────────────────────── */

const capacityKey = (userId: string) => `team_capacity:${userId}`;

/** Der eingetragene Wert, oder `null` wenn für dieses Konto keiner steht. */
export function getAgentCapacity(userId: string): number | null {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(capacityKey(userId)) as { value: string } | undefined;

  if (!row) return null;

  const parsed = Number.parseInt(row.value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Alle eingetragenen Kapazitäten auf einmal.
 *
 * Ein `LIKE` über die Schlüssel statt einer Abfrage je Agent — die Seite braucht
 * sie ohnehin alle, und zwölf Reads für zwölf Zahlen sind zwölf Reads zu viel.
 */
export function listAgentCapacities(): Map<string, number> {
  const rows = db
    .prepare("SELECT key, value FROM mits_setting WHERE key LIKE 'team_capacity:%'")
    .all() as { key: string; value: string }[];

  const out = new Map<string, number>();
  for (const row of rows) {
    const userId = row.key.slice("team_capacity:".length);
    if (!userId) continue;
    const parsed = Number.parseInt(row.value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) out.set(userId, parsed);
  }
  return out;
}

/** `null` löscht den Eintrag, das Konto fällt damit auf den Instanzwert zurück. */
export function setAgentCapacity(userId: string, capacity: number | null): void {
  if (capacity === null) {
    db.prepare("DELETE FROM mits_setting WHERE key = ?").run(capacityKey(userId));
    return;
  }

  // Derselbe Rahmen wie am Instanzwert in `TeamSettingsSchema`. Geklemmt statt
  // abgelehnt: die Zahl kommt aus einem Zahlenfeld, nicht aus einer Auswahl,
  // und eine abgelehnte Zeile nähme die anderen Kapazitäten desselben Absendens
  // mit.
  const clean = Math.min(500, Math.max(0, Math.trunc(capacity)));

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(capacityKey(userId), String(clean));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
