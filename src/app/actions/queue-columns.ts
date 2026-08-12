"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { saveHiddenQueueColumns } from "@/lib/agent-views";
import { toHiddenQueueColumns } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Die Spaltenwahl eines Agenten.

   Eigene Datei und nicht zu `app/actions/tickets.ts`: dort liegen die Mutationen
   *an einem Ticket*, und jede beginnt mit `authorize(ticketId, …)`. Hier gibt es
   kein Ticket — die Einstellung gehört dem Konto.

   `requireRole("agent")` und nicht `requireUser`: die Queue ist Agentenfläche, und
   eine Server Action ist als POST auf die Route erreichbar, auf der sie benutzt
   wurde. Ausblenden ist keine Grenze.
   ────────────────────────────────────────────────────────────────────────── */

export type QueueColumnsResult = { ok: true } | { ok: false; error: string };

export async function saveQueueColumnsAction(
  _previous: QueueColumnsResult | null,
  formData: FormData,
): Promise<QueueColumnsResult> {
  const user = await requireRole("agent", "/mits");

  /*
   * `getAll` und dann durch die Transform.
   *
   * Was ankommt, sind Formularfelder — beliebige Zeichenketten. `toHiddenQueueColumns`
   * filtert auf die bekannten Schlüssel, statt einen unbekannten abzulehnen: eine
   * verunstaltete Anfrage soll die Spaltenwahl nicht in einen Fehler verwandeln,
   * sie soll nur nichts Unbekanntes speichern.
   */
  const hidden = toHiddenQueueColumns(
    formData.getAll("hidden").map((entry) => String(entry)),
  );

  saveHiddenQueueColumns(user.id, hidden);

  /*
   * Nur die Queue. Die Melderliste teilt sich `TicketTable`, bekommt die Wahl aber
   * nicht übergeben — sie behält ihren festen schmalen Satz, es gibt dort also
   * nichts neu zu rendern.
   */
  revalidatePath("/mits");

  return { ok: true };
}
