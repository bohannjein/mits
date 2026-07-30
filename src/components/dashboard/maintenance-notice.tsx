import { CalendarClockIcon } from "lucide-react";

import type { PortalMaintenance } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Planned maintenance.

   Separate from the announcement banner on purpose: an outage is happening now
   and belongs at the top of the page, a maintenance window is scheduled and
   should not read like a fault.
   ────────────────────────────────────────────────────────────────────────── */

export function MaintenanceNotice({
  title,
  notices,
}: {
  title: string;
  notices: PortalMaintenance[];
}) {
  if (notices.length === 0) return null;

  return (
    <section aria-label={title} className="grid gap-3">
      <h2 className="label-industrial">{title}</h2>

      <div className="grid gap-3">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="flex gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-elev-1"
          >
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
              <CalendarClockIcon
                className="size-4"
                strokeWidth={1.5}
                aria-hidden
              />
            </span>
            <div className="grid min-w-0 gap-1">
              <span className="text-sm font-medium">{notice.title}</span>
              {notice.window && (
                <span className="text-xs text-muted-foreground">
                  {notice.window}
                </span>
              )}
              {notice.note && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {notice.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
