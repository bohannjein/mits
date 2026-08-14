import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListIcon } from "lucide-react";

import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { TriModalContainer } from "@/components/tickets/tri-modal-container";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CUSTOMER_HOME } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { requireArea, requireUser } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/features";
import { hasFormSuggestions } from "@/lib/services/auto-triage";
import { listCategoryTree } from "@/lib/ticket-categories";
import { listTriageRules } from "@/lib/triage-rules";
import {
  listCatalogSchemasFor,
  quickTicketSchemaFor,
} from "@/lib/form-schemas";
import { listActiveLocations } from "@/lib/locations";
import { canSeeArea } from "@/lib/role-visibility";
import { getActiveAnnouncements, getPortalFaqs } from "@/lib/portal";
import { getAISettings } from "@/lib/ai-settings";
import { listUsers } from "@/lib/users";
import { TicketSource, isAIFeatureOn } from "@/types/mits";

export const metadata: Metadata = {
  title: "Neues Ticket — MITS",
  description:
    "Ticket klassisch, über den geführten Service-Katalog oder per KI-Assistent erfassen.",
};

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  // Authoritative guard — the proxy only redirects early.
  const user = await requireUser("/customer/new");
  // Zweiter Guard, andere Frage: nicht „angemeldet", sondern „gibt es diesen
  // Bereich für diese Rolle". Leitet auf das Portal um, nicht auf /forbidden.
  requireArea("customer_new", user.role);

  /*
   * Validated against the enum rather than cast: `?mode=` is user input, and an
   * unknown value should open the default tab, not render nothing.
   *
   * `email` passes the enum and is still not a tab — it is how a ticket arrived,
   * not a way to file one. Without the second check `?mode=email` would render a
   * tab strip with nothing selected and an empty panel below it.
   */
  const { mode } = await searchParams;
  const parsedMode = TicketSource.safeParse(mode).data;
  const initialMode = parsedMode === "email" ? undefined : parsedMode;

  /*
   * Resolved on the server so builder-published schemas appear without a rebuild.
   * The quick-ticket form may itself be overridden by a stored version.
   *
   * Beide gefiltert nach dem, was diese Rolle sehen darf. Serverseitig und nicht
   * im Browser: was gar nicht erst ausgeliefert wird, kann kein Client wieder
   * einblenden — und `POST /api/tickets` lehnt denselben Entwurf noch einmal ab.
   */
  const quickTicketSchema = quickTicketSchemaFor(user.role);
  const catalogSchemas = listCatalogSchemasFor(user.role);
  const aiChat = canSeeArea(user.role, "intake_ai");

  /*
   * Drei Schalter, die einzeln harmlos sind und zusammen die Seite leeren.
   *
   * Behandelt wie ein abgeschalteter Bereich, weil es einer ist: die Kacheln auf
   * dem Portal führen dann ebenfalls nicht hierher. Eine Seite mit Überschrift
   * und nichts darunter wäre die schlechtere Antwort — sie sieht kaputt aus,
   * statt zu fehlen.
   */
  if (!quickTicketSchema && catalogSchemas.length === 0 && !aiChat) {
    redirect(CUSTOMER_HOME);
  }

  const announcements = getActiveAnnouncements();
  const flags = getFeatureFlags();

  /*
   * Formularvorschläge neben dem Schreibfeld: Regeln lesen, und daraus die Breite.
   *
   * Die Regeln hängen am Modul-Schalter wie bisher. Ob daneben eine zweite Spalte
   * *entsteht*, ist eine engere Frage — es braucht eine aktive Regel, die ein
   * Formular nennt, das diese Rolle auch sehen darf. Ohne das bleibt die Seite
   * einspaltig und Zeichen für Zeichen die alte; dieselbe Entscheidung wie
   * „`max-w-7xl` nur mit Randspalten" auf der Melder-Ticketseite.
   *
   * `hasFormSuggestions` statt einer Bedingung hier, weil `TriModalContainer` im
   * Browser dieselbe Frage beantworten muss: zwei Kopien wären zwei Antworten auf
   * „gibt es eine zweite Spalte", und die Uneinigkeit rendert als gequetschtes
   * Schreibfeld.
   */
  const triageRules = flags.feature_smart_routing ? listTriageRules() : [];
  const withRail = hasFormSuggestions(
    triageRules,
    catalogSchemas.map((schema) => schema.id),
  );

  /*
   * Choices for the `location` and `user` field widgets. Loaded here rather than
   * baked into the schemas, so a new branch or a new colleague shows up without
   * anyone editing a form.
   *
   * Users are reduced to id and name on purpose. `listUsers()` also returns the
   * address and the role, and a ticket form has no reason to hand every reporter a
   * staff directory — a colleague picker needs a name and nothing else.
   */
  const activeLocations = listActiveLocations();
  const fieldOptions = {
    locations: activeLocations.map((location) => ({
      value: location.id,
      label: location.code ? `${location.name} (${location.code})` : location.name,
    })),
    users: listUsers().map((candidate) => ({
      value: candidate.id,
      label: candidate.name,
    })),
  };

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        {/*
          70rem = 48rem erste Spalte + 2rem Abstand + 20rem Randspalte, also
          genau die Summe des Rasters darunter. Ein größerer Deckel ließe rechts
          Schlupf stehen, den keine der beiden Spalten aufnimmt — die Seite sähe
          dann außermittig aus.

          Der Deckel greift erst ab `xl`; zwischen `lg` und `xl` ist das Fenster
          selbst der Deckel, und die erste Spalte gibt dort Breite ab. Darunter
          steht die Randspalte unter dem Schreibfeld.
        */}
        <div className={cn("w-full max-w-3xl", withRail && "lg:max-w-none xl:max-w-[70rem]")}>
          {/*
            Kopfblock und Banner enden dort, wo die erste Spalte endet.

            Als Rand und nicht als `max-w-3xl`: zwischen `lg` und `xl` ist die
            erste Spalte *schmaler* als 48rem, ein Deckel auf 48rem ließe den Knopf
            „Meine Tickets" also rechts über das Schreibfeld hinaus in die
            Randspalte ragen. Der Rand ist Randspalte plus Abstand — dieselbe
            Rechnung, die das Raster darunter macht, und damit exakt dessen erste
            Spalte.
          */}
          <div className={cn(withRail && "lg:mr-[18rem] xl:mr-[22rem]")}>
          {announcements.length > 0 && (
            <div className="mb-8">
              <AnnouncementBanner announcements={announcements} />
            </div>
          )}

          <BackLink href="/customer" label="Zurück zum Portal" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Neues Ticket
              </h1>
              <p className="mt-2 text-muted-foreground">
                Einfach schreiben, ein Formular aus dem Katalog wählen oder die KI
                fragen — gemeldet als {user.email}.
              </p>
            </div>
            {/* Derselbe Bereichsschalter wie im Benutzermenü — ein sichtbarer
                Link, der in eine Umleitung läuft, ist eine schlechtere Antwort
                als kein Link. */}
            {canSeeArea(user.role, "customer_tickets") && (
              <Button asChild size="sm" className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent">
                <Link href="/customer/tickets">
                  <ListIcon />
                  Meine Tickets
                </Link>
              </Button>
            )}
          </div>

          <Separator className="my-8 bg-border" />
          </div>

          <TriModalContainer
            quickTicketSchema={quickTicketSchema}
            catalogSchemas={catalogSchemas}
            aiChat={aiChat}
            initialMode={initialMode}
            locations={activeLocations}
            fieldOptions={fieldOptions}
            // First word of the display name, same rule the portal hero uses. An
            // account whose name is its address falls back to the neutral heading
            // rather than greeting somebody as "anna.meier@firma.de".
            greetingName={
              user.name.includes("@") ? "" : user.name.trim().split(/\s+/)[0]
            }
            /*
             * Sent whole to the browser, and that is the point: the matching runs
             * locally on every pause in typing, so there is no request per
             * keystroke and no server round trip in the way. The FAQ is published
             * to every signed-in user anyway — this hands over nothing the portal
             * does not already show.
             *
             * Empty when the feature is off, which switches the whole area off.
             */
            faqs={
              isAIFeatureOn(getAISettings(), "deflection") ? getPortalFaqs() : []
            }
            /*
             * The intent tiles, and the keyword rules behind the hints and the
             * form suggestions.
             *
             * Both empty when their module is off, which is the whole off switch —
             * `IntentTiles` renders null on an empty tree and the container skips
             * the keyword half on an empty rule list. No conditional markup here,
             * so there is no branch that can render half of the feature.
             *
             * The FAQ above is gated on `deflection` and the rules on
             * `feature_smart_routing`: an admin who wants keyword-driven articles
             * and no lexical guessing gets exactly that.
             */
            categories={
              flags.feature_ticket_categories ? listCategoryTree() : []
            }
            triageRules={triageRules}
          />
        </div>
      </main>
    </>
  );
}
