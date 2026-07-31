import type { Metadata } from "next";

import { FaqEditor } from "@/components/admin/faq-editor";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { getDataSettings } from "@/lib/data-settings";
import { getPortalFaqs } from "@/lib/portal";

export const metadata: Metadata = {
  title: "Selbsthilfe / FAQ — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   FAQ editing, on its own page.

   It used to be one tab among four in `/admin/portal`. Attachments made it the
   largest editor of the set by some distance, and a tab that scrolls further than
   the three beside it is a tab people stop finding things in.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AdminFaqPage() {
  // Authoritative gate: admin only. The proxy already redirects, this decides.
  await requireRole("admin", "/admin/faq");

  const faqs = getPortalFaqs();
  const withFiles = faqs.filter((entry) => entry.attachments.length > 0).length;

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Selbsthilfe / FAQ
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Fragen, Antworten und Anhänge. Erscheint im Portal als Akkordeon;
                jeder Eintrag hat zusätzlich eine eigene Seite, die man in eine
                Antwort kopieren kann.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {faqs.length} Einträge · {withFiles} mit Anhang
            </Badge>
          </div>

          <Separator className="my-8 bg-border" />

          <FaqEditor faqs={faqs} maxUploadMb={getDataSettings().maxUploadMb} />
        </div>
      </main>
    </>
  );
}
