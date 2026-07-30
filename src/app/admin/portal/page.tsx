import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { PortalContentForm } from "@/components/admin/portal-content-form";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getPortalContent } from "@/lib/portal";

export const metadata: Metadata = {
  title: "Portal-Inhalte — MITS",
};

export default async function AdminPortalPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/portal");

  const content = getPortalContent();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold uppercase sm:text-3xl">
                Portal-Inhalte
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Störungsmeldungen und Schnellzugriffe für die Startseite.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-sm">
              <Link href="/admin">
                <ArrowLeftIcon />
                Admin-Desk
              </Link>
            </Button>
          </div>

          <Separator className="my-8 bg-border" />

          <PortalContentForm content={content} />
        </div>
      </main>
    </>
  );
}
