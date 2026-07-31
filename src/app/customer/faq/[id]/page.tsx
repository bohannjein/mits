import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqFiles, FaqImages } from "@/components/dashboard/faq-attachment-view";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { SplitView } from "@/components/layout/split-view";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { getPortalFaqs } from "@/lib/portal";
import { isImageAttachment } from "@/types/mits";

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

  /*
   * Images stay in the article, files move to the sidebar: a screenshot answers the
   * question by being looked at next to the text, a PDF answers it by being opened
   * later. Counted here so the sidebar can say "none" instead of rendering an empty
   * heading.
   */
  const files = faq.attachments.filter((entry) => !isImageAttachment(entry));

  return (
    <>
      <AppHeader />
      <main className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-6 py-8">
        <div className="flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <SplitView
            sidebarLabel="Anhänge"
            sidebarWidth="20rem"
            header={
              <>
                <BackLink href="/customer" label="Zurück zum Portal" />
                {faq.category && (
                  <Badge
                    variant="outline"
                    className="mt-3 h-auto rounded-full px-2.5 py-0.5 font-normal"
                  >
                    {faq.category}
                  </Badge>
                )}
                <h1 className="mt-2 text-2xl font-normal tracking-tight sm:text-3xl">
                  {faq.question}
                </h1>
              </>
            }
            main={
              /* The article scrolls on its own. A long answer used to push the download
                 cards off the bottom of the page; now they stay in view beside it. */
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {/* Authored as plain text, rendered as plain text. Turning it into
                    markup would mean an admin-authored article could inject into every
                    reader's page. */}
                <p className="leading-relaxed whitespace-pre-wrap">{faq.answer}</p>

                <div className="mt-8">
                  <FaqImages attachments={faq.attachments} />
                </div>
              </div>
            }
            sidebar={
              files.length > 0 ? (
                <FaqFiles attachments={faq.attachments} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Keine Dateien zu diesem Beitrag.
                </p>
              )
            }
          />
        </div>
      </main>
    </>
  );
}
