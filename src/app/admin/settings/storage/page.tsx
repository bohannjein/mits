import type { Metadata } from "next";
import Link from "next/link";
import { PowerOffIcon } from "lucide-react";

import { StorageSettingsForm } from "@/components/admin/storage-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { activeBackend, getS3Settings } from "@/lib/services/storage";
import { STORAGE_BACKEND_LABELS } from "@/types/mits";

export const metadata: Metadata = {
  title: "Dateispeicher — MITS",
};

export default async function StorageSettingsPage() {
  // Authoritative gate: admin only. The credentials on this page can read every
  // attachment the instance has ever stored.
  await requireRole("admin", "/admin/settings/storage");

  const flags = getFeatureFlags();
  const settings = getS3Settings();
  const backend = activeBackend(flags.feature_s3_storage);

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Dateispeicher
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Wohin neue Anhänge geschrieben werden: in das Datenverzeichnis oder
              in einen S3-Bucket.
            </p>
          </div>

          <Separator className="my-8 bg-border" />

          {/* Editable while the module is off — configuring first, testing, and
              switching on afterwards is the order that avoids a window in which
              uploads go somewhere nobody has verified. */}
          {!flags.feature_s3_storage && (
            <Alert
              variant="destructive"
              className="mb-6 rounded-2xl border-destructive px-4 py-3"
            >
              <PowerOffIcon strokeWidth={1.5} />
              <AlertTitle>Modul abgeschaltet</AlertTitle>
              <AlertDescription>
                Unter <Link href="/admin/settings/features">Module</Link> ist
                „S3-Objektspeicher“ aus. Der Zugang lässt sich einrichten und
                testen; geschrieben wird bis dahin ins Datenverzeichnis.
              </AlertDescription>
            </Alert>
          )}

          <StorageSettingsForm
            settings={{ ...settings, secretAccessKey: "" }}
            hasSecret={settings.secretAccessKey !== ""}
            activeBackendLabel={STORAGE_BACKEND_LABELS[backend]}
          />
        </div>
      </main>
    </>
  );
}
