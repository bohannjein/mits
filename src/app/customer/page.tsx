import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { FaqAccordion } from "@/components/dashboard/faq-accordion";
import { MaintenanceNotice } from "@/components/dashboard/maintenance-notice";
import { OpenTicketsPanel } from "@/components/dashboard/open-tickets-panel";
import { PortalActions } from "@/components/dashboard/portal-actions";
import { ResourceGrid } from "@/components/dashboard/resource-grid";
import { ServiceStatus } from "@/components/dashboard/service-status";
import { RolePreviewBanner } from "@/components/admin/role-preview-banner";
import { AppHeader } from "@/components/layout/app-header";
import { canAdminister } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import {
  listCatalogSchemasFor,
  quickTicketSchemaFor,
} from "@/lib/form-schemas";
import { visibleAreas } from "@/lib/role-visibility";
import { resolveRefreshMinutes } from "@/lib/system-settings";
import {
  getActiveAnnouncements,
  getActiveMaintenanceNotices,
  getPortalConfig,
  getPortalContent,
  getPortalFaqs,
  getPortalServices,
} from "@/lib/portal";
import { listOwnTickets } from "@/lib/tickets";
import {
  fillPortalText,
  isRestrictableRole,
  type PortalWidgetKey,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The reporter's self-service portal.

   Assembled from `portal_config`: which widgets exist, in which order, under
   which heading. Adapting an instance is an admin task in /admin/portal.

   Anonymous visitors never reach here — `/customer` requires a session and `/` is
   where the login mask lives. That split is why this page has no signed-out
   branch to keep in step with the public one.
   ────────────────────────────────────────────────────────────────────────── */

export default async function CustomerPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const user = await requireUser("/customer");
  const config = getPortalConfig();
  const titles = config.widget_titles;

  /*
   * Das Portal aus der Sicht einer anderen Rolle ansehen.
   *
   * `/admin/settings/roles` nimmt Rollen einzelne Formulare und Bereiche weg, und
   * prüfen konnte ein Admin das Ergebnis nur mit einem Testkonto: bei drei
   * Rollen, Vorlagen und einem Dutzend Formularen ist das die Einstellung mit dem
   * größten Abstand zwischen Klick und Wirkung.
   *
   * **Die Vorschau kann nur verengen.** Ein Admin ist nicht einschränkbar
   * (`RESTRICTABLE_ROLES`), jede Wahl hier nimmt also weg statt hinzuzufügen —
   * und `canAdminister` ist die Bedingung dafür, dass der Parameter überhaupt
   * gelesen wird. Ein Anwender, der `?preview=admin` anhängt, ändert nichts:
   * `isRestrictableRole` kennt den Wert nicht, und die Prüfung davor sowieso
   * nicht.
   *
   * Was **nicht** simuliert wird, sind fremde Daten. Die Ticketliste bleibt die
   * eigene — die Frage, die diese Vorschau beantwortet, ist „welche Flächen
   * bietet die Instanz dieser Rolle an", nicht „was steht bei jemand anderem
   * drin".
   */
  const requested = (await searchParams).preview;
  const previewRole =
    canAdminister(user.role) && isRestrictableRole(requested) ? requested : null;
  const effectiveRole = previewRole ?? user.role;

  /*
   * Hier stand das Erinnerungs-Widget.
   *
   * Erinnerungen sind jetzt ein Arbeitsmittel des Desks — die drei Actions in
   * `app/actions/reminders.ts` verlangen die Agentenrolle, und der Kanal
   * `reminder` ist `staffOnly`. Ein Widget hier hätte eine Liste gezeigt, deren
   * Haken die Action ablehnt.
   */

  /*
   * Was der Ticketeingang dieser Rolle noch anbietet.
   *
   * Hier aufgelöst und nicht in der Kachelkomponente: die ist ein Client-Bauteil
   * (die Icons sind React-Komponenten und überleben die Serialisierung nicht),
   * und die Regel dort noch einmal zu lesen wäre eine zweite Stelle, an der sie
   * gelten muss. Dieselbe Ableitung wie in `/customer/new` — beide fragen, ob es
   * unter dem Reiter etwas gibt.
   */
  const areas = visibleAreas(effectiveRole);
  const intakeOpen = areas.customer_new;
  const intake = {
    ai: intakeOpen && areas.intake_ai,
    catalog: intakeOpen && listCatalogSchemasFor(effectiveRole).length > 0,
    quick: intakeOpen && Boolean(quickTicketSchemaFor(effectiveRole)),
  };

  // Just the given name: "Hallo Jana" reads like a colleague, the full address
  // like a mail merge.
  const firstName = user.name.split(/\s+/)[0] || user.name;

  // Every widget is built up front and the order decides what gets rendered.
  // Cheap: each source is one indexed SQLite read.
  const widgets: Record<PortalWidgetKey, ReactNode> = {
    outages: (
      <AnnouncementBanner
        title={titles.outages}
        announcements={getActiveAnnouncements()}
      />
    ),
    maintenance: (
      <MaintenanceNotice
        title={titles.maintenance}
        notices={getActiveMaintenanceNotices()}
      />
    ),
    status: (
      <ServiceStatus title={titles.status} services={getPortalServices()} />
    ),
    active_tickets: (
      <OpenTicketsPanel
        refreshMinutes={resolveRefreshMinutes(user)}
        title={titles.active_tickets}
        initialTickets={listOwnTickets(user.id)}
      />
    ),
    faq: <FaqAccordion title={titles.faq} faqs={getPortalFaqs()} />,
    downloads: (
      <ResourceGrid
        title={titles.downloads}
        resources={getPortalContent().resources}
      />
    ),
  };

  return (
    <>
      <AppHeader />
      <main className="bg-aurora flex flex-1 flex-col items-center px-6 py-12">
        <div className="grid w-full max-w-4xl gap-8">
          {previewRole && (
            <RolePreviewBanner active={previewRole} basePath="/customer" />
          )}

          <section>
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
              {fillPortalText(config.hero_title, firstName)}
            </h1>
            {config.hero_subtitle.trim() && (
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
                {fillPortalText(config.hero_subtitle, firstName)}
              </p>
            )}
          </section>

          {/* Above the configurable widgets on purpose: it is what the portal is
              for, and burying it behind a toggle would let an admin lock everyone
              out of the intake by accident.

              Die Kacheln spiegeln, was der Eingang für diese Rolle noch anbietet.
              Ein sichtbarer Weg in eine Umleitung ist die schlechtere Antwort als
              kein Weg — dieselbe Regel wie beim Benutzermenü. */}
          <PortalActions
            label={config.ticket_button_label}
            showAi={intake.ai}
            showCatalog={intake.catalog}
            showQuick={intake.quick}
            // Nur an der Bereichs-Sichtbarkeit, nicht am Widget darunter: die
            // eigene Ticketliste war ausschließlich als abschaltbares Widget
            // erreichbar, und mit ihm aus führte der einzige Weg über das
            // Benutzermenü.
            myTicketsHref={areas.customer_tickets ? "/customer/tickets" : null}
          />

          {config.widget_order
            .filter((key) => config.enabled_widgets[key])
            .map((key) => (
              <div key={key}>{widgets[key]}</div>
            ))}
        </div>
      </main>
    </>
  );
}
