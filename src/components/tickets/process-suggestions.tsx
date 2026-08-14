"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRightIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { iconFor } from "@/lib/icons";
import type { MITSFormSchema } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   „Dafür gibt es ein Formular" — beside the free-text field, while it is written.

   The catalogue is one tab away and always has been, which helps exactly the
   people who already know it exists. Everybody else describes their problem in
   free text, and the specific form — with the three fields the desk would
   otherwise have to ask for — is never seen.

   So the suggestion comes to them, and it comes *after* the words rather than
   before: an admin maps keywords to forms under /admin/settings/routing, the
   matching runs locally on every pause in typing, and this column shows what came
   out. Clicking one opens the form with the text already in it — see
   `lib/forms/carry-over.ts`.

   The column is reserved by the page rather than by this component. It renders
   `null` when there is nothing to say, which is how somebody who writes about
   something no rule covers sees no change at all.
   ────────────────────────────────────────────────────────────────────────── */

const ENTRANCE = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

export function ProcessSuggestions({
  /** Matched forms, strongest rule first. Empty renders nothing. */
  schemas,
  onOpen,
  onDismiss,
}: {
  schemas: MITSFormSchema[];
  onOpen: (schemaId: string) => void;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {schemas.length > 0 && (
        <motion.aside
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={ENTRANCE}
          aria-label="Passende Formulare"
          className="grid content-start gap-3"
        >
          <div className="flex items-center gap-2">
            <h2 className="label-industrial flex-1">Passende Formulare</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Formularvorschläge ausblenden"
              // Stays gone for this visit, same rule as the FAQ hints: somebody
              // who closed it has answered the question, and re-offering on the
              // next keystroke is the nagging this is supposed to avoid.
              onClick={onDismiss}
              className="size-6 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <XIcon className="size-3" strokeWidth={1.5} />
            </Button>
          </div>

          <ul className="grid gap-3">
            {schemas.map((schema) => {
              const Icon = iconFor(schema.icon);
              return (
                <li key={schema.id}>
                  {/*
                    A button, not a link: there is no route for a single catalogue
                    form — the wizard opens it from the intake's own state, and the
                    typed text has to travel with the click.
                  */}
                  <button
                    type="button"
                    onClick={() => onOpen(schema.id)}
                    className="group grid w-full gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left transition-[box-shadow,border-color] duration-300 hover:border-foreground/20 hover:shadow-elev-3"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                        <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                      </span>
                      <span className="flex-1 text-sm font-medium">
                        {schema.title}
                      </span>
                      <ArrowRightIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </span>
                    {schema.description && (
                      <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {schema.description}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* The one sentence: what happens to the words already written. Without
              it the column reads like a way to lose them. */}
          <p className="text-xs text-muted-foreground">
            Der geschriebene Text wird übernommen.
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
