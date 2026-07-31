import type { Metadata } from "next";

import { MailSettingsForm } from "@/components/admin/mail-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getMailSettings } from "@/lib/mail-settings";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Mail & Automation — MITS",
};

export default async function AdminMailPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/mail");

  const settings = getMailSettings();
  const staff = listUsers()
    .filter((user) => canViewBoard(user.role))
    .map((user) => ({ id: user.id, name: user.name }));

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Mail &amp; Automation
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Erkennung eingehender Microsoft-Defender-Alerts und was MITS daraus
                macht.
              </p>
            </div>
            <Badge
              variant="outline"
              className="h-auto rounded-full px-3 py-1 font-normal"
            >
              {settings.defenderRuleEnabled ? "Regel aktiv" : "Regel aus"}
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

          <MailSettingsForm settings={settings} staff={staff} />
        </div>
      </main>
    </>
  );
}
