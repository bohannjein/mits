import "server-only";

import { db } from "@/lib/db/sqlite";
import type { IncidentRuleConfig } from "@/lib/mail/incident-rule";
import { MailSettingsSchema, type MailSettings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Mail ingest settings — stored in `mits_setting`, edited under /admin/mail.

   Only what the Defender rule needs so far. The transport configuration (IMAP host,
   credentials, or a Graph app registration) is deliberately absent: which of those MITS
   will speak is still open, and inventing half a form for each would leave two masks
   that configure nothing.
   ────────────────────────────────────────────────────────────────────────── */

const MAIL_KEY = "mail";

export function getMailSettings(): MailSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(MAIL_KEY) as { value: string } | undefined;

  if (!row) return MailSettingsSchema.parse({});

  try {
    // Parsed with defaults rather than cast: a row written before a field existed has
    // to keep working, and a failed parse here would take the admin page down.
    return MailSettingsSchema.parse(JSON.parse(row.value));
  } catch {
    return MailSettingsSchema.parse({});
  }
}

export function setMailSettings(next: MailSettings): MailSettings {
  const parsed = MailSettingsSchema.parse(next);
  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(MAIL_KEY, JSON.stringify(parsed));
  return parsed;
}

/**
 * The mailbox MITS actually reads, as an address — or empty.
 *
 * This is what a reply has to reach, and it is not necessarily the SMTP sender: a
 * stack can perfectly well send as `mits@firma.de` and poll `support@firma.de`.
 * Without it, `sendMail` has no way to point replies at the right box, and the
 * failure is silent in the worst way — the customer answers, the mail lands in a
 * mailbox nobody fetches, and nothing anywhere reports a problem.
 *
 * Only something containing an `@` is handed back: `graphMailbox` may hold an
 * object id instead of an address, and an object id in a `Reply-To` header is a
 * bounced reply.
 */
export function inboundAddress(settings = getMailSettings()): string {
  const raw =
    settings.transport === "imap"
      ? settings.imapUser
      : settings.transport === "graph"
        ? settings.graphMailbox
        : "";

  const address = raw.trim();
  return address.includes("@") ? address : "";
}

/**
 * The settings the incident rule takes, derived from the stored ones.
 *
 * A separate shape so the rule stays a pure function with no opinion about where its
 * configuration lives — that is what lets the whole classifier run in the offline test
 * suite.
 */
export function incidentRuleConfig(): IncidentRuleConfig {
  const settings = getMailSettings();
  return {
    enabled: settings.defenderRuleEnabled,
    onCallUserId: settings.onCallUserId || null,
    onCallEmail: settings.onCallEmail,
  };
}
