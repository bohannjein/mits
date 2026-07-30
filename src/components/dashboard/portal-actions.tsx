"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Bot, ListChecks, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   The two things a signed-in user comes here to do.

   No explanatory copy: the portal is a tool, not a pitch. Both tiles deep-link
   into the intake with the mode preselected — /tickets/new reads `mode` from the
   query string, so a bookmark or a shared link lands on the right tab.

   The list lives in this client component rather than being passed in, because
   `icon` is a React component and would not survive server→client serialisation.
   ────────────────────────────────────────────────────────────────────────── */

const ACTIONS: {
  href: string;
  icon: LucideIcon;
  title: string;
  /** The AI tile carries the Gemini gradient, as on every AI surface in MITS. */
  gemini?: boolean;
}[] = [
  {
    href: "/tickets/new?mode=ai_chat",
    icon: Bot,
    title: "Smart IT-Helpdesk",
    gemini: true,
  },
  {
    href: "/tickets/new?mode=wizard",
    icon: ListChecks,
    title: "Formular-Katalog",
  },
];

const ENTRANCE = {
  type: "spring",
  stiffness: 190,
  damping: 24,
  mass: 0.9,
} as const;

const LIFT = { type: "spring", stiffness: 420, damping: 30, mass: 0.6 } as const;

export function PortalActions() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {ACTIONS.map(({ href, icon: Icon, title, gemini }, index) => (
        <motion.div
          key={href}
          className="group relative"
          initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            ...ENTRANCE,
            delay: reduceMotion ? 0 : 0.05 + index * 0.07,
          }}
          whileHover={reduceMotion ? undefined : { y: -2, transition: LIFT }}
        >
          {gemini && (
            <span
              aria-hidden
              className="bg-gemini-sheen pointer-events-none absolute -inset-0.5 rounded-3xl opacity-60 blur-md transition-opacity duration-500 group-hover:opacity-100"
            />
          )}

          <Card
            className={cn(
              "relative rounded-3xl border border-border bg-card p-0 ring-0 shadow-elev-1 transition-[box-shadow,border-color] duration-300 group-hover:border-foreground/20 group-hover:shadow-elev-3",
              gemini && "group-hover:shadow-glow-gemini",
            )}
          >
            {/* The whole tile is the hit area — a separate button inside a
                clickable card gives two targets for one action. */}
            <Link
              href={href}
              className="flex items-center gap-4 rounded-3xl px-5 py-6 outline-ring/50 focus-visible:outline-2"
            >
              <span
                className={cn(
                  "grid size-12 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground transition-colors duration-300 group-hover:text-foreground",
                  gemini && "bg-gemini-sheen text-foreground",
                )}
              >
                <Icon className="size-6" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-lg font-medium">{title}</span>
              <ArrowRight
                className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
            </Link>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
