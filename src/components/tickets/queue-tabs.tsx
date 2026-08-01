import Link from "next/link";
import { UserIcon, UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AGENT_SCOPES,
  AGENT_SCOPE_LABELS,
  AGENT_VIEW_LABELS,
  viewsForScope,
  type AgentScope,
  type AgentView,
} from "@/lib/agent-views";

/* ──────────────────────────────────────────────────────────────────────────
   Scope switcher and view tabs.

   Links, not a client component. Every combination is a URL, so a view is
   bookmarkable and shareable, the back button works, and the active one is known
   server-side — no hydration and no flash of the wrong tab.

   Icons only from lucide, never a pictograph in the label: an emoji renders in
   whatever the operating system feels like and cannot inherit the text colour.
   ────────────────────────────────────────────────────────────────────────── */

const SCOPE_ICONS: Record<AgentScope, typeof UsersIcon> = {
  pool: UsersIcon,
  mine: UserIcon,
};

export function QueueTabs({
  scope,
  view,
  counts,
  actions,
}: {
  scope: AgentScope;
  view: AgentView;
  /** Totals for the current scope, so the badges show where the work is. */
  counts: Record<AgentView, number>;
  /**
   * Pills that sit beside the scope switcher — links out of the queue, not views
   * of it.
   *
   * Beside it, deliberately **not** inside. The switcher is a segmented control:
   * exactly one of its options is active at all times, and dropping a link into
   * that group would make "CMDB" look like a third thing the queue can be
   * filtered to. Same row because they are the same rank of navigation, own
   * container because they answer a different question.
   */
  actions?: React.ReactNode;
}) {
  const views = viewsForScope(scope);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          Segmented control. Two links styled as one control rather than a
          <fieldset> of radios: the state lives in the URL, so there is nothing to
          submit.

          `h-11` on the group as well as on the action pills beside it. Without it
          the switcher measures its own padding — 4 + 36 + 4 plus the border — and
          comes out two pixels taller than the buttons in the same row, which
          `items-center` then turns into a one-pixel offset on both edges. Two
          controls of the same rank on one line have to be the same height.
        */}
        <div
          role="group"
          aria-label="Zuständigkeit"
          className="inline-flex h-11 w-fit items-center gap-1 rounded-full border border-border bg-card p-1"
        >
          {AGENT_SCOPES.map((candidate) => {
            const Icon = SCOPE_ICONS[candidate];
            const isActive = candidate === scope;

            /*
             * Switching scope always lands on that scope's first tab — Eingang in
             * the pool, Offen in "Mein Bereich".
             *
             * Carrying the current view across looked tidy and read as nothing
             * happening: the tab bar stayed on "Offen" and only the list changed,
             * so the switch gave no feedback that it had worked. Starting at the
             * front also matches what each scope is for — the pool is triaged from
             * its inbox, one's own area from what is still open.
             */
            const target = viewsForScope(candidate)[0];

            return (
              <Link
                key={candidate}
                href={`/mits?scope=${candidate}&view=${target}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-inverse-surface text-inverse-surface-foreground"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                {AGENT_SCOPE_LABELS[candidate]}
              </Link>
            );
          })}
        </div>

        {actions}
      </div>

      <nav
        aria-label="Ansicht"
        className="flex w-full flex-wrap gap-1 rounded-full border border-border bg-card p-1.5"
      >
        {views.map((candidate) => {
          const isActive = candidate === view;
          // Escalated carries a red accent even when inactive: it is the tab that
          // should catch an eye that is not looking for it.
          const isEscalated = candidate === "escalated";

          return (
            <Link
              key={candidate}
              href={`/mits?scope=${scope}&view=${candidate}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                isActive
                  ? "bg-inverse-surface text-inverse-surface-foreground"
                  : isEscalated && counts[candidate] > 0
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
              )}
            >
              {AGENT_VIEW_LABELS[candidate]}
              {counts[candidate] > 0 && (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-auto rounded-full px-1.5 py-0 text-[11px] font-normal tabular-nums",
                    isActive
                      ? "border-inverse-surface-foreground/30"
                      : isEscalated && "border-destructive/40 text-destructive",
                  )}
                >
                  {counts[candidate]}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
