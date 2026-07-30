"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Bot, ListChecks, PenLine, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TicketSource } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The tri-modal intake teaser.

   A client component only because framer-motion needs one — the page itself
   stays a Server Component and does the session lookup. The mode list lives
   here rather than being passed in: `icon` is a React component and would not
   survive the server→client serialisation boundary.
   ────────────────────────────────────────────────────────────────────────── */

const INTAKE_MODES: {
  source: TicketSource;
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
  /** Marks the AI tile: gets the animated Gemini gradient treatment. */
  gemini?: boolean;
}[] = [
  {
    source: "legacy",
    icon: PenLine,
    title: "Klassisch",
    description:
      "Titel und Freitext, wie im Altsystem. Für alles, was in kein Schema passt.",
    phase: "Phase 2",
  },
  {
    source: "wizard",
    icon: ListChecks,
    title: "Geführter Wizard",
    description:
      "Kategorie zuerst, dann nur die Felder, die zählen. Aus JSON-Schema gerendert, kein Freitext-Zwang.",
    phase: "Phase 2",
  },
  {
    source: "ai_chat",
    icon: Bot,
    title: "Smart KI-Chat",
    description:
      "Problem beschreiben oder Screenshot einwerfen. Ollama übersetzt es in eine strukturierte Formular-Payload.",
    phase: "Phase 3",
    gemini: true,
  },
];

/**
 * Spring physics, not easing curves. Overdamped just enough that nothing
 * visibly overshoots — the Material motion spec calls this "expressive but
 * settled". `mass` below 1 keeps the settle short on the hover response.
 */
const ENTRANCE = {
  type: "spring",
  stiffness: 190,
  damping: 24,
  mass: 0.9,
} as const;

const LIFT = { type: "spring", stiffness: 420, damping: 30, mass: 0.6 } as const;

export function IntakeModes({ href }: { href: string }) {
  // Respected explicitly: framer-motion does not opt out on its own.
  const reduceMotion = useReducedMotion();

  return (
    <section>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={ENTRANCE}
      >
        <h1 className="max-w-2xl text-4xl font-normal tracking-tight sm:text-5xl">
          Ein Ticket.{" "}
          <span className="text-gemini font-medium">Drei Wege</span> hinein.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          MITS nimmt Meldungen klassisch, geführt oder per KI an — und legt am
          Ende immer dieselbe strukturierte Payload ab.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTAKE_MODES.map(
          (
            { source, icon: Icon, title, description, phase, gemini },
            index,
          ) => (
            <motion.div
              key={source}
              className="group relative h-full"
              initial={
                reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                ...ENTRANCE,
                delay: reduceMotion ? 0 : 0.06 + index * 0.07,
              }}
              whileHover={
                reduceMotion ? undefined : { y: -2, transition: LIFT }
              }
            >
              {/* The Gemini highlight lives on its own blurred layer outside
                  the card, so the card keeps a flat Material surface and the
                  glow can bleed past the rounded edge. */}
              {gemini && (
                <span
                  aria-hidden
                  className="bg-gemini-sheen pointer-events-none absolute -inset-0.5 rounded-3xl opacity-60 blur-md transition-opacity duration-500 group-hover:opacity-100"
                />
              )}

              <Card
                className={cn(
                  "relative h-full gap-3 rounded-3xl border border-border bg-card ring-0 shadow-elev-1 transition-[box-shadow,border-color] duration-300 group-hover:border-foreground/20 group-hover:shadow-elev-3",
                  gemini && "group-hover:shadow-glow-gemini",
                )}
              >
                <CardHeader>
                  <span
                    className={cn(
                      "grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground transition-colors duration-300 group-hover:text-foreground",
                      gemini && "bg-gemini-sheen text-foreground",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <CardTitle className="mt-4 text-lg font-medium">
                    {title}
                  </CardTitle>
                  <CardDescription className="mt-1 leading-relaxed">
                    {description}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-xs tracking-wide text-muted-foreground">
                    {source}
                  </span>
                </CardContent>

                <CardFooter className="justify-between rounded-b-3xl border-t-0 bg-transparent pt-2">
                  <span className="text-xs text-muted-foreground">{phase}</span>
                  <Button
                    asChild
                    size="sm"
                    className={cn(
                      "rounded-full px-4",
                      gemini
                        ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                        : "bg-surface-elevated text-foreground hover:bg-accent",
                    )}
                  >
                    {/* Anonymous visitors are sent to the login form, which
                        returns them here afterwards — the caller decides. */}
                    <Link href={href}>Öffnen</Link>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ),
        )}
      </div>
    </section>
  );
}
