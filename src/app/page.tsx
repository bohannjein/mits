import { MITSLogo } from "@/components/branding/mits-logo";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { IntakeModes } from "@/components/dashboard/intake-modes";
import { ResourceGrid } from "@/components/dashboard/resource-grid";
import { AppHeader } from "@/components/layout/app-header";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveAnnouncements, getPortalContent } from "@/lib/portal";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default async function Home() {
  const user = await getSessionUser();
  const announcements = getActiveAnnouncements();
  const { resources } = getPortalContent();

  return (
    <>
      <AppHeader />
      {/* Soft radial wash instead of a blueprint raster: the Google surfaces
          get their depth from light, not from lines. */}
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-16">
        <div className="grid w-full max-w-5xl gap-10">
          {/* Announcements come first: a known outage should be read before
              someone files a ticket about it. */}
          <AnnouncementBanner announcements={announcements} />

          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <MITSLogo showTagline />
              <Badge
                variant="outline"
                className="h-auto rounded-full border-border px-3 py-1 font-normal text-muted-foreground"
              >
                {user
                  ? `angemeldet · ${ROLE_LABELS[user.role]}`
                  : "nicht angemeldet"}
              </Badge>
            </div>

            <Separator className="my-10 bg-border" />

            <IntakeModes
              href={user ? "/tickets/new" : "/login?next=%2Ftickets%2Fnew"}
            />
          </div>

          <ResourceGrid resources={resources} />
        </div>
      </main>
    </>
  );
}
