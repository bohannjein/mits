import "server-only";

import { db } from "@/lib/db/sqlite";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/format";
import { canViewBoard } from "@/lib/auth/roles";
import {
  DEFAULT_NTP_HOST,
  SystemSettingsSchema,
  isRefreshInterval,
  isValidNtpHost,
  toRefreshInterval,
  type RefreshInterval,
  type SystemSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   System settings: display timezone and time server — stored in `mits_setting`,
   edited under /admin/settings/system.

   Environment variables are a fallback, per field, the same arrangement the AI
   settings use: an admin who only changes the timezone keeps the NTP host.
   ────────────────────────────────────────────────────────────────────────── */

const SYSTEM_KEY = "system";

function fromEnv(): SystemSettings {
  return {
    timezone: process.env.MITS_TIMEZONE?.trim() || DEFAULT_TIMEZONE,
    ntpHost: process.env.MITS_NTP_HOST?.trim() || DEFAULT_NTP_HOST,
    refreshMinutes: toRefreshInterval(process.env.MITS_REFRESH_MINUTES),
  };
}

/**
 * The values in effect.
 *
 * Each field falls back on its own, and an invalid stored value falls back rather
 * than being handed on. That last part is not politeness: a timezone the runtime
 * cannot format makes `Intl.DateTimeFormat` throw inside every render that shows a
 * date, so one bad row would take every page down at once. Validating on save is
 * not enough — a hand-edited database or one restored from an instance with
 * different ICU data would slip past it.
 */
export function getSystemSettings(): SystemSettings {
  const environment = fromEnv();

  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(SYSTEM_KEY) as { value: string } | undefined;

  if (!row) return environment;

  let stored: Partial<SystemSettings> = {};
  try {
    stored = SystemSettingsSchema.partial().parse(JSON.parse(row.value));
  } catch {
    return environment;
  }

  const timezone = stored.timezone?.trim();
  const ntpHost = stored.ntpHost?.trim();

  return {
    timezone:
      timezone && isValidTimezone(timezone) ? timezone : environment.timezone,
    ntpHost: ntpHost && isValidNtpHost(ntpHost) ? ntpHost : environment.ntpHost,
    refreshMinutes: isRefreshInterval(stored.refreshMinutes)
      ? stored.refreshMinutes
      : environment.refreshMinutes,
  };
}

/** Just the display timezone — what the layout needs, without the rest. */
export const getSystemTimezone = (): string => getSystemSettings().timezone;

export class SystemSettingsError extends Error {}

export function setSystemSettings(next: SystemSettings): SystemSettings {
  const timezone = next.timezone.trim();
  const ntpHost = next.ntpHost.trim();

  if (!isValidTimezone(timezone)) {
    throw new SystemSettingsError(
      `„${timezone}“ ist keine Zeitzone, die dieser Server kennt.`,
    );
  }
  if (!isValidNtpHost(ntpHost)) {
    throw new SystemSettingsError(
      "Der Zeitserver muss ein Hostname oder eine IP sein, ohne Schema und ohne Port.",
    );
  }

  const value = JSON.stringify({
    timezone,
    ntpHost,
    refreshMinutes: next.refreshMinutes,
  });
  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SYSTEM_KEY, value);

  return { timezone, ntpHost, refreshMinutes: next.refreshMinutes };
}

/* ──────────────────────────────────────────────────────────────────────────
   Per-agent refresh override.

   One `mits_setting` row per agent, keyed like the saved queue view. Staff only:
   a technician watching an escalation wants a shorter interval than a reporter
   glancing at their own ticket, and the reporter has no reason to be given a knob
   that costs the server requests.

   Stored server-side rather than in `localStorage` so it follows the account to
   whichever machine the shift is worked from, and so the settings page can show what
   is actually in effect.
   ────────────────────────────────────────────────────────────────────────── */

const refreshKey = (userId: string) => `refresh:${userId}`;

/** The agent's own choice, or null when they have not made one. */
export function getUserRefreshMinutes(userId: string): RefreshInterval | null {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(refreshKey(userId)) as { value: string } | undefined;

  if (!row) return null;
  const parsed = Number(row.value);
  return isRefreshInterval(parsed) ? parsed : null;
}

/** `null` clears the override and hands the account back to the global value. */
export function setUserRefreshMinutes(
  userId: string,
  minutes: RefreshInterval | null,
): void {
  if (minutes === null) {
    db.prepare("DELETE FROM mits_setting WHERE key = ?").run(refreshKey(userId));
    return;
  }

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(refreshKey(userId), String(minutes));
}

/**
 * The interval that applies to this account.
 *
 * Reporters always get the instance-wide value — the admin decides how much load
 * the portal generates, and it is not a per-person preference. Staff may override it
 * for themselves; without an override they follow the same global value.
 */
export function resolveRefreshMinutes(user: {
  id: string;
  role: unknown;
}): RefreshInterval {
  const global = getSystemSettings().refreshMinutes;
  if (!canViewBoard(user.role)) return global;
  return getUserRefreshMinutes(user.id) ?? global;
}
