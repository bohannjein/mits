import { HistoryIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTimeShort } from "@/lib/format";
import type { AuditEntry } from "@/types/mits";
import { auditLabel } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Historie / Audit Trail.

   A server component: the entries are immutable, so there is nothing to keep in sync
   and nothing to hydrate.

   Admin-only, decided by the page that renders it. The trail names who did what, which
   is exactly the information a agent has no business reading about a colleague —
   it exists to answer "what happened to this ticket" for somebody accountable for the
   answer, not to let the team watch each other work.

   Newest last, matching the conversation above it: a history that runs the other way
   than the thread beside it makes the reader re-orient for no reason.
   ────────────────────────────────────────────────────────────────────────── */

export function AuditTrail({
  entries,
  timezone,
  /**
   * Drop the card and the heading — the sidebar section already provides both, and two
   * nested frames with two headings is what a panel looks like when a component was
   * moved without being adapted.
   */
  bare = false,
}: {
  entries: AuditEntry[];
  /** Resolved server-side, same as everywhere else — see `lib/format.ts`. */
  timezone: string;
  bare?: boolean;
}) {
  const body = (
    <>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Noch keine Änderungen protokolliert.
          </p>
        ) : (
          <ScrollArea className="max-h-64">
            <ol className="grid gap-3 pr-3">
              {entries.map((entry) => (
                <li key={entry.id} className="grid gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium">
                      {auditLabel(entry.action)}
                    </span>
                    <time className="font-mono text-[11px] text-muted-foreground">
                      {formatDateTimeShort(entry.created_at, timezone)}
                    </time>
                  </span>

                  {/* The change itself, only when there is one to show. A deletion has
                      no before-and-after, and printing an empty arrow would suggest the
                      value became nothing. */}
                  {(entry.old_value || entry.new_value) && (
                    <span className="text-xs text-muted-foreground">
                      {entry.old_value || "—"} → {entry.new_value || "—"}
                    </span>
                  )}
                  {!entry.old_value && !entry.new_value && entry.field && (
                    <span className="text-xs text-muted-foreground">{entry.field}</span>
                  )}

                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {entry.actor_email}
                  </span>
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
    </>
  );

  if (bare) return body;

  return (
    <Card className="rounded-2xl border border-border bg-card ring-0 shadow-elev-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <HistoryIcon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
          Historie
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
