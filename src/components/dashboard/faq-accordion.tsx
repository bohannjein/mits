"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { PortalFaq } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Self-help accordion.

   A client component because Radix's Accordion is one. Grouped by category, in
   first-appearance order — the FAQ list is already sorted by `order_index`, so
   the group order follows from the entries rather than from a second sort key
   nobody would remember to maintain.
   ────────────────────────────────────────────────────────────────────────── */

export function FaqAccordion({
  title,
  faqs,
}: {
  title: string;
  faqs: PortalFaq[];
}) {
  const usable = faqs.filter(
    (faq) => faq.question.trim() && faq.answer.trim(),
  );

  // Same contract as ResourceGrid and AnnouncementBanner: nothing to show means
  // no block, not an empty card.
  if (usable.length === 0) return null;

  const groups = groupByCategory(usable);

  return (
    <section aria-label={title} className="grid gap-3">
      <h2 className="label-industrial">{title}</h2>

      <div className="grid gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1">
        {groups.map(({ category, entries }) => (
          <div key={category || "__ungrouped"} className="grid gap-1">
            {category && (
              <span className="text-xs font-medium tracking-wide text-muted-foreground">
                {category}
              </span>
            )}
            <Accordion type="single" collapsible>
              {entries.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="gap-4 py-3 hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 leading-relaxed text-muted-foreground">
                    {/* Plain text, deliberately: the answer is admin-authored,
                        and rendering it as HTML would make the editor a stored
                        XSS vector against every portal visitor. */}
                    <p className="whitespace-pre-wrap">{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </section>
  );
}

function groupByCategory(faqs: PortalFaq[]) {
  const groups: { category: string; entries: PortalFaq[] }[] = [];

  for (const faq of faqs) {
    const category = faq.category.trim();
    const existing = groups.find((group) => group.category === category);
    if (existing) {
      existing.entries.push(faq);
    } else {
      groups.push({ category, entries: [faq] });
    }
  }

  return groups;
}
