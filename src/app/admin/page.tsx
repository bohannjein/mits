import type { Metadata } from "next";
import Link from "next/link";
import {
  BrainIcon,
  LayoutDashboardIcon,
  MailIcon,
  MessageSquareTextIcon,
  MapPinIcon,
  MegaphoneIcon,
  ToggleRightIcon,
  WandSparklesIcon,
} from "lucide-react";

import { RegistrationSettingsForm } from "@/components/admin/registration-settings-form";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { ensureAuthSchema } from "@/lib/auth/server";
import { getAuthSettings } from "@/lib/settings";
import { countTickets } from "@/lib/tickets";
import { countAdmins, listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Admin-Desk — MITS",
};

export default async function AdminPage() {
  // Authoritative gate: admin only.
  const actor = await requireRole("admin", "/admin");
  await ensureAuthSchema();

  const users = listUsers();
  const settings = getAuthSettings();
  const admins = countAdmins();
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
                Registrierung, Rollen und Bestand dieser Instanz.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {users.length} Konten
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
                <Link href="/admin/forms/builder">
                  <WandSparklesIcon />
                  Formular-Builder
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/mits">
                  <LayoutDashboardIcon />
                  Board
                </Link>
              </Button>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <RegistrationSettingsForm settings={settings} />

          <h2 className="label-industrial mt-10 mb-3">Benutzer & Rollen</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-elev-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Rolle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isSelf = user.id === actor.id;
                  const isLastAdmin = user.role === "admin" && admins <= 1;

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name}
                        {isSelf && (
                          <Badge
                            variant="outline"
                            className="ml-2 rounded-full"
                          >
                            du
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{user.email}</TableCell>
                      <TableCell>
                        <UserRoleForm
                          userId={user.id}
                          currentRole={user.role}
                          // Both cases would leave the instance unadministrable.
                          disabled={isSelf || isLastAdmin}
                          disabledReason={
                            isSelf
                              ? "eigene Rolle"
                              : isLastAdmin
                                ? "letzter Administrator"
                                : undefined
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </>
  );
}
