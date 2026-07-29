import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { MITSLogo } from "@/components/branding/mits-logo";
import { TriModalContainer } from "@/components/tickets/tri-modal-container";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Neues Ticket — MITS",
  description:
    "Ticket klassisch, über den geführten Service-Katalog oder per KI-Assistent erfassen.",
};

export default function NewTicketPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="w-full max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <MITSLogo />
          <Button asChild variant="ghost" size="sm" className="rounded-sm">
            <Link href="/">
              <ArrowLeftIcon />
              Startseite
            </Link>
          </Button>
        </header>

        <Separator className="my-8 bg-border" />

        <h1 className="text-2xl font-bold uppercase sm:text-3xl">Neues Ticket</h1>
        <p className="mt-2 text-muted-foreground">
          Wähle den Weg, der passt. Alle drei erzeugen dieselbe strukturierte
          Payload.
        </p>

        <div className="mt-8">
          <TriModalContainer />
        </div>
      </div>
    </main>
  );
}
