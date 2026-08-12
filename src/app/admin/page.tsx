import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, CircleIcon } from "lucide-react";

import { AdminSettingsList } from "@/components/admin/admin-settings-list";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { ensureAuthSchema } from "@/lib/auth/server";
import { collectAdminSummaries, collectSetupSteps } from "@/lib/admin-index";
import { countTickets } from "@/lib/tickets";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Admin-Desk — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   Der Admin-Desk ist ein Index, nichts anderes.

   Vorher war er beides: eine umbrechende Reihe aus achtundzwanzig gleich
   aussehenden Pillen *und* das Formular für die Registrierungsrichtlinie. Das
   eine Formular sah dadurch willkürlich aus — es lag da, weil es zuerst da war.
   Es ist nach `/admin/settings/registration` gezogen, wo die anderen liegen.

   Was hier steht, ist die Liste nach dem Vorbild einer Telefon-Einstellungsapp:
   Gruppen, ganzzeilige Einträge, und unter jedem der aktuelle Wert. Dazu die
   Erste-Schritte-Liste, solange sie etwas zu sagen hat.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AdminPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin");
  await ensureAuthSchema();

  const users = listUsers();
  const staff = users.filter((user) => canViewBoard(user.role)).length;
  const { total, open } = countTickets();

  const steps = collectSetupSteps();
  const outstanding = steps.filter((step) => !step.done);

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-3xl">
          <BackLink href="/mits" label="Zurück zur Queue" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Admin-Desk
              </h1>
              <p className="mt-2 text-muted-foreground">
                Alles, was diese Instanz einstellt — mit dem Stand darunter.
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
            Nur solange etwas offen ist. Eine dauerhaft sichtbare Liste mit fünf
            Haken ist eine Gratulation auf der Fläche, um die am meisten
            konkurriert wird — dieselbe Regel wie beim Erinnerungs-Widget im
            Portal, das auf leerer Liste `null` rendert.
          */}
          {outstanding.length > 0 && (
            <section className="mt-8 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-medium">
                Erste Schritte
                <span className="ml-2 font-normal text-muted-foreground">
                  {steps.length - outstanding.length} von {steps.length} erledigt
                </span>
              </h2>

              <ul className="mt-4 grid gap-3">
                {steps.map((step) => (
                  <li key={step.key} className="flex items-start gap-3">
                    {step.done ? (
                      <CheckIcon
                        className="mt-0.5 size-4 shrink-0 text-success"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : (
                      <CircleIcon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0">
                      {step.done ? (
                        <span className="text-sm text-muted-foreground line-through">
                          {step.label}
                        </span>
                      ) : (
                        <>
                          <Link
                            href={step.href}
                            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {step.label}
                          </Link>
                          {/* Die Folge, nicht die Beschreibung. Ohne sie ist die
                              Liste eine Reihe von Aufgaben ohne Begründung, und
                              die erste, die jemand überspringt, ist die, deren
                              Kosten er nicht kennt. */}
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {step.why}
                          </p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Separator className="my-8 bg-border" />

          <AdminSettingsList summaries={collectAdminSummaries()} />
        </div>
      </main>
    </>
  );
}
