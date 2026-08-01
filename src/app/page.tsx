import Link from "next/link";
import { redirect } from "next/navigation";
import { LogInIcon, UserPlusIcon } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { MITSLogo } from "@/components/branding/mits-logo";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
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
import { CUSTOMER_HOME } from "@/lib/auth/roles";
import { ensureDefaultAdmin } from "@/lib/auth/seed-admin";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveAnnouncements, getPortalConfig } from "@/lib/portal";
import { fillPortalText } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Public entry point.

   The service portal is the front door: signed in, this forwards to /customer for
   everyone, staff included. Somebody typing the bare host wants the portal, and a
   agent who wants the queue reaches it from the header — the logo and the user
   menu both still point at `homeFor(role)`, so daily work is one click, not two.

   Anonymous, it is the login mask. It stays a page rather than a redirect-only route
   because an anonymous visitor needs somewhere to land, and because a known outage
   should be readable before anyone tries to sign in during it.
   ────────────────────────────────────────────────────────────────────────── */

export default async function Home() {
  // Belt and braces alongside `instrumentation.ts`: a deployment adapter that
  // never calls `register` would otherwise leave an instance with no admin.
  await ensureDefaultAdmin().catch(() => {
    // Already logged by the seeder. The page renders either way.
  });

  const user = await getSessionUser();
  // The password gate is left to `requireUser` on the target page — forwarding a
  // gated account is harmless, it gets bounced to /settings/profile there.
  if (user) redirect(CUSTOMER_HOME);

  const config = getPortalConfig();
  // No name to fill in yet, so the placeholder resolves to nothing rather than
  // rendering a literal "{name}" at an anonymous visitor.
  const heroTitle = fillPortalText(config.hero_title, "").trim();
  const heroSubtitle = fillPortalText(config.hero_subtitle, "").trim();

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-12">
        <div className="grid w-full max-w-4xl gap-8">
          <AnnouncementBanner announcements={getActiveAnnouncements()} />

          <div className="grid gap-6 py-4 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-10">
            <div>
              <MITSLogo showTagline />
              <Separator className="my-6 bg-border" />
              <h1 className="max-w-md text-2xl font-normal tracking-tight sm:text-3xl">
                {heroTitle || "IT-Service-Portal"}
              </h1>
              {heroSubtitle && (
                <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
                  {heroSubtitle}
                </p>
              )}

              {/* Ticket intake needs an account: `created_by` comes from the
                  session, and there is no anonymous path to fake it with. */}
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
                {/* Empty `next` lets the form route by role after sign-in. */}
                <LoginForm next="" />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
