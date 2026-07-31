import type { Metadata } from "next";

import { UserRecordForm } from "@/components/admin/user-record-form";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listActiveLocations, listLocations } from "@/lib/locations";
import { getUserProfile } from "@/lib/user-profile";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Anwender — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Reporter accounts and their contact details.

   Split from the staff list because the two are managed for different reasons: a
   technician's record is about a role, a reporter's is about where they sit and how to
   reach them. One combined table meant scrolling past colleagues to reach a customer.

   Each row expands into the same form the reporter sees in their own settings, posting
   to an action that calls the same `setUserProfile`. Two masks over one field list.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AdminCustomersPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/customers");

  const customers = listUsers().filter((user) => !canViewBoard(user.role));
  // Active sites for the picker, every site for resolving what is already stored — a
  // profile pointing at a since-deactivated branch should still show its name.
  const active = listActiveLocations();
  const byId = new Map(listLocations().map((location) => [location.id, location]));

  const records = customers.map((user) => ({
    user,
    profile: getUserProfile(user.id),
  }));

  const withLocation = records.filter((record) => record.profile.location_id).length;

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Anwender
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Konten mit der Rolle Anwender. Name, Standort und Kontaktdaten sind
                hier pflegbar; die Anwender können dieselben Angaben selbst
                bearbeiten.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {records.length} Konten · {withLocation} mit Standort
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

          {records.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
              Keine Anwender-Konten. Wer sich registriert, erscheint hier.
            </p>
          ) : (
            <Accordion
              type="single"
              collapsible
              className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1"
            >
              {records.map(({ user, profile }) => {
                const location = profile.location_id
                  ? byId.get(profile.location_id)
                  : undefined;

                return (
                  <AccordionItem key={user.id} value={user.id} className="border-0">
                    <AccordionTrigger className="gap-4 px-5 py-3.5 hover:no-underline">
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
                        <span className="min-w-40 flex-1 truncate text-sm font-medium">
                          {user.name}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {user.email}
                        </span>
                        {location && (
                          <Badge
                            variant="secondary"
                            className="h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal"
                          >
                            {location.code || location.name}
                          </Badge>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="grid gap-5 px-5 pb-5">
                      <UserRecordForm
                        user={user}
                        profile={profile}
                        locations={active}
                      />

                      {/* Promotion happens here, where the account is listed. The
                          staff page is for changing what somebody who already has a
                          role may do. */}
                      <div className="grid gap-2 border-t border-border pt-4">
                        <span className="label-industrial">Rolle</span>
                        <UserRoleForm userId={user.id} currentRole={user.role} />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </main>
    </>
  );
}
