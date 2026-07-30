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

export function ResourceGrid({
  resources,
  /** Overridden by the portal's widget_titles. */
  title = "Schnellzugriffe",
}: {
  resources: PortalResource[];
  title?: string;
}) {
  // Belt and braces: the store already filters, but a tile is rendered as a link
  // and must never carry a javascript:/data: target.
  const safe = resources.filter((resource) => isSafeResourceHref(resource.href));

  if (safe.length === 0) return null;

  return (
    <section aria-label={title} className="grid gap-3">
      <h2 className="label-industrial">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {safe.map((resource) => {
          const Icon = iconFor(resource.icon);
          const isDownload = resource.kind === "download";
          // Only outbound links need the new tab and the opener guard.
          const external = /^https?:/i.test(resource.href);

          return (
            <Card
              key={resource.id}
              className="group rounded-3xl border border-border bg-card ring-0 shadow-elev-1 transition-[box-shadow,border-color] duration-300 hover:border-foreground/20 hover:shadow-elev-3"
            >
              <CardHeader>
                {/* Same tonal icon circle as the intake tiles — one shape
                    language for every card that opens something. */}
                <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                  <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <CardTitle className="mt-4 font-medium">
                  {resource.label}
                </CardTitle>
                {resource.description && (
                  <CardDescription className="mt-1 leading-relaxed">
                    {resource.description}
                  </CardDescription>
                )}
                <Button
                  asChild
                  size="sm"
                  className="mt-5 w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                >
                  <a
                    href={resource.href}
                    {...(isDownload ? { download: "" } : {})}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {isDownload ? (
                      <DownloadIcon strokeWidth={1.5} />
                    ) : (
                      <ExternalLinkIcon strokeWidth={1.5} />
                    )}
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
