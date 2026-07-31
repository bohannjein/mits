import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqFiles, FaqImages } from "@/components/dashboard/faq-attachment-view";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/session";
import { getPortalFaqs } from "@/lib/portal";

export const metadata: Metadata = {
  title: "Selbsthilfe — MITS",
};

/* ──────────────────────────────────────────────────────────────────────────
   One FAQ article.

   The portal accordion stays as the overview; this page exists because an article
   with images and downloads does not fit inside a collapsed row, and because a
   linkable answer is something support can paste into a reply.

   Guarded with `requireUser`, not left public: the attachments are readable by any
   signed-in user, so the page that lists them has to require the same.
   ────────────────────────────────────────────────────────────────────────── */

export default async function FaqArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser(`/customer/faq/${id}`);

  const faq = getPortalFaqs().find((entry) => entry.id === id);
  if (!faq) notFound();

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <BackLink href="/customer" label="Zurück zum Portal" />

          <div className="mt-4">
            {faq.category && (
              <Badge
                variant="outline"
                className="mb-3 h-auto rounded-full px-2.5 py-0.5 font-normal"
              >
                {faq.category}
              </Badge>
            )}
            <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">
              {faq.question}
            </h1>
          </div>

          <Separator className="my-8 bg-border" />

          <div className="grid gap-8">
            {/* Authored as plain text, rendered as plain text. Turning it into
                markup would mean an admin-authored article could inject into every
                reader's page. */}
            <p className="leading-relaxed whitespace-pre-wrap">{faq.answer}</p>

            <FaqImages attachments={faq.attachments} />
            <FaqFiles attachments={faq.attachments} />
          </div>
        </div>
      </main>
    </>
  );
}
