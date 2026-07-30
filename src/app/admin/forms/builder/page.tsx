import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { SchemaBuilder } from "@/components/admin/schema-builder";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { listSchemaInfos } from "@/lib/form-schemas";

export const metadata: Metadata = {
  title: "Formular-Builder — MITS",
};

export default async function FormBuilderPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/forms/builder");

  const infos = listSchemaInfos();
  const existing = infos.map((info) => ({
    id: info.schema.id,
    title: info.schema.title,
    builtIn: info.builtIn,
  }));
  const stored = infos.filter((info) => info.overridden).length;

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Formular-Builder
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Ticket-Typen sind Daten, kein Code. Was hier gespeichert wird,
                erscheint sofort im Service-Katalog und wird der KI-Triage als
                Zielschema angeboten.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {infos.length} Formulare · {stored} aus der Datenbank
              </Badge>
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/admin">
                  <ArrowLeftIcon />
                  Admin-Desk
                </Link>
              </Button>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          <SchemaBuilder existing={existing} />
        </div>
      </main>
    </>
  );
}
