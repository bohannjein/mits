import "server-only";

import { getAuthSettings } from "@/lib/settings";
import { hasTwoFactor } from "@/lib/users";
import { toTwoFactorRoles, type TwoFactorRole } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Zwei-Faktor: die Richtlinie, nicht das Verfahren.

   Das Verfahren macht Better Auths `two-factor`-Plugin. Hier steht nur die
   Antwort auf zwei Fragen: gilt die Pflicht für diese Rolle, und hat dieses
   Konto sie schon erfüllt.

   Eigene Datei und nicht `lib/settings.ts`: die Antwort braucht beides, die
   Einstellung *und* die `user`-Tabelle. In `lib/settings.ts` wäre das ein
   Datenbankzugriff in einer Datei, die sonst nur eine JSON-Zeile liest, und in
   `lib/users.ts` eine Richtlinie in einer Datei, die sonst nur Zeilen liefert.
   ────────────────────────────────────────────────────────────────────────── */

/** Die Rollen, für die der zweite Faktor gerade Pflicht ist. */
export function twoFactorRequiredRoles(): TwoFactorRole[] {
  return toTwoFactorRoles(getAuthSettings().twoFactorRequiredRoles);
}

/** Gilt die Pflicht für diese Rolle? */
export function twoFactorRequiredFor(role: unknown): boolean {
  if (typeof role !== "string") return false;
  return twoFactorRequiredRoles().includes(role as TwoFactorRole);
}

/**
 * Muss dieses Konto erst einen zweiten Faktor einrichten, bevor es weiterdarf?
 *
 * Die Reihenfolge der beiden Prüfungen ist Absicht und keine Kosmetik: solange
 * für diese Rolle keine Pflicht besteht — der Auslieferungszustand —, wird die
 * `user`-Tabelle gar nicht erst gelesen. Auf einer Instanz, die die Funktion
 * nicht benutzt, kostet der Guard damit einen Blob-Read und keinen zweiten
 * Zugriff pro Seitenaufruf; better-sqlite3 ist synchron, und jeder Read hält die
 * Event-Loop für alle anderen an.
 */
export function needsTwoFactorSetup(user: {
  id: string;
  role: unknown;
}): boolean {
  if (!twoFactorRequiredFor(user.role)) return false;
  return !hasTwoFactor(user.id);
}
