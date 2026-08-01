import type { Metadata } from "next";

import { MailSettingsForm } from "@/components/admin/mail-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { getMailSettings } from "@/lib/mail-settings";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Mail & Automation — MITS",
};

export default async function AdminMailPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/mail");

  const settings = getMailSettings();
  const users = listUsers();
  const staff = users
    .filter((user) => canViewBoard(user.role))
    .map((user) => ({ id: user.id, name: user.name }));

  /*
   * The fallback account is also staff-only.
   *
   * A reporter account would work — `created_by` decides visibility and a reporter
   * can see their own tickets — and it would mean every mail from an unknown
   * address landed in one person's portal instead of the queue. Staff see the whole
   * queue anyway, which is where an inbound mail belongs.
   */
  const accounts = staff;

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

          {/* The two secrets never leave the server — only whether one exists. */}
          <MailSettingsForm
            settings={{
              ...settings,
              imapPassword: "",
              graphClientSecret: "",
            }}
            staff={staff}
            accounts={accounts}
            hasImapPassword={settings.imapPassword !== ""}
            hasGraphSecret={settings.graphClientSecret !== ""}
            inboundEnabled={getFeatureFlags().feature_mail_inbound}
          />
        </div>
      </main>
    </>
  );
}
