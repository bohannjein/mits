"use client";

import { PanelRightCloseIcon, PanelRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   The two-column frame every detail view uses.

   One component rather than the same grid copied per page: the tricky part is not the
   two columns, it is that each side scrolls on its own while the page as a whole does
   not — and that requires `min-h-0` on every ancestor between the viewport and the
   scroll container. Miss one and the column grows instead of scrolling, which looks
   like the layout working until the content is long enough. Copied per page, that is
   four chances to miss it.

   The toggle collapses the sidebar rather than moving it below the content. Stacking it
   is what the request is against, and on a narrow screen the meta panel is exactly what
   somebody wants out of the way while reading the thread.

   Client component only for that toggle. Both slots are rendered by the server page and
   passed in, so nothing about the content becomes client-side.
   ────────────────────────────────────────────────────────────────────────── */

export function SplitView({
  header,
  main,
  sidebar,
  /** Shown on the toggle, so the button names what it hides. */
  sidebarLabel = "Details",
  /** Narrower for a list/detail pairing than for a thread plus metadata. */
  sidebarWidth = "22rem",
}: {
  /** Back link and title — outside the scroll areas, so it stays put. */
  header?: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
  sidebarLabel?: string;
  sidebarWidth?: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    /*
     * `min-h-0` here is load-bearing. The parent is a flex column with `flex-1`, and
     * without this a flex child refuses to shrink below its content — the inner
     * `overflow-y-auto` would then never have a bounded height and the page would grow
     * a scrollbar instead of the columns.
     */
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {header && (
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 pb-4">
          <div className="min-w-0 flex-1">{header}</div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="h-8 shrink-0 rounded-full px-3 text-xs text-muted-foreground"
          >
            {open ? (
              <PanelRightCloseIcon strokeWidth={1.5} />
            ) : (
              <PanelRightIcon strokeWidth={1.5} />
            )}
            <span className="hidden sm:inline">
              {open ? "Ausblenden" : sidebarLabel}
            </span>
          </Button>
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-6",
          // One column when collapsed, so the main area takes the whole width rather
          // than leaving a gap where the sidebar was.
          open ? "lg:grid-cols-[minmax(0,1fr)_var(--sidebar-w)]" : "lg:grid-cols-1",
        )}
        style={{ "--sidebar-w": sidebarWidth } as React.CSSProperties}
      >
        {/* Its own scroll zone. `min-w-0` as well as `min-h-0`: a wide code block or a
            table inside would otherwise stretch the grid column instead of scrolling. */}
        <section className="flex min-h-0 min-w-0 flex-col">{main}</section>

        {open && (
          <aside
            className={cn(
              "hidden min-h-0 flex-col overflow-y-auto lg:flex",
              // The subtle lift the design language asks for, from tokens rather than
              // a literal colour.
              "rounded-2xl border border-border bg-surface-elevated/40 p-4",
            )}
          >
            {sidebar}
          </aside>
        )}
      </div>

      {/*
        Below `lg` the sidebar is not a column at all — there is no room for two. It
        follows the main area, which is the one case where stacking is the honest answer:
        a 380 px viewport cannot show both, and hiding the metadata outright would make
        the status dropdowns unreachable on a phone.
      */}
      {open && <div className="mt-6 grid gap-4 lg:hidden">{sidebar}</div>}
    </div>
  );
}
