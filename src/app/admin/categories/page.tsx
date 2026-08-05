import type { Metadata } from "next";

import { CategoryTreeForm } from "@/components/admin/category-tree-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Separator } from "@/components/ui/separator";
import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import {
  listCategories,
  ticketCountsByCategory,
} from "@/lib/ticket-categories";

export const metadata: Metadata = {
  title: "Kategorien — MITS",
};

export default async function AdminCategoriesPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/categories");

  const categories = listCategories();
  const ticketCounts = ticketCountsByCategory();
  const enabled = isFeatureEnabled("feature_ticket_categories");

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4">
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              Kategorien
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Zwei Ebenen: Hauptkategorie und Unterkategorie. Sie steuern die
              Kacheln im Ticket-Eingang und den Filter in der Queue.
            </p>
          </div>

          {/*
            Said here rather than left to be discovered, and this is the one case
            Regel 4 keeps a sentence for: the mask works, the save works, and
            nothing appears anywhere — the only visible symptom of the module being
            off is a feature that looks broken.
          */}
          {!enabled && (
            <p className="mt-4 text-sm text-muted-foreground">
              Das Modul „Kategorien“ ist unter Module abgeschaltet. Gespeicherte
              Kategorien erscheinen erst wieder, wenn es aktiv ist.
            </p>
          )}

          <Separator className="my-8 bg-border" />

          <CategoryTreeForm
            categories={categories}
            ticketCounts={ticketCounts}
          />
        </div>
      </main>
    </>
  );
}
