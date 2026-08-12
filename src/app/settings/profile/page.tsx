import type { Metadata } from "next";
import {
  KeyRoundIcon,
  MapPinIcon,
  PaletteIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react";

import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { ContactDetailsForm } from "@/components/auth/contact-details-form";
import { ProfileForm } from "@/components/auth/profile-form";
import { RefreshPreferenceForm } from "@/components/auth/refresh-preference-form";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { ThemeToggle } from "@/components/branding/theme-toggle";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABELS, canViewBoard, homeFor } from "@/lib/auth/roles";
import { requireUserForAccountSetup } from "@/lib/auth/session";
import { twoFactorRequiredFor } from "@/lib/auth/two-factor";
import { listActiveLocations } from "@/lib/locations";
import { hasTwoFactor } from "@/lib/users";
import {
  getSystemSettings,
  getUserRefreshMinutes,
} from "@/lib/system-settings";
import { getUserProfile } from "@/lib/user-profile";

export const metadata: Metadata = {
  title: "Profil — MITS",
};

/**
 * Own profile, password and second factor.
 *
 * The one page that uses `requireUserForAccountSetup` instead of `requireUser`:
 * an account with `must_change_password` — or one whose role now requires a
 * second factor it has not set up — is redirected here by every other guard, so
 * this page must be reachable while a gate is closed, otherwise the redirect
 * would loop.
 */
export default async function ProfilePage() {
  const user = await requireUserForAccountSetup();

  const twoFactorEnabled = hasTwoFactor(user.id);
  const twoFactorRequired = twoFactorRequiredFor(user.role);

  /*
   * Ein geschlossenes Gate — egal welches — heißt: dieses Konto darf hier nur das
   * Gate auflösen. Die übrigen Karten verschwinden dann nicht aus Kosmetik,
   * sondern weil ihre Server Actions durch `requireUser` laufen und ein Speichern
   * von dort umgehend hierher zurückgeleitet würde.
   */
  const gated =
    user.mustChangePassword || (twoFactorRequired && !twoFactorEnabled);

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Hidden while a gate is closed: `requireUser` sends every other page
              straight back here, so the link would bounce. A visible link that
              runs into a redirect is worse than no link. */}
          {!gated && (
            <BackLink href={homeFor(user.role)} label="Zurück zur Startseite" />
          )}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Einstellungen
              </h1>
              <p className="mt-2 text-muted-foreground">
                {user.email} ·{" "}
                <Badge
                  variant="outline"
                  className="h-auto rounded-full px-2.5 py-0.5 align-middle font-normal"
                >
                  {ROLE_LABELS[user.role]}
                </Badge>
              </p>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {user.mustChangePassword && (
            <Alert
              variant="destructive"
              className="mb-6 rounded-2xl border-destructive px-4 py-3"
            >
              <ShieldAlertIcon strokeWidth={1.5} />
              <AlertTitle>Passwort muss geändert werden</AlertTitle>
              <AlertDescription>
                Dieses Konto wurde automatisch angelegt und benutzt noch das
                dokumentierte Standardpasswort — das ist öffentlich bekannt.
                Bis ein neues Passwort gesetzt ist, kann das Konto nichts
                anderes tun: keine Tickets, kein Board, keine Administration.
              </AlertDescription>
            </Alert>
          )}

          {/* Not while a gate is closed: a gated session may resolve the gate and
              nothing else, so a name field there would only be refused by
              `changeOwnName`. */}
          {!gated && (
            <Card className="mb-6 rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                  <UserIcon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <CardTitle className="mt-4 text-lg font-medium">
                  Meine Daten
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProfileForm name={user.name} email={user.email} />
              </CardContent>
            </Card>
          )}

          {!gated && (
            <Card className="mb-6 rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                  <MapPinIcon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <CardTitle className="mt-4 text-lg font-medium">
                  Standort und Kontakt
                </CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Sichtbar für den Agenten, der Ihr Ticket bearbeitet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContactDetailsForm
                  profile={getUserProfile(user.id)}
                  locations={listActiveLocations()}
                />
              </CardContent>
            </Card>
          )}

          {/*
            Shown even while the password gate is closed, unlike every other card
            here. The gate exists to stop a default-password account from *doing*
            anything; the theme is stored in this browser and touches no data, and
            the forced password form is the one screen the account cannot leave —
            so being unable to read it is the worst possible place to be stuck.
          */}
          <Card className="mb-6 rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
            <CardHeader>
              <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                <PaletteIcon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <CardTitle className="mt-4 text-lg font-medium">
                Erscheinungsbild
              </CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                Gilt in diesem Browser, nicht für das Konto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeToggle variant="segmented" />
            </CardContent>
          </Card>

          {/* Staff only. A reporter follows the instance-wide interval the admin
              set — see `resolveRefreshMinutes`. The action refuses one too, since
              hiding a card is not a check. */}
          {!gated && canViewBoard(user.role) && (
            <Card className="mb-6 rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                  <RefreshCwIcon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <CardTitle className="mt-4 text-lg font-medium">
                  Automatische Aktualisierung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RefreshPreferenceForm
                  own={getUserRefreshMinutes(user.id)}
                  global={getSystemSettings().refreshMinutes}
                />
              </CardContent>
            </Card>
          )}

          {/*
            Erst das Passwort, dann der zweite Faktor — dieselbe Reihenfolge wie
            im Guard. Ein zweiter Faktor auf einem Konto, dessen erstes Passwort
            in diesem Repository steht, sichert die falsche Hälfte.
          */}
          {!user.mustChangePassword && (
            <Card
              className={`mb-6 rounded-3xl border border-border bg-card ring-0 ${
                twoFactorRequired && !twoFactorEnabled
                  ? "shadow-elev-2"
                  : "shadow-elev-1"
              }`}
            >
              <CardHeader>
                <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                  <ShieldCheckIcon
                    className="size-5"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </span>
                <CardTitle className="mt-4 text-lg font-medium">
                  Zwei-Faktor-Anmeldung
                </CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Ein Code aus einer Authenticator-App, zusätzlich zum Passwort.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TwoFactorForm
                  enabled={twoFactorEnabled}
                  required={twoFactorRequired}
                />
              </CardContent>
            </Card>
          )}

          <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
            <CardHeader>
              <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                <KeyRoundIcon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <CardTitle className="mt-4 text-lg font-medium">
                Passwort ändern
              </CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                Andere Sitzungen dieses Kontos werden dabei beendet — wer sich
                mit dem alten Passwort angemeldet hat, ist danach ausgeloggt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordChangeForm forced={user.mustChangePassword} />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
