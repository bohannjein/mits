import type { MITSRole } from "@/lib/auth/roles";

/* ──────────────────────────────────────────────────────────────────────────
   Das Fenster, in dem der Server ein Konto selbst anlegt.

   Eigenes Modul und absichtlich fast import-frei: `auth/server.ts` liest es aus
   dem User-Create-Hook heraus, während `auth/seed-admin.ts` und
   `auth/create-account.ts` es setzen — ein Import in die andere Richtung wäre
   ein Zyklus. Der Typ-Import auf `roles.ts` ist keiner: die Datei importiert
   selbst nichts, und ein `import type` verschwindet beim Übersetzen.

   Der Zustand ist eine Adresse mit einer Rolle, kein Schalter. Ein bloßes
   „Registrierungspolicy überspringen" würde ein Fenster öffnen, in dem *jede*
   gleichzeitige Registrierung durchkommt — mit der eingestellten Rolle sogar
   als Administrator. Auf eine Adresse eingegrenzt kann der Hook nur für genau
   das Konto gelockert werden, das gerade entsteht.

   Eine Map und keine einzelne Variable, weil zwei Admins gleichzeitig ein Konto
   anlegen können: eine gemeinsame Variable würde das `finally` des ersten
   Aufrufs auf den noch laufenden zweiten anwenden, und dessen Konto entstünde
   dann als Benutzer — oder würde von der Registrierungspolicy abgelehnt.
   ────────────────────────────────────────────────────────────────────────── */

const provisioning = new Map<string, MITSRole>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Die Rolle, die eine gerade laufende serverseitige Anlage für diese Adresse
 * beansprucht — oder `null`. Adressen werden kleingeschrieben verglichen, weil
 * Better Auth sie speichert, wie sie eingegeben wurde.
 */
export function provisionedRole(email: string): MITSRole | null {
  return provisioning.get(key(email)) ?? null;
}

/** `create` innerhalb des Fensters für genau eine Adresse ausführen. */
export async function withProvisionedRole<T>(
  email: string,
  role: MITSRole,
  create: () => Promise<T>,
): Promise<T> {
  const id = key(email);
  provisioning.set(id, role);
  try {
    return await create();
  } finally {
    provisioning.delete(id);
  }
}
