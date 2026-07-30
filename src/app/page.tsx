import Link from "next/link";
import { LogInIcon, UserPlusIcon } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { MITSLogo } from "@/components/branding/mits-logo";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { OpenTicketsPanel } from "@/components/dashboard/open-tickets-panel";
import { PortalActions } from "@/components/dashboard/portal-actions";
import { ResourceGrid } from "@/components/dashboard/resource-grid";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ensureDefaultAdmin } from "@/lib/auth/seed-admin";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveAnnouncements, getPortalContent } from "@/lib/portal";
import { listOwnTickets } from "@/lib/tickets";
import type { SessionUser } from "@/lib/auth/session";

/* ──────────────────────────────────────────────────────────────────────────
   The portal.

   Signed in it is a work surface, not a landing page: greeting, the two things
   people actually came to do, their open tickets, then announcements and quick
   links. Signed out it is the login form — MITS has no anonymous intake, so any
   other entry point would only lead back here.
   ────────────────────────────────────────────────────────────────────────── */

export default async function Home() {
  // Belt and braces alongside `instrumentation.ts`: a deployment adapter that
  // never calls `register` would otherwise leave an instance with no admin. The
  // call is memoised, so on every later request this is a resolved promise.
  await ensureDefaultAdmin().catch(() => {
    // Already logged by the seeder. The portal renders either way.
  });

  const user = await getSessionUser();
  const announcements = getActiveAnnouncements();
  const { resources } = getPortalContent();

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-12">
        <div className="grid w-full max-w-4xl gap-8">
          {/* Announcements stay first in both states: a known outage should be
              read before someone reports it — or tries to sign in during it. */}
          <AnnouncementBanner announcements={announcements} />

          {user ? (
            <SignedIn user={user} resources={resources} />
          ) : (
            <SignedOut />
          )}
        </div>
      </main>
    </>
  );
}

function SignedIn({
  user,
  resources,
}: {
  user: SessionUser;
  resources: ReturnType<typeof getPortalContent>["resources"];
}) {
  // Server-rendered so the panel has rows on first paint; the client keeps it
  // current from there.
  const tickets = listOwnTickets(user.id);
  // Just the given name: "Hallo Jana" reads like a colleague, the full address
  // like a mail merge.
  const greetingName = user.name.split(/\s+/)[0] || user.name;

  return (
    <>
      <section>
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
          Hallo {greetingName} —{" "}
          <span className="text-gemini font-medium">
            wie können wir heute helfen?
          </span>
        </h1>
      </section>

      <PortalActions />

      <OpenTicketsPanel initialTickets={tickets} />

      <ResourceGrid resources={resources} />
    </>
  );
}

function SignedOut() {
  return (
    <div className="grid gap-6 py-4 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-10">
      <div>
        <MITSLogo showTagline />
        <Separator className="my-6 bg-border" />
        <h1 className="max-w-md text-2xl font-normal tracking-tight sm:text-3xl">
          IT-Service-Portal
        </h1>
        <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
          Anmelden, um eine Störung zu melden, den Service-Katalog zu öffnen oder
          den Stand eigener Tickets zu sehen.
        </p>

        {/* Ticket intake needs an account: `created_by` comes from the session,
            and there is no anonymous path to fake it with. Registration is the
            honest second option here. */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            asChild
            className="h-10 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
          >
            <Link href="/register">
              <UserPlusIcon strokeWidth={1.5} />
              Konto anlegen
            </Link>
          </Button>
        </div>
      </div>

      <Card className="w-full rounded-3xl border border-border bg-card ring-0 shadow-elev-2 sm:w-96">
        <CardHeader>
          <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
            <LogInIcon className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <CardTitle className="mt-4 text-lg font-medium">Anmelden</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Mit dem MITS-Konto anmelden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next="/" />
        </CardContent>
      </Card>
    </div>
  );
}
