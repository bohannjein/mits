import type { Metadata } from "next";

import { UserRoleForm } from "@/components/admin/user-role-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { countAdmins, listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Technik & Administration — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Staff accounts and their roles.

   Separate from the reporter list: a technician's record is managed for its role, a
   reporter's for where they sit and how to reach them. One combined table meant
   scrolling past colleagues to find a customer, and the two need different columns.

   Promoting a reporter happens on the reporter page, where they are listed. This page
   is for changing what somebody who already has a role may do.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AdminStaffPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  const actor = await requireRole("admin", "/admin/staff");

  const staff = listUsers().filter((user) => canViewBoard(user.role));
  const admins = countAdmins();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Technik &amp; Administration
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Konten mit Zugriff auf die Queue. Eine Rollenänderung greift erst,
                wenn die betroffene Sitzung neu geladen wird — der Session-Cache
                hält 60 Sekunden.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {staff.length} Konten · {admins} Admin
              {admins === 1 ? "" : "s"}
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

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
                {staff.map((user) => {
                  const isSelf = user.id === actor.id;
                  const isLastAdmin = user.role === "admin" && admins <= 1;

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name}
                        {isSelf && (
                          <Badge variant="outline" className="ml-2 rounded-full">
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

          {staff.length === 1 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Nur ein Konto mit Zugriff. Eine zweite Person mit der Rolle{" "}
              {ROLE_LABELS.admin} ist der einfachste Weg, sich nicht selbst
              auszusperren.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
