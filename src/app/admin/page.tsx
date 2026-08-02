import type { Metadata } from "next";

import { RegistrationSettingsForm } from "@/components/admin/registration-settings-form";
import { SettingsSearch } from "@/components/admin/settings-search";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { ensureAuthSchema } from "@/lib/auth/server";
import { getAuthSettings } from "@/lib/settings";
import { countTickets } from "@/lib/tickets";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Admin-Desk — MITS",
};

export default async function AdminPage() {
  // Authoritative gate: admin only.
  const actor = await requireRole("admin", "/admin");
  await ensureAuthSchema();

  const users = listUsers();
  const settings = getAuthSettings();
  const staff = users.filter((user) => canViewBoard(user.role)).length;
  const { total, open } = countTickets();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-5xl">
          <BackLink href="/mits" label="Zurück zur Queue" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">Admin-Desk</h1>
              <p className="mt-2 text-muted-foreground">
                Registrierung, Module und Bestand dieser Instanz. Konten werden
                getrennt gepflegt — Agenten und Anwender in eigenen Masken.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {users.length} Konten · {staff} Agenten
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {total} Tickets · {open} offen
              </Badge>
            </div>
          </div>

          {/*
            The destinations used to sit as a wrapping row of pills beside the
            heading — twenty of them, in no order anyone could name. They are
            the same links, behind a field that also matches on what is inside
            each page.
          */}
          <div className="mt-8">
            <SettingsSearch />
          </div>

          <Separator className="my-8 bg-border" />

          {/* Anchor target of the "Registrierung" entry in the search index. */}
          <div id="registrierung" className="scroll-mt-24">
            <RegistrationSettingsForm settings={settings} />
          </div>
        </div>
      </main>
    </>
  );
}
