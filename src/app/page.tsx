import Link from "next/link";
import { Bot, ListChecks, PenLine, type LucideIcon } from "lucide-react";

import { MITSLogo } from "@/components/branding/mits-logo";
import { AppHeader } from "@/components/layout/app-header";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { TicketSource } from "@/types/mits";

/**
 * The tri-modal intake, rendered from data rather than one component per mode —
 * the same rule that keeps ticket types out of the component tree.
 */
const INTAKE_MODES: {
  source: TicketSource;
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
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
  },
];

export default async function Home() {
  const user = await getSessionUser();

  return (
    <>
      <AppHeader />
      <main className="bg-grid flex flex-1 flex-col items-center px-6 py-14">
      <div className="w-full max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MITSLogo showTagline />
          <Badge variant="outline" className="rounded-sm border-2 font-mono">
            {user ? `angemeldet · ${ROLE_LABELS[user.role]}` : "nicht angemeldet"}
          </Badge>
        </div>

        <Separator className="my-8 bg-border" />

        <h1 className="max-w-2xl text-3xl font-bold uppercase sm:text-4xl">
          Ein Ticket. Drei Wege hinein.
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          MITS nimmt Meldungen klassisch, geführt oder per KI an — und legt am
          Ende immer dieselbe strukturierte Payload ab.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INTAKE_MODES.map(
            ({ source, icon: Icon, title, description, phase }) => (
              <Card
                key={source}
                className="rounded-sm border-2 border-border shadow-brutal ring-0 transition-shadow hover:shadow-brutal-primary"
              >
                <CardHeader>
                  <Icon className="size-6 text-primary" aria-hidden />
                  <CardTitle className="mt-3 text-lg uppercase">
                    {title}
                  </CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="label-industrial">{source}</span>
                </CardContent>
                <CardFooter className="justify-between rounded-none border-t-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {phase}
                  </span>
                  <Button asChild size="sm" variant="outline" className="rounded-sm">
                    {/* Anonymous visitors are sent to the login form, which
                        returns them here afterwards. */}
                    <Link href={user ? "/tickets/new" : "/login?next=%2Ftickets%2Fnew"}>
                      Öffnen
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ),
          )}
        </div>
      </div>
      </main>
    </>
  );
}
