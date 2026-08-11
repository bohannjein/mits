import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_TICKET_DISPLAY_SETTINGS,
  TicketDisplaySettingsSchema,
  type TicketDisplaySettings,
  type TicketFormDisplay,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   How a filled-in form is shown on a ticket — stored in `mits_setting`, edited
   under /admin/settings/tickets.

   Its own key rather than a field in `system`: the two masks save independently,
   and a shared blob means whichever admin pressed save last silently reverts the
   other's section. Same reason `portal_config` is five keys and not one.

   Read on the server and passed down as a prop. Deliberately **not** a per-account
   preference in `localStorage`: an agent and the reporter looking at the same
   ticket have to be describing the same page, or a handover reads as two different
   products.
   ────────────────────────────────────────────────────────────────────────── */

const TICKET_DISPLAY_KEY = "ticket_display";

export function getTicketDisplaySettings(): TicketDisplaySettings {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(TICKET_DISPLAY_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_TICKET_DISPLAY_SETTINGS;

  /*
   * Through the schema, not a hand-read of one key.
   *
   * It used to pick `formDisplay` out of the parsed JSON by hand, which was fine
   * while that was the only field. With the customer layout in the same blob, a
   * hand-read would drop every switch an admin set — and the schema already knows
   * how to degrade field by field: the partial record fills its own gaps, so a row
   * written before those keys existed reads as "everything on".
   */
  const parsed = TicketDisplaySettingsSchema.safeParse(
    safeJsonParse(row.value) ?? {},
  );
  // A layout decision must not be able to break the page it lays out.
  return parsed.success ? parsed.data : DEFAULT_TICKET_DISPLAY_SETTINGS;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Just the one value — what the two ticket pages need, without the wrapper. */
export const getTicketFormDisplay = (): TicketFormDisplay =>
  getTicketDisplaySettings().formDisplay;

export function setTicketDisplaySettings(
  next: TicketDisplaySettings,
): TicketDisplaySettings {
  // Re-parsed rather than field-picked, so a field added to the schema is stored
  // without this function having to be remembered — the failure the hand-built
  // object had was silent, and it was "the admin's switches did not save".
  const settings = TicketDisplaySettingsSchema.parse(next);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(TICKET_DISPLAY_KEY, JSON.stringify(settings));

  return settings;
}
