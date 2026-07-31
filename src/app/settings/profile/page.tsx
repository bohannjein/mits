import type { Metadata } from "next";
import {
  KeyRoundIcon,
  MapPinIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  UserIcon,
} from "lucide-react";

import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { ContactDetailsForm } from "@/components/auth/contact-details-form";
import { ProfileForm } from "@/components/auth/profile-form";
import { RefreshPreferenceForm } from "@/components/auth/refresh-preference-form";
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
import { requireUserForPasswordChange } from "@/lib/auth/session";
import { listActiveLocations } from "@/lib/locations";
import {
  getSystemSettings,
  getUserRefreshMinutes,
} from "@/lib/system-settings";
import { getUserProfile } from "@/lib/user-profile";

export const metadata: Metadata = {
  title: "Profil — MITS",
};

/**
 * Own profile and password.
 *
 * The one page that uses `requireUserForPasswordChange` instead of `requireUser`:
 * an account with `must_change_password` is redirected here by every other
 * guard, so this page must be reachable while the gate is closed — otherwise the
 * redirect would loop.
 */
export default async function ProfilePage() {
  const user = await requireUserForPasswordChange();

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Hidden while the password gate is closed: `requireUser` sends every
              other page straight back here, so the link would bounce. A visible
              link that runs into a redirect is worse than no link. */}
          {!user.mustChangePassword && (
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

          {/* Not while the gate is closed: a gated session may change its password
              and nothing else, so a name field there would only be refused by
              `changeOwnName`. */}
          {!user.mustChangePassword && (
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

          {!user.mustChangePassword && (
            <Card className="mb-6 rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                  <MapPinIcon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <CardTitle className="mt-4 text-lg font-medium">
                  Standort und Kontakt
                </CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Sichtbar für die Technik, die Ihr Ticket bearbeitet.
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

          {/* Staff only. A reporter follows the instance-wide interval the admin
              set — see `resolveRefreshMinutes`. The action refuses one too, since
              hiding a card is not a check. */}
          {!user.mustChangePassword && canViewBoard(user.role) && (
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
