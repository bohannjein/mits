import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_WORKFLOW_SETTINGS,
  WorkflowSettingsSchema,
  type WorkflowSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Was beim Antworten passiert, und was mit stillstehenden Tickets.

   Eigener Key und keine Erweiterung von `data` — zwei Masken auf einem Blob
   überschreiben sich gegenseitig Abschnitte, dieselbe Begründung wie bei den
   fünf `portal_*`-Keys.

   Gelesen in `addComment`, also auf jedem Beitrag. Das ist ein indizierter Read
   auf eine Zeile; better-sqlite3 ist synchron, und an dieser Stelle ist es ein
   Zugriff neben einem Insert plus einer Transaktion.
   ────────────────────────────────────────────────────────────────────────── */

const WORKFLOW_KEY = "workflow";

export function getWorkflowSettings(): WorkflowSettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(WORKFLOW_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_WORKFLOW_SETTINGS;

  // Eine handeditierte oder ältere Zeile darf die Automatik nicht mitnehmen: sie
  // fällt auf die Vorgaben zurück, und die Vorgaben schließen nichts.
  const parsed = WorkflowSettingsSchema.safeParse(safeJsonParse(row.value));
  return parsed.success ? parsed.data : DEFAULT_WORKFLOW_SETTINGS;
}

export function setWorkflowSettings(next: WorkflowSettings): WorkflowSettings {
  // Feld für Feld statt Spread, wie bei `setAuthSettings`: ein Wert, den die
  // Maske nicht besitzt, kann so nicht hereinkommen, und ein neues Feld zwingt
  // dazu, diese Zeile anzufassen.
  const settings = WorkflowSettingsSchema.parse({
    claimOnReply: next.claimOnReply,
    statusFollowsReply: next.statusFollowsReply,
    resolvedCloseDays: next.resolvedCloseDays,
    waitingReminderDays: next.waitingReminderDays,
    waitingCloseDays: next.waitingCloseDays,
    waitingReminderSubject: next.waitingReminderSubject,
    waitingReminderBody: next.waitingReminderBody,
    autoCloseNote: next.autoCloseNote,
  });

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(WORKFLOW_KEY, JSON.stringify(settings));

  return settings;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
