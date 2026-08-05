import type { Metadata } from "next";
import Link from "next/link";

import { TriageRulesForm } from "@/components/admin/triage-rules-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { getPortalFaqs } from "@/lib/portal";
import { listCategories } from "@/lib/ticket-categories";
import { listTriageRules } from "@/lib/triage-rules";

export const metadata: Metadata = {
  title: "Smart-Routing — MITS",
};

export default async function AdminRoutingPage() {
  await requireRole("admin", "/admin/settings/routing");

  const rules = listTriageRules();
  const categories = listCategories();
  const faqs = getPortalFaqs();
  const enabled = isFeatureEnabled("feature_smart_routing");

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Smart-Routing
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Stichworte ordnen eingehende Tickets einer Kategorie zu und zeigen
              Anwendern beim Schreiben passende FAQ-Einträge.
            </p>
          </div>

          {/* The only two sentences on this page that are not field labels, and
              both name a reason a working mask produces no visible effect. */}
          {!enabled && (
            <p className="mt-4 text-sm text-muted-foreground">
              Das Modul „Smart-Routing“ ist unter Module abgeschaltet. Regeln
              greifen erst wieder, wenn es aktiv ist.
            </p>
          )}

          {categories.length === 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Es gibt noch keine Kategorien, denen eine Regel zuordnen könnte.
              </p>
              <Button
                asChild
                size="sm"
                className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
              >
                <Link href="/admin/categories">Kategorien anlegen</Link>
              </Button>
            </div>
          )}

          <Separator className="my-8 bg-border" />

          <TriageRulesForm rules={rules} categories={categories} faqs={faqs} />
        </div>
      </main>
    </>
  );
}
