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

// Die Zugriffsprüfung sitzt hier statt in der Bibliothek: `ticket-watchers.ts`
// muss eine Senke bleiben. Rolle und Flag ebenfalls hier — Regel 6.

export type WatchActionResult =
  | { ok: true; watching: boolean; message: string }
  | { ok: false; error: string };

export async function toggleWatchAction(
  _previous: WatchActionResult | null,
  formData: FormData,
): Promise<WatchActionResult> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const user = await requireUser(`/mits/tickets/${ticketId}`);

  // Agenten, nicht Melder: für einen Melder wäre ein Abo eine Zeile ohne Wirkung.
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

  // Nicht `/customer`: dort gibt es weder Knopf noch Spalte.
  revalidatePath("/mits");
  revalidatePath("/mits/today");
  if (ticketId) revalidatePath(`/mits/tickets/${ticketId}`);

  return {
    ok: true,
    watching,
    message: watching ? "Du folgst diesem Ticket." : "Du folgst nicht mehr.",
  };
}
