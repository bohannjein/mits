import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpenIcon,
  HeadsetIcon,
  ClockIcon,
  ShieldAlertIcon,
  UsersIcon,
  BrainIcon,
  MailIcon,
  MessageSquareTextIcon,
  MapPinIcon,
  MegaphoneIcon,
  ToggleRightIcon,
  WandSparklesIcon,
} from "lucide-react";

import { RegistrationSettingsForm } from "@/components/admin/registration-settings-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
                getrennt gepflegt — Technik und Anwender in eigenen Masken.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {users.length} Konten · {staff} Technik
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {total} Tickets · {open} offen
              </Badge>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/settings/features">
                  <ToggleRightIcon strokeWidth={1.5} />
                  Module
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/locations">
                  <MapPinIcon strokeWidth={1.5} />
                  Standorte
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/canned-responses">
                  <MessageSquareTextIcon strokeWidth={1.5} />
                  Textbausteine
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/settings/email">
                  <MailIcon strokeWidth={1.5} />
                  E-Mail
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/settings/ai">
                  <BrainIcon />
                  KI-Einstellungen
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/portal">
                  <MegaphoneIcon />
                  Portal-Inhalte
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/mail">
                  <ShieldAlertIcon />
                  Mail &amp; Automation
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/staff">
                  <HeadsetIcon />
                  Technik &amp; Administration
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/customers">
                  <UsersIcon />
                  Anwender
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/settings/system">
                  <ClockIcon />
                  System & Zeit
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/faq">
                  <BookOpenIcon />
                  Selbsthilfe / FAQ
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin/forms/builder">
                  <WandSparklesIcon />
                  Formular-Builder
                </Link>
              </Button>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <RegistrationSettingsForm settings={settings} />

        </div>
      </main>
    </>
  );
}
