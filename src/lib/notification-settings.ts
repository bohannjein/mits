import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettingsSchema,
  type NotificationSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   How the notification toasts look and behave — one row in `mits_setting`,
   edited under /admin/settings/notifications.

   Instance-wide rather than per account, which is the deliberate half of the
   design. The alternative was a preference on the profile page, and it is the
   wrong shape for this: an administrator setting up MITS for a service desk is
   deciding how loud the room is, and forty people each discovering the setting
   for themselves is forty chances for somebody to switch off the channel that
   tells them a ticket was handed to them.

   The one thing that *is* per person stays per person: the theme. That is a
   property of the browser somebody is sitting at, this is a property of the
   installation.
   ────────────────────────────────────────────────────────────────────────── */

const NOTIFICATION_KEY = "notifications";

export function getNotificationSettings(): NotificationSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(NOTIFICATION_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_NOTIFICATION_SETTINGS;

  /*
   * Parsing `{}` yields every default, so a hand-edited or partial row takes the
   * same path as a missing one. The failure this avoids is specific: a stored
   * value that no longer parses would otherwise silence every channel, and a
   * notification system that is quiet looks exactly like one with nothing to say.
   */
  const parsed = NotificationSettingsSchema.safeParse(
    safeJsonParse(row.value) ?? {},
  );
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_SETTINGS;
}

export function setNotificationSettings(
  next: NotificationSettings,
): NotificationSettings {
  const settings = NotificationSettingsSchema.parse(next);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(NOTIFICATION_KEY, JSON.stringify(settings));

  return settings;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
