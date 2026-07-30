import { DownloadIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { iconFor } from "@/lib/icons";
import { isSafeResourceHref, type PortalResource } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Quick-access tiles: the things people open before they file a ticket.

   Plain hyperlinks, not a router push — half of these point at downloads and
   external documentation.
   ────────────────────────────────────────────────────────────────────────── */

export function ResourceGrid({ resources }: { resources: PortalResource[] }) {
  // Belt and braces: the store already filters, but a tile is rendered as a link
  // and must never carry a javascript:/data: target.
  const safe = resources.filter((resource) => isSafeResourceHref(resource.href));

  if (safe.length === 0) return null;

  return (
    <section aria-label="Schnellzugriffe" className="grid gap-3">
      <h2 className="label-industrial">Schnellzugriffe</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {safe.map((resource) => {
          const Icon = iconFor(resource.icon);
          const isDownload = resource.kind === "download";
          // Only outbound links need the new tab and the opener guard.
          const external = /^https?:/i.test(resource.href);

          return (
            <Card
              key={resource.id}
              className="rounded-sm border-2 border-border shadow-brutal ring-0 transition-shadow hover:shadow-brutal-primary"
            >
              <CardHeader>
                <Icon className="size-6 text-primary" aria-hidden />
                <CardTitle className="mt-3 uppercase">{resource.label}</CardTitle>
                {resource.description && (
                  <CardDescription>{resource.description}</CardDescription>
                )}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-4 w-fit rounded-sm"
                >
                  <a
                    href={resource.href}
                    {...(isDownload ? { download: "" } : {})}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {isDownload ? <DownloadIcon /> : <ExternalLinkIcon />}
                    {isDownload ? "Herunterladen" : "Öffnen"}
                  </a>
                </Button>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
