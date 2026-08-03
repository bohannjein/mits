import type { Metadata } from "next";

import { ApiKeysForm, type ApiKeyView } from "@/components/admin/api-keys-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Separator } from "@/components/ui/separator";
import { listApiKeys } from "@/lib/api-keys";
import { requireRole } from "@/lib/auth/session";
import { formatDateTimeShort } from "@/lib/format";
import { getSystemSettings } from "@/lib/system-settings";

export const metadata: Metadata = {
  title: "API-Keys — MITS",
};

export default async function ApiKeysPage() {
  // Authoritative gate: admin only. A key made here opens the ticket and
  // inventory endpoints to whoever holds it.
  await requireRole("admin", "/admin/settings/api-keys");

  const { timezone } = getSystemSettings();
  const keys: ApiKeyView[] = listApiKeys().map((key) => ({
    ...key,
    createdLabel: formatDateTimeShort(new Date(key.created_at), timezone),
    usedLabel: key.last_used_at
      ? formatDateTimeShort(new Date(key.last_used_at), timezone)
      : "nie",
  }));

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              API-Keys
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Zugänge für Systeme ohne Anmeldung — Monitoring, Inventarskripte,
              Automatisierung.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          <ApiKeysForm keys={keys} />
        </div>
      </main>
    </>
  );
}
