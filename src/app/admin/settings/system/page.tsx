import type { Metadata } from "next";

import { SystemSettingsForm } from "@/components/admin/system-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { timezoneOffsetLabel } from "@/lib/format";
import { getSystemSettings } from "@/lib/system-settings";

export const metadata: Metadata = {
  title: "System — MITS",
};

export default async function AdminSystemPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/settings/system");

  const settings = getSystemSettings();

  /*
   * `now` is stamped on the server and passed down as a string.
   *
   * The form needs a moment to render its preview against. Taking it in the client
   * would make the first paint differ from the server render — a hydration mismatch
   * on a page whose entire subject is telling the time correctly.
   */
  const now = new Date().toISOString();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                System
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Zeitzone für alle Zeitstempel und der Zeitserver, gegen den die
                Systemuhr geprüft wird.
              </p>
            </div>
            <Badge
              variant="outline"
              className="h-auto rounded-full px-3 py-1 font-mono text-xs font-normal"
            >
              {settings.timezone} · {timezoneOffsetLabel(settings.timezone, new Date())}
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

          <SystemSettingsForm settings={settings} now={now} />
        </div>
      </main>
    </>
  );
}
