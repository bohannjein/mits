import Link from "next/link";
import { LogInIcon, UserPlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { MITSLogo } from "@/components/branding/mits-logo";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { FaqAccordion } from "@/components/dashboard/faq-accordion";
import { MaintenanceNotice } from "@/components/dashboard/maintenance-notice";
import { OpenTicketsPanel } from "@/components/dashboard/open-tickets-panel";
import { PortalActions } from "@/components/dashboard/portal-actions";
import { ResourceGrid } from "@/components/dashboard/resource-grid";
import { ServiceStatus } from "@/components/dashboard/service-status";
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
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import {
  getActiveAnnouncements,
  getActiveMaintenanceNotices,
  getPortalConfig,
  getPortalContent,
  getPortalFaqs,
  getPortalServices,
} from "@/lib/portal";
import { listOwnTickets } from "@/lib/tickets";
import { fillPortalText, type PortalConfig, type PortalWidgetKey } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The portal, assembled from configuration.

   Nothing about the signed-in layout is decided here: `portal_config` says which
   widgets exist, in which order, and under which heading. Adapting an instance
   is an admin task in /admin/portal, not a commit.

   A widget with nothing to show renders null rather than an empty card — the
   contract every dashboard component in this folder already follows.
   ────────────────────────────────────────────────────────────────────────── */

export default async function Home() {
  // Belt and braces alongside `instrumentation.ts`: a deployment adapter that
  // never calls `register` would otherwise leave an instance with no admin. The
  // call is memoised, so on every later request this is a resolved promise.
  await ensureDefaultAdmin().catch(() => {
    // Already logged by the seeder. The portal renders either way.
  });

  const user = await getSessionUser();
  const config = getPortalConfig();

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-12">
        <div className="grid w-full max-w-4xl gap-8">
          {user ? (
            <SignedIn user={user} config={config} />
          ) : (
            <SignedOut config={config} />
          )}
        </div>
      </main>
    </>
  );
}

function SignedIn({
  user,
  config,
}: {
  user: SessionUser;
  config: PortalConfig;
}) {
  // Just the given name: "Hallo Jana" reads like a colleague, the full address
  // like a mail merge.
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const titles = config.widget_titles;

  // Every widget is built up front and the order decides what gets rendered.
  // Cheap: each source is one indexed SQLite read, and an unused entry is a
  // discarded element rather than a query.
  const widgets: Record<PortalWidgetKey, ReactNode> = {
    outages: (
      <AnnouncementBanner
        title={titles.outages}
        announcements={getActiveAnnouncements()}
      />
    ),
    maintenance: (
      <MaintenanceNotice
        title={titles.maintenance}
        notices={getActiveMaintenanceNotices()}
      />
    ),
    status: (
      <ServiceStatus title={titles.status} services={getPortalServices()} />
    ),
    active_tickets: (
      <OpenTicketsPanel
        title={titles.active_tickets}
        initialTickets={listOwnTickets(user.id)}
      />
    ),
    faq: <FaqAccordion title={titles.faq} faqs={getPortalFaqs()} />,
    downloads: (
      <ResourceGrid
        title={titles.downloads}
        resources={getPortalContent().resources}
      />
    ),
  };

  return (
    <>
      <section>
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
          {fillPortalText(config.hero_title, firstName)}
        </h1>
        {config.hero_subtitle.trim() && (
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
            {fillPortalText(config.hero_subtitle, firstName)}
          </p>
        )}
      </section>

      {/* The ticket entry stays above the configurable widgets: it is what the
          portal is for, and burying it behind a toggle would let an admin lock
          everyone out of the intake by accident. */}
      <PortalActions label={config.ticket_button_label} />

      {config.widget_order
        .filter((key) => config.enabled_widgets[key])
        .map((key) => (
          <div key={key}>{widgets[key]}</div>
        ))}
    </>
  );
}

function SignedOut({ config }: { config: PortalConfig }) {
  // No name to fill in yet, so the placeholder resolves to nothing rather than
  // rendering a literal "{name}" at an anonymous visitor.
  const heroTitle = fillPortalText(config.hero_title, "").trim();
  const heroSubtitle = fillPortalText(config.hero_subtitle, "").trim();

  return (
    <>
      {/* Announcements come first for anonymous visitors too: a known outage
          should be read before someone tries to sign in during it. */}
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
    </>
  );
}
