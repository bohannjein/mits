import type { Metadata } from "next";
import { InfoIcon } from "lucide-react";

import { NotificationSettingsForm } from "@/components/admin/notification-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { getAISettings } from "@/lib/ai-settings";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { getNotificationSettings } from "@/lib/notification-settings";
import { isAIFeatureOn } from "@/types/mits";

export const metadata: Metadata = {
  title: "Benachrichtigungen — MITS",
};

export default async function NotificationSettingsPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/settings/notifications");

  const flags = getFeatureFlags();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Benachrichtigungen
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Welche Ereignisse eingeblendet werden, wie sie aussehen und ab wann
              daraus eine Sammelmeldung wird.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {/*
            The one thing that surprises people: this page shapes the
            notifications, it does not switch them on. Two places that can make
            them disappear is one too many to look in when they are missing.
          */}
          {!flags.feature_toast_notifications && (
            <Alert className="mb-6 rounded-2xl border-border px-4 py-3">
              <InfoIcon strokeWidth={1.5} />
              <AlertTitle>Das Modul ist aus</AlertTitle>
              <AlertDescription>
                Unter „Module“ ist <code>Live-Benachrichtigungen</code>{" "}
                ausgeschaltet, es wird also nichts eingeblendet. Die Einstellungen
                hier lassen sich trotzdem vorbereiten.
              </AlertDescription>
            </Alert>
          )}

          <NotificationSettingsForm
            settings={getNotificationSettings()}
            digestUsesModel={isAIFeatureOn(getAISettings(), "digest")}
            watchersOn={flags.feature_ticket_watchers}
          />
        </div>
      </main>
    </>
  );
}
