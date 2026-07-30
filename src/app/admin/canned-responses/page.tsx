import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, PowerOffIcon } from "lucide-react";

import { CannedResponsesForm } from "@/components/admin/canned-responses-form";
import { AppHeader } from "@/components/layout/app-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { listCannedResponses } from "@/lib/canned-responses";
import { getFeatureFlags } from "@/lib/features";

export const metadata: Metadata = {
  title: "Textbausteine — MITS",
};

export default async function CannedResponsesPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/canned-responses");

  const flags = getFeatureFlags();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Textbausteine
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Schnellantworten für häufige Fälle, einsetzbar im Antwortfeld.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              <Link href="/admin">
                <ArrowLeftIcon strokeWidth={1.5} />
                Admin-Desk
              </Link>
            </Button>
          </div>

          <Separator className="my-8 bg-border" />

          {/* Editable while the module is off — configuring first and switching on
              later is the normal order. */}
          {!flags.feature_canned_responses && (
            <Alert
              variant="destructive"
              className="mb-6 rounded-2xl border-destructive px-4 py-3"
            >
              <PowerOffIcon strokeWidth={1.5} />
              <AlertTitle>Modul abgeschaltet</AlertTitle>
              <AlertDescription>
                Unter <Link href="/admin/settings/features">Module</Link> ist
                „Textbausteine“ aus. Die Liste lässt sich pflegen, im Ticket
                erscheinen aber keine Schaltflächen.
              </AlertDescription>
            </Alert>
          )}

          <CannedResponsesForm responses={listCannedResponses()} />
        </div>
      </main>
    </>
  );
}
