"use server";

import { revalidatePath } from "next/cache";

import { canViewBoard } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { PinError, togglePin } from "@/lib/ticket-pins";

/* ──────────────────────────────────────────────────────────────────────────
   Anheften und lösen.

   Eine Action für beide Richtungen, wie beim Abhaken einer Erinnerung: der Knopf
   ist einer, und ein getrennter Endpunkt für die Rücknahme wäre ein zweiter
   Codepfad für das, was den einen Klick überhaupt gefahrlos macht.

   **Rolle und Flag werden hier geprüft, nicht nur im Markup.** Eine Server
   Action ist als POST auf die Route erreichbar, aus der sie stammt; dass der
   Knopf für einen Melder gar nicht gerendert wird, sagt nichts über den, der
   den Request schickt. Regel 6.
   ────────────────────────────────────────────────────────────────────────── */

export type PinActionResult =
  | { ok: true; pinned: boolean; message: string }
  | { ok: false; error: string };

/**
 * Wo ein Pin sichtbar ist.
 *
 * Die Queue wegen des Blocks darüber, die Agenten-Detailansicht wegen des
 * Knopfes. **Nicht** `/customer`: Melder haben keine Pins, und eine
 * Revalidierung dorthin wäre Arbeit für eine Fläche, auf der sich nichts
 * geändert hat.
 */
function revalidatePins(ticketId: string): void {
  revalidatePath("/mits");
  if (ticketId) revalidatePath(`/mits/tickets/${ticketId}`);
}

export async function togglePinAction(
  _previous: PinActionResult | null,
  formData: FormData,
): Promise<PinActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const user = await requireUser(`/mits/tickets/${ticketId}`);

  if (!canViewBoard(user.role)) {
    return { ok: false, error: "Angeheftete Tickets sind Agenten vorbehalten." };
  }

  if (!isFeatureEnabled("feature_ticket_pins")) {
    return { ok: false, error: "Anheften ist abgeschaltet." };
  }

  let pinned: boolean;
  try {
    pinned = togglePin(ticketId, user);
  } catch (error) {
    if (error instanceof PinError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePins(ticketId);

  return {
    ok: true,
    pinned,
    message: pinned ? "Ticket angeheftet." : "Ticket gelöst.",
  };
}
