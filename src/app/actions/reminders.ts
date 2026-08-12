"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { resolveReminderDue } from "@/lib/reminder-presets";
import { getSystemTimezone } from "@/lib/system-settings";
import {
  ReminderError,
  createReminder,
  deleteReminder,
  setReminderDone,
} from "@/lib/ticket-reminders";
import { formatDateTime } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────────────
   Reminder actions.

   Every one re-reads the session, like every other Server Function here: being
   rendered inside a popover proves nothing about the caller, and a Server Action
   is reachable as a POST to whatever route it was used from.

   **The due time is computed on the server.** The popover sends a preset name or
   a `datetime-local` reading, never an instant. Not because a forged instant
   would be dangerous — it would only be somebody's own reminder at their own
   chosen time — but because the arithmetic has to exist once: „morgen 09:00" in
   the instance's timezone, across a DST switch, is the part that goes wrong, and
   two implementations of it disagree twice a year.

   Access to the *ticket* is checked in `createReminder`, which resolves it
   through `getTicketFor` — the same door as everywhere else. Ticking off and
   deleting need no ticket check at all: those statements carry `user_id` in the
   WHERE, so a foreign row is not found rather than refused.

   **Agenten vorbehalten, alle drei.** Das war einmal anders begründet: ein
   Melder, der „Freitag nachfragen" auf sein eigenes Ticket legt, fragt nicht am
   Dienstag an. Die Entscheidung ist umgekehrt worden — eine Erinnerung ist ein
   Arbeitsmittel des Desks, und der Melder bekommt sein Ticket ohnehin
   nachgehalten.

   `requireRole` und nicht bloß ein entfernter Knopf: Ausblenden ist keine Grenze.
   Eine Server Action ist als POST auf die Route erreichbar, auf der sie benutzt
   wurde, und die Melder-Ticketseite bleibt erreichbar.
   ────────────────────────────────────────────────────────────────────────── */

export type ReminderActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Every surface a reminder shows up on.
 *
 * Die Agenten-Ticketseite trägt den Knopf und sein Badge, `/mits` das Widget. Eine
 * Funktion, damit eine später dazukommende Fläche einmal ergänzt wird — dieselbe
 * Begründung wie bei `revalidateTicket`, und sie existiert wegen desselben
 * Fehlers: dreizehn Aufrufstellen, die von Hand revalidierten, waren
 * auseinandergelaufen.
 */
function revalidateReminders(ticketId?: string): void {
  // Nur die Agentenflächen: die Melderseite trägt weder Knopf noch Widget mehr,
  // und eine Revalidierung für eine Fläche ohne Inhalt ist ein Cache-Wurf ins
  // Leere.
  if (ticketId) revalidatePath(`/mits/tickets/${ticketId}`);
  revalidatePath("/mits");
}

export async function setReminderAction(
  _previous: ReminderActionResult | null,
  formData: FormData,
): Promise<ReminderActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const user = await requireRole("agent", `/mits/tickets/${ticketId}`);

  // Checked in the action as well as hidden in the UI. A disabled module has to
  // be disabled for whoever posts to it, not only for whoever sees the button.
  if (!isFeatureEnabled("feature_ticket_reminders")) {
    return { ok: false, error: "Erinnerungen sind abgeschaltet." };
  }

  const timeZone = getSystemTimezone();
  const due = resolveReminderDue(
    {
      preset: formData.get("preset")?.toString() ?? null,
      at: formData.get("at")?.toString() ?? null,
    },
    new Date(),
    timeZone,
  );

  /*
   * One message for every way the date can be unusable — unparseable, in the
   * past, absurdly far ahead. Naming which of the three it was would mean
   * explaining a bound nobody was told about; „in der Zukunft" is the part the
   * person can act on.
   */
  if (!due) {
    return { ok: false, error: "Bitte einen Zeitpunkt in der Zukunft wählen." };
  }

  try {
    createReminder(
      ticketId,
      user,
      due,
      String(formData.get("note") ?? ""),
    );
  } catch (error) {
    if (error instanceof ReminderError) return { ok: false, error: error.message };
    throw error;
  }

  revalidateReminders(ticketId);

  return {
    ok: true,
    message: `Erinnerung für ${formatDateTime(due, timeZone)} gesetzt.`,
  };
}

/**
 * Tick one off, or put it back.
 *
 * One action for both directions rather than two, because the widget's button is
 * one control: a separate „wieder öffnen" action would be a second code path for
 * the undo of the first, and the undo is what makes a one-click tick safe.
 */
export async function completeReminderAction(
  _previous: ReminderActionResult | null,
  formData: FormData,
): Promise<ReminderActionResult> {
  const user = await requireRole("agent", "/mits");
  const id = String(formData.get("reminderId") ?? "");
  const done = String(formData.get("done") ?? "1") === "1";
  const ticketId = String(formData.get("ticketId") ?? "");

  try {
    setReminderDone(id, user.id, done);
  } catch (error) {
    if (error instanceof ReminderError) return { ok: false, error: error.message };
    throw error;
  }

  revalidateReminders(ticketId || undefined);

  return {
    ok: true,
    message: done ? "Erinnerung abgehakt." : "Erinnerung wieder offen.",
  };
}

export async function deleteReminderAction(
  _previous: ReminderActionResult | null,
  formData: FormData,
): Promise<ReminderActionResult> {
  const user = await requireRole("agent", "/mits");
  const id = String(formData.get("reminderId") ?? "");
  const ticketId = String(formData.get("ticketId") ?? "");

  try {
    deleteReminder(id, user.id);
  } catch (error) {
    if (error instanceof ReminderError) return { ok: false, error: error.message };
    throw error;
  }

  revalidateReminders(ticketId || undefined);

  return { ok: true, message: "Erinnerung entfernt." };
}
