import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_TICKET_DISPLAY_SETTINGS,
  toTicketFormDisplay,
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

  try {
    const parsed = JSON.parse(row.value) as { formDisplay?: unknown };
    return { formDisplay: toTicketFormDisplay(parsed.formDisplay) };
  } catch {
    // A layout decision must not be able to break the page it lays out.
    return DEFAULT_TICKET_DISPLAY_SETTINGS;
  }
}

/** Just the one value — what the two ticket pages need, without the wrapper. */
export const getTicketFormDisplay = (): TicketFormDisplay =>
  getTicketDisplaySettings().formDisplay;

export function setTicketDisplaySettings(
  next: TicketDisplaySettings,
): TicketDisplaySettings {
  const settings: TicketDisplaySettings = {
    formDisplay: toTicketFormDisplay(next.formDisplay),
  };

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(TICKET_DISPLAY_KEY, JSON.stringify(settings));

  return settings;
}
