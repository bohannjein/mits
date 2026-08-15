"use server";

import { revalidatePath } from "next/cache";

import { canViewBoard } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { getTicketFor } from "@/lib/tickets";
import {
  isWatching,
  unwatchTicket,
  watchTicket,
} from "@/lib/ticket-watchers";

/* ──────────────────────────────────────────────────────────────────────────
   Einem Ticket folgen und wieder aufhören.

   Eine Action für beide Richtungen, wie beim Anheften: der Knopf ist einer.

   **Die Zugriffsprüfung sitzt hier und nicht in der Bibliothek.** Das ist der
   sichtbare Unterschied zu `lib/ticket-pins.ts`, und er hat einen Grund:
   `lib/ticket-watchers.ts` muss eine Senke bleiben, weil `assignTicket` und
   `addComment` sie aufrufen — sie darf `lib/tickets.ts` also nicht importieren.
   Die Tür ist trotzdem dieselbe: `getTicketFor` antwortet für „gibt es nicht"
   und „darfst du nicht sehen" gleich, damit sich über den Unterschied keine Ids
   aufzählen lassen.

   **Rolle und Flag werden hier geprüft, nicht nur im Markup.** Eine Server
   Action ist als POST auf die Route erreichbar, aus der sie stammt. Regel 6.
   ────────────────────────────────────────────────────────────────────────── */

export type WatchActionResult =
  | { ok: true; watching: boolean; message: string }
  | { ok: false; error: string };

export async function toggleWatchAction(
  _previous: WatchActionResult | null,
  formData: FormData,
): Promise<WatchActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const user = await requireUser(`/mits/tickets/${ticketId}`);

  /*
   * Agenten, nicht Melder — dieselbe Grenze wie bei Pins und Erinnerungen.
   * Nicht aus Vertraulichkeit: ein Melder bekommt jede öffentliche Antwort auf
   * sein eigenes Ticket ohnehin, ein Abo wäre für ihn eine Zeile ohne Wirkung.
   */
  if (!canViewBoard(user.role)) {
    return { ok: false, error: "Beobachten ist Agenten vorbehalten." };
  }

  if (!isFeatureEnabled("feature_ticket_watchers")) {
    return { ok: false, error: "Beobachten ist abgeschaltet." };
  }

  if (!getTicketFor(ticketId, user)) {
    return { ok: false, error: "Ticket nicht gefunden." };
  }

  const watching = !isWatching(ticketId, user.id);
  if (watching) {
    watchTicket(ticketId, user.id);
  } else {
    unwatchTicket(ticketId, user.id);
  }

  /*
   * Die Queue, weil `searchTickets` die Spalte `watched` mitliefert, und die
   * Agenten-Detailansicht wegen des Knopfes. **Nicht** `/customer`: dort gibt es
   * weder Knopf noch Spalte.
   */
  revalidatePath("/mits");
  revalidatePath("/mits/today");
  if (ticketId) revalidatePath(`/mits/tickets/${ticketId}`);

  return {
    ok: true,
    watching,
    message: watching ? "Du folgst diesem Ticket." : "Du folgst nicht mehr.",
  };
}
