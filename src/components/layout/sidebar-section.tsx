"use client";

import type { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ──────────────────────────────────────────────────────────────────────────
   Collapsible sections for the context sidebar.

   Built on the Accordion primitive that is already in `components/ui` rather than
   pulling in a Collapsible — `type="multiple"` is a set of independent collapsibles,
   which is exactly what a sidebar wants: closing "Verknüpfungen" must not close
   "Status".

   `defaultValue` decides what starts open, and it is the caller's decision because it
   depends on the page: on a ticket the workflow controls are what an agent reaches for
   first, on a customer record it is the contact details.
   ────────────────────────────────────────────────────────────────────────── */

export interface SidebarSection {
  id: string;
  title: string;
  /** Rendered right of the title — a count, a state dot. */
  badge?: ReactNode;
  content: ReactNode;
}

export function SidebarSections({
  sections,
  /** Ids that start expanded. Everything else starts collapsed. */
  defaultOpen,
}: {
  sections: SidebarSection[];
  defaultOpen?: string[];
}) {
  const usable = sections.filter((section) => section.content !== null);

  return (
    <Accordion
      type="multiple"
      defaultValue={defaultOpen ?? usable.map((section) => section.id)}
      className="grid gap-2"
    >
      {usable.map((section) => (
        <AccordionItem
          key={section.id}
          value={section.id}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          <AccordionTrigger className="gap-3 px-4 py-3 text-sm font-medium hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{section.title}</span>
              {section.badge}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {section.content}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
