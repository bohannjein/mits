import { InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { Announcement, AnnouncementLevel } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   System announcements above the portal.

   A server component: the messages come from the settings store and never change
   client-side, so there is nothing to hydrate.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * shadcn's Alert ships `default` and `destructive` only, so the middle level is
 * expressed with the semantic warning tokens rather than a new variant — the
 * colours still come from globals.css, never from a literal.
 */
const LEVEL_STYLES: Record<
  AnnouncementLevel,
  { icon: typeof InfoIcon; className: string; label: string }
> = {
  info: {
    icon: InfoIcon,
    className: "border-border",
    label: "Information",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-warning text-warning [&_[data-slot=alert-description]]:text-warning/90",
    label: "Warnung",
  },
  critical: {
    icon: OctagonAlertIcon,
    className: "border-destructive text-destructive [&_[data-slot=alert-description]]:text-destructive/90",
    label: "Störung",
  },
};

export function AnnouncementBanner({
  announcements,
}: {
  announcements: Announcement[];
}) {
  if (announcements.length === 0) return null;

  return (
    <section aria-label="Systemmeldungen" className="grid gap-3">
      {announcements.map((announcement) => {
        const level = LEVEL_STYLES[announcement.type];
        const Icon = level.icon;

        return (
          <Alert
            key={announcement.id}
            className={cn(
              "rounded-2xl px-4 py-3 shadow-elev-1",
              level.className,
            )}
          >
            <Icon strokeWidth={1.5} aria-hidden />
            <AlertTitle>
              <span className="sr-only">{level.label}: </span>
              {announcement.title}
            </AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">
              {announcement.message}
            </AlertDescription>
          </Alert>
        );
      })}
    </section>
  );
}
