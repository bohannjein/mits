import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AGENT_HOME, homeFor } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Anmelden — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Die Anmeldung des Personals.

   Dieselbe Auth wie unter `/login`: ein Cookie, eine Better-Auth-Instanz, eine
   `user`-Tabelle. Was sich unterscheidet, ist der Einstieg — die Maske nennt den
   Arbeitsbereich, führt nicht zur Registrierung und landet standardmäßig in der
   Queue statt im Portal.

   **Kein `requireRole` auf dieser Seite**, und deshalb steht sie in
   `PUBLIC_PATHS` (`lib/auth/roles.ts`): sie liegt unter `/mits`, und ohne den
   Ausschluss würde der Guard die Anmeldemaske selbst auf die Anmeldemaske
   umleiten. Es gibt kein `/mits`-Layout, das hier zusätzlich prüfen würde —
   jede Seite dort guardet sich selbst.

   **Sie sagt nicht, wer Personal ist.** Ein Melder, der die Adresse kennt und
   sein richtiges Passwort tippt, meldet sich hier an und landet in `/customer`;
   ein falsches Passwort gibt denselben Satz wie überall. Jede andere Aufteilung
   — eine eigene Fehlermeldung für „richtige Zugangsdaten, falsche Rolle" — wäre
   ein Orakel, mit dem sich Adressen nach Rolle durchprobieren lassen.
   ────────────────────────────────────────────────────────────────────────── */

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  const signedIn = await getSessionUser();
  // Wer schon angemeldet ist, geht dorthin, wo seine Rolle hingehört — nicht
  // stur nach /mits, wo ein Melder nur wieder herausgeworfen würde.
  if (signedIn) redirect(safeNext(next) ?? homeFor(signedIn.role));

  return (
    <AuthShell>
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
        <CardHeader>
          <CardTitle className="text-lg font-medium">
            Anmeldung für Mitarbeitende
          </CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Zugang zu Queue, Bestand und Administration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            next={safeNext(next) ?? AGENT_HOME}
            sessionLifetimeDays={getAuthSettings().sessionLifetimeDays}
            showRegisterLink={false}
          />
        </CardContent>
      </Card>
    </AuthShell>
  );
}

/**
 * Only same-site paths are accepted as a post-login target. Without this an
 * attacker could send `?next=https://evil.example` and use the app as an open
 * redirect.
 *
 * Gibt `null` und nicht einen Default zurück, damit die beiden Aufrufstellen
 * oben ihr eigenes Ziel wählen können: die eine kennt die Rolle, die andere
 * nicht.
 */
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
