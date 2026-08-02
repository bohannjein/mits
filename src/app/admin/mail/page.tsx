import { MailWarningIcon } from "lucide-react";
import type { Metadata } from "next";

import { MailSettingsForm } from "@/components/admin/mail-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { getMailSettings, inboundAddress } from "@/lib/mail-settings";
import { sameMailbox } from "@/lib/mail/inbound-parse";
import { getEffectiveSmtpSettings } from "@/lib/smtp";
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

  /*
   * Where a reply would go, and where MITS looks for it.
   *
   * Only worth saying while the ingest is on: with the module off nothing is
   * fetched at all, and a hint about the return path would describe something that
   * does not run.
   */
  const inboundEnabled = getFeatureFlags().feature_mail_inbound;
  const smtp = getEffectiveSmtpSettings();
  const inbound = inboundAddress(settings);
  const mismatch =
    inboundEnabled &&
    smtp.from.trim() !== "" &&
    inbound !== "" &&
    !sameMailbox(inbound, smtp.from);

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

          {/*
            Two different addresses are a legitimate setup, and also the quiet way
            the return path breaks: without the header below, an answer goes to the
            sending box and nothing fetches that one. Shown rather than silently
            handled, because a client that drops `Reply-To` puts the mail exactly
            where nobody looks.
          */}
          {mismatch && (
            <Alert className="mb-6 rounded-2xl border-border">
              <MailWarningIcon strokeWidth={1.5} />
              <AlertDescription className="text-xs">
                Gesendet wird als <strong>{smtp.from}</strong>, abgerufen wird{" "}
                <strong>{inbound}</strong>. Antworten werden auf das abgerufene
                Postfach gelenkt; ein Mail-Programm, das das ignoriert, antwortet an
                die Absenderadresse.
              </AlertDescription>
            </Alert>
          )}

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
            inboundEnabled={inboundEnabled}
          />
        </div>
      </main>
    </>
  );
}
