import type { Metadata } from "next";

import { SystemStatusList } from "@/components/admin/system-status-list";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { collectSystemStatus } from "@/lib/system-status";

export const metadata: Metadata = {
  title: "Systemzustand — MITS",
};

export default async function SystemStatusPage() {
  // Admin only. The rows name hosts, buckets and mailboxes — the configuration
  // of the instance, not something an agent needs on the way to a ticket.
  await requireRole("admin", "/admin/status");

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Systemzustand
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Was eingerichtet ist und was nicht. Jede Zeile führt dorthin, wo
              sie gepflegt wird.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          <SystemStatusList rows={collectSystemStatus()} />
        </div>
      </main>
    </>
  );
}
