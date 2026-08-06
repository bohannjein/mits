import "server-only";

import { db } from "@/lib/db/sqlite";
import {
  DEFAULT_ROLE_VISIBILITY,
  NAV_AREAS,
  RoleVisibilitySchema,
  roleSeesArea,
  roleSeesForm,
  type NavArea,
  type RoleVisibility,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Sichtbarkeit je Rolle — die Serverseite.

   Ein JSON-Blob in `mits_setting`, gelesen auf fast jeder Seite. Die Regeln
   selbst stehen als reine Funktionen in `types/mits.ts`; hier liegt nur der
   Zugriff auf die Zeile und die Durchsetzung auf einer Route.

   **Ein leerer oder kaputter Eintrag heißt „alles sichtbar".** Das ist die
   sichere Richtung: ein handeditiertes JSON, das nicht mehr parst, darf nicht
   dazu führen, dass eine Instanz ihren Anwendern still die halbe Oberfläche
   wegnimmt — ein Fehlerbild, das niemand mit einer Einstellungsdatei in
   Verbindung bringt.

   **Kein `next/navigation` in dieser Datei.** Der Seiten-Guard `requireArea`
   steht in `lib/auth/session.ts`, wo die anderen Guards liegen und `redirect`
   ohnehin schon importiert ist. Hier wäre er teuer: `lib/form-schemas.ts` liest
   die Regeln, `lib/tickets.ts` liest die Formulare, und die DB-Suite lädt
   `lib/tickets.ts` unter `--conditions=react-server` — wo `next/navigation` auf
   den Client-Build auflöst und beim Import wirft. Derselbe Grund, aus dem
   `exportLookups` nicht in `lib/cmdb-api.ts` steht.
   ────────────────────────────────────────────────────────────────────────── */

const VISIBILITY_KEY = "role_visibility";

export function getRoleVisibility(): RoleVisibility {
  const row = db
    .prepare("SELECT value FROM mits_setting WHERE key = ?")
    .get(VISIBILITY_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_ROLE_VISIBILITY;

  const parsed = RoleVisibilitySchema.safeParse(safeJsonParse(row.value) ?? {});
  return parsed.success ? parsed.data : DEFAULT_ROLE_VISIBILITY;
}

export function setRoleVisibility(next: RoleVisibility): RoleVisibility {
  const visibility = RoleVisibilitySchema.parse(next);

  db.prepare(
    `INSERT INTO mits_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(VISIBILITY_KEY, JSON.stringify(visibility));

  return visibility;
}

/** Darf diese Rolle die Fläche sehen? Admin immer. */
export function canSeeArea(role: unknown, area: NavArea): boolean {
  return roleSeesArea(getRoleVisibility(), role, area);
}

/** Darf diese Rolle dieses Formular sehen und absenden? Admin immer. */
export function canSeeForm(role: unknown, formSchemaId: string): boolean {
  return roleSeesForm(getRoleVisibility(), role, formSchemaId);
}

/**
 * Alle Flächen dieser Rolle auf einmal.
 *
 * Für Aufrufer, die mehrere gleichzeitig brauchen — die Kopfzeile fragt zwei,
 * das Benutzermenü drei. Ein Aufruf statt fünf: `getRoleVisibility` ist ein
 * indizierter Read, aber better-sqlite3 ist synchron und blockiert dabei die
 * Event-Loop für alle anderen.
 */
export function visibleAreas(role: unknown): Record<NavArea, boolean> {
  const visibility = getRoleVisibility();
  return Object.fromEntries(
    NAV_AREAS.map((area) => [area, roleSeesArea(visibility, role, area)]),
  ) as Record<NavArea, boolean>;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
