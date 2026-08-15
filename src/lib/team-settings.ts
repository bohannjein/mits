import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_TEAM_SETTINGS,
  TeamSettingsSchema,
  type TeamSettings,
} from "@/types/mits";

// Instanzweit, wie die Benachrichtigungen. Pro Konto liegt nur die Kapazität.

const TEAM_KEY = "team";

export function getTeamSettings(): TeamSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(TEAM_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_TEAM_SETTINGS;

  // Eine kaputte Zeile nimmt denselben Weg wie eine fehlende.
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

// Eigener Setting-Schlüssel je Person, wie `agent_view:<userId>`: zwei Masken
// auf einer Zeile überschreiben sich gegenseitig ihren Abschnitt.
// Kein Eintrag heißt „nimm den Instanzwert", nicht „Kapazität null".

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

/** Ein `LIKE` über die Schlüssel statt einer Abfrage je Agent. */
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

  // Geklemmt statt abgelehnt: eine abgelehnte Zeile nähme die anderen
  // Kapazitäten desselben Absendens mit.
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
