"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Inbox,
  ListChecks,
  PenLine,
  type LucideIcon,
} from "lucide-react";

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

type Action = {
  href: string;
  icon: LucideIcon;
  title: string;
  /** The AI tile carries the Gemini gradient, as on every AI surface in MITS. */
  gemini?: boolean;
};

const AI_ACTION: Action = {
  href: "/customer/new?mode=ai_chat",
  icon: Bot,
  title: "Smart IT-Helpdesk",
  gemini: true,
};

const CATALOG_ACTION: Action = {
  href: "/customer/new?mode=wizard",
  icon: ListChecks,
  title: "Formular-Katalog",
};

/**
 * Die Auffangkachel.
 *
 * Steht nur da, wenn keine der beiden anderen es tut — sonst wäre das Portal um
 * eine dritte Kachel gewachsen, die es nie hatte. Sie wird gebraucht, weil der
 * Reiter „Schnellerstellung" nie eine eigene Kachel hatte: man kam über eine der
 * beiden anderen hinein und wechselte den Reiter. Bleibt für eine Rolle nur er
 * übrig, gäbe es ohne diese Kachel keinen Weg mehr ins Formular.
 */
const QUICK_ACTION: Action = {
  href: "/customer/new?mode=legacy",
  icon: PenLine,
  title: "Ticket schreiben",
};

const ENTRANCE = {
  type: "spring",
  stiffness: 190,
  damping: 24,
  mass: 0.9,
} as const;

const LIFT = { type: "spring", stiffness: 420, damping: 30, mass: 0.6 } as const;

export function PortalActions({
  /** From the portal config — `ticket_button_label`. */
  label,
  /** Bereich `intake_ai`. */
  showAi = true,
  /** Mindestens ein Katalogformular ist für diese Rolle sichtbar. */
  showCatalog = true,
  /** Das Freitext-Formular ist für diese Rolle sichtbar. */
  showQuick = true,
  /**
   * Der Weg zu den eigenen Tickets, oder `null` wenn die Rolle den Bereich nicht
   * hat.
   *
   * **Nicht an das Portal-Widget gekoppelt, und das ist der Punkt.** Die eigene
   * Ticketliste war ausschließlich als abschaltbares Widget (`active_tickets`)
   * auf dieser Seite. Schaltet ein Admin es aus, führte der einzige Weg zum
   * eigenen Ticket über das Benutzermenü — und „wie steht es um meine Sache" ist
   * die Frage, mit der ein Melder das Portal öffnet.
   */
  myTicketsHref = null,
}: {
  label?: string;
  showAi?: boolean;
  showCatalog?: boolean;
  showQuick?: boolean;
  myTicketsHref?: string | null;
}) {
  const reduceMotion = useReducedMotion();

  const actions = [
    ...(showAi ? [AI_ACTION] : []),
    ...(showCatalog ? [CATALOG_ACTION] : []),
    ...(!showAi && !showCatalog && showQuick ? [QUICK_ACTION] : []),
  ];

  // Nichts freigegeben, also keine Überschrift über einer leeren Reihe. Die Seite
  // sagt an dieser Stelle dann gar nichts, statt eine Aufforderung ohne Ziel.
  // Der Weg zu den eigenen Tickets zählt mit: er ist der Grund, dass dieser
  // Abschnitt auch für eine Rolle ohne Eingang noch etwas zu sagen hat.
  if (actions.length === 0 && !myTicketsHref) return null;

  return (
    <section aria-label={label ?? "Ticket erfassen"} className="grid gap-3">
      {label && <h2 className="label-industrial">{label}</h2>}
      <div className="grid gap-4 sm:grid-cols-2">
      {actions.map(({ href, icon: Icon, title, gemini }, index) => (
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

      {/*
        Eine Zeile über die ganze Breite, nicht eine dritte Kachel im Raster.
        Zwei Gründe: drei Kacheln in zwei Spalten lassen eine Lücke, und das hier
        ist Navigation und keine Erfassung — dieselbe Ordnung, aus der die
        Kacheln oben nach Eingangsart getrennt sind.
      */}
      {myTicketsHref && (
        <Card className="rounded-2xl border border-border bg-card p-0 ring-0 shadow-elev-1 transition-[box-shadow,border-color] duration-300 hover:border-foreground/20 hover:shadow-elev-3">
          <Link
            href={myTicketsHref}
            className="flex items-center gap-4 rounded-2xl px-5 py-4 outline-ring/50 focus-visible:outline-2"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
              <Inbox className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="font-medium">Meine Tickets</span>
            <ArrowRight
              className="ml-auto size-5 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
          </Link>
        </Card>
      )}
    </section>
  );
}
