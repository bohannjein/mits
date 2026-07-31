import type { Metadata } from "next";

import { FaqEditor } from "@/components/admin/faq-editor";
import { PortalContentForm } from "@/components/admin/portal-content-form";
import { PortalLayoutForm } from "@/components/admin/portal-layout-form";
import { PortalOperationsForm } from "@/components/admin/portal-operations-form";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth/session";
import {
  getMaintenanceNotices,
  getPortalConfig,
  getPortalContent,
  getPortalFaqs,
  getPortalServices,
} from "@/lib/portal";

export const metadata: Metadata = {
  title: "Portal — MITS",
};

const TABS = [
  { value: "layout", label: "Layout & Texte" },
  { value: "faq", label: "Selbsthilfe" },
  { value: "operations", label: "Betrieb" },
  { value: "content", label: "Meldungen & Kacheln" },
];

export default async function AdminPortalPage() {
  // Authoritative gate: admin only.
  await requireRole("admin", "/admin/portal");

  const config = getPortalConfig();
  const content = getPortalContent();
  const faqs = getPortalFaqs();
  const services = getPortalServices();
  const maintenance = getMaintenanceNotices();

  const active = config.widget_order.filter(
    (key) => config.enabled_widgets[key],
  ).length;

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <BackLink href="/admin" label="Zurück zum Admin-Desk" />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
                Portal
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Widgets, Texte, Selbsthilfe und Betriebsmeldungen der Startseite.
                Änderungen greifen sofort, ohne Neustart.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="h-auto rounded-full px-3 py-1">
                {active} von {config.widget_order.length} Widgets aktiv
              </Badge>
            </div>
          </div>

          <Separator className="my-8 bg-border" />

          {/* Four editors, each saving on its own. Tabs rather than one long
              page: stacked, this would run to several screens of form. */}
          <Tabs defaultValue="layout" className="gap-6">
            <TabsList className="h-auto w-full flex-wrap gap-1 rounded-full border border-border bg-card p-1.5">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="h-10 rounded-full px-4 font-medium data-active:bg-inverse-surface data-active:text-inverse-surface-foreground data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-inverse-surface dark:data-active:text-inverse-surface-foreground"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="layout">
              <PortalLayoutForm config={config} />
            </TabsContent>

            <TabsContent value="faq">
              <FaqEditor faqs={faqs} />
            </TabsContent>

            <TabsContent value="operations">
              <PortalOperationsForm
                services={services}
                maintenance={maintenance}
              />
            </TabsContent>

            <TabsContent value="content">
              <PortalContentForm content={content} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </>
  );
}
