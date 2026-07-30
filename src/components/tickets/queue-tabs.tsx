import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AGENT_VIEW_LABELS, AGENT_VIEWS, type AgentView } from "@/lib/agent-views";

/* ──────────────────────────────────────────────────────────────────────────
   Queue view switcher.

   Links, not a client tab component. Each view is a URL, so a view is
   bookmarkable, shareable and survives the back button — and the active one is
   already known server-side, which means no hydration and no flash of the wrong
   tab. The Radix Tabs primitive would give animation and cost all of that.
   ────────────────────────────────────────────────────────────────────────── */

export function QueueTabs({
  active,
  counts,
}: {
  active: AgentView;
  /** Per-view totals, so an agent can see where the work is without clicking. */
  counts: Record<AgentView, number>;
}) {
  return (
    <nav
      aria-label="Ansicht"
      className="flex w-full flex-wrap gap-1 rounded-full border border-border bg-card p-1.5"
    >
      {AGENT_VIEWS.map((view) => {
        const isActive = view === active;
        return (
          <Link
            key={view}
            href={`/mits?view=${view}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
              isActive
                ? "bg-inverse-surface text-inverse-surface-foreground"
                : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
            )}
          >
            {AGENT_VIEW_LABELS[view]}
            {counts[view] > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "h-auto rounded-full px-1.5 py-0 text-[11px] font-normal tabular-nums",
                  isActive && "border-inverse-surface-foreground/30",
                )}
              >
                {counts[view]}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
