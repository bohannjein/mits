import "server-only";

import { withProvisionedRole } from "@/lib/auth/bootstrap";
import type { MITSRole } from "@/lib/auth/roles";
import { ensureAuthSchema, getAuth } from "@/lib/auth/server";
import { db } from "@/lib/db/sqlite";
import type { ManagedUser } from "@/lib/users";

/* ──────────────────────────────────────────────────────────────────────────
   Ein Konto, von einem Administrator angelegt.

   Bis hierher entstand ein Konto ausschließlich über `/register`, und das
   Ergebnis war immer `DEFAULT_ROLE`. Ein Agent war damit nur über zwei Schritte
   erreichbar — die Person registriert sich selbst, danach hebt ein Admin die
   Rolle —, und auf einer Instanz mit abgeschalteter Selbstregistrierung gar
   nicht.

   Angelegt wird über denselben Weg wie beim Seeding und aus demselben Grund:
   `internalAdapter.createUser` plus `linkAccount` mit dem Provider
   `credential`. Der Umweg über `/sign-up/email` wäre ein HTTP-Request an die
   eigene Anwendung, würde den Aufrufer über `autoSignIn: true` als das neue
   Konto anmelden — also den Administrator aus seiner eigenen Sitzung werfen —
   und hätte keine Möglichkeit, die Rolle zu setzen (`input: false`).

   Die Rolle reist deshalb durch das Fenster in `auth/bootstrap.ts`, das der
   User-Create-Hook liest. Dass das kein Loch ist, hängt an der Aufrufstelle:
   `createUserAccountAction` prüft `requireRole("admin")`, bevor sie hier
   ankommt.
   ────────────────────────────────────────────────────────────────────────── */

export class AccountCreateError extends Error {}

export interface NewAccount {
  name: string;
  email: string;
  password: string;
  role: MITSRole;
  /**
   * Sperrt das Konto bis zum ersten Passwortwechsel auf `/settings/profile` —
   * dasselbe Gate wie beim geseedeten Administrator. Gedacht für den Regelfall,
   * dass der Admin das Passwort tippt und mündlich weitergibt.
   */
  mustChangePassword: boolean;
}

/**
 * Grobe Prüfung: etwas, ein `@`, ein Label mit Punkt und TLD.
 *
 * Keine RFC-Validierung, und mehr wäre hier auch falsch — die Adresse ist die
 * Anmeldeidentität und lässt sich später nicht mehr ändern, aber ein
 * Regelwerk, das exotische gültige Adressen ablehnt, wäre schlimmer als eines,
 * das Tippfehler durchlässt.
 */
function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
    email,
  );
}

/** Ob diese Adresse schon vergeben ist. Verglichen wie Better Auth vergleicht. */
function emailTaken(email: string): boolean {
  const row = db
    .prepare("SELECT id FROM user WHERE email = ? COLLATE NOCASE")
    .get(email) as { id: string } | undefined;
  return row !== undefined;
}

export async function createAccount(input: NewAccount): Promise<ManagedUser> {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  const email = input.email.trim();

  if (name === "") {
    throw new AccountCreateError("Der Name darf nicht leer sein.");
  }
  if (!isPlausibleEmail(email)) {
    throw new AccountCreateError("Keine gültige E-Mail-Adresse.");
  }
  // Spiegelt `emailAndPassword.minPasswordLength`. Better Auth erzwingt die
  // Grenze nur auf seinen eigenen Endpunkten — dieser Pfad hasht selbst.
  if (input.password.length < 10) {
    throw new AccountCreateError("Das Passwort braucht mindestens 10 Zeichen.");
  }
  if (input.password.length > 256) {
    throw new AccountCreateError("Das Passwort ist zu lang.");
  }
  if (emailTaken(email)) {
    throw new AccountCreateError(
      `${email} hat schon ein Konto. Die Rolle lässt sich in der Liste ändern.`,
    );
  }

  // Der Seeder läuft beim Serverstart, dieser Pfad nicht unbedingt danach: eine
  // Instanz, die noch keine Anfrage gesehen hat, hat die Tabellen noch nicht.
  await ensureAuthSchema();

  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(input.password);

  try {
    const created = await withProvisionedRole(email, input.role, async () => {
      const user = await ctx.internalAdapter.createUser({
        email,
        name,
        // Es ist kein Mailversand für Verifikationen vorgesehen, ein
        // unverifiziertes Flag wäre also dauerhaft und ohne Bedeutung.
        emailVerified: true,
        role: input.role,
        mustChangePassword: input.mustChangePassword,
      });

      // `credential` ist der Provider, den die Anmeldung mit E-Mail und
      // Passwort nachschlägt; die Konto-Id ist dort die Benutzer-Id.
      await ctx.internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      });

      return user;
    });

    return {
      id: created.id,
      name,
      email,
      role: input.role,
      createdAt: String(created.createdAt),
    };
  } catch (error) {
    /*
     * Der Unique-Index auf der Adresse, falls zwei Anlagen sich überholt haben.
     * Nur dieser Fall wird übersetzt — jeder andere Fehler ist ein Defekt und
     * gehört mit Stack ins Log, nicht als freundlicher Satz in die Maske.
     */
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new AccountCreateError(`${email} hat schon ein Konto.`);
    }
    throw error;
  }
}
