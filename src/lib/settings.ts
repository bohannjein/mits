import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  AuthSettingsSchema,
  DEFAULT_AUTH_SETTINGS,
  type AuthSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Admin-controlled settings, stored as JSON blobs in `mits_setting`.

   `server-only` is load-bearing: importing this from a client component would
   otherwise pull the SQLite driver into the browser bundle and fail at build
   time with a confusing error instead of a clear one.
   ────────────────────────────────────────────────────────────────────────── */

const AUTH_SETTINGS_KEY = "auth";

export function getAuthSettings(): AuthSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(AUTH_SETTINGS_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_AUTH_SETTINGS;

  // A hand-edited or older row must not take the app down: fall back to defaults.
  const parsed = AuthSettingsSchema.safeParse(safeJsonParse(row.value));
  return parsed.success ? parsed.data : DEFAULT_AUTH_SETTINGS;
}

export function setAuthSettings(next: AuthSettings): AuthSettings {
  const settings = AuthSettingsSchema.parse({
    registrationEnabled: next.registrationEnabled,
    allowedEmailDomains: normaliseDomains(next.allowedEmailDomains),
  });

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(AUTH_SETTINGS_KEY, JSON.stringify(settings));

  return settings;
}

/**
 * Strip the `@`, lowercase, drop blanks and duplicates. Input arrives from an
 * admin textarea, so "@Company.COM , company.com" has to end up as one entry.
 */
export function normaliseDomains(input: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of input) {
    const domain = raw.trim().toLowerCase().replace(/^@+/, "");
    if (domain) seen.add(domain);
  }
  return [...seen];
}

/**
 * Whether this address may register under the current policy.
 *
 * Compares only the part after the **last** `@`, so `user@evil.com@company.com`
 * cannot smuggle an allowed domain into the local part, and requires an exact
 * match so `company.com` never admits `notcompany.com`.
 */
export function isEmailDomainAllowed(
  email: string,
  allowedDomains: string[],
): boolean {
  if (allowedDomains.length === 0) return true;

  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return false;

  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.includes(domain);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
