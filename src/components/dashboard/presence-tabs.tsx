"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PRESENCE_LABELS, type PresenceState } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Who is around, split into staff and reporters.

   A client component only because Radix's Tabs is one. Everything time-dependent is
   already resolved: the state and the "vor N Min." text arrive as finished values
   from the server. Computing them here would mean calling `Date.now()` during
   render, which differs between the server pass and hydration — a mismatch on a
   component whose whole job is to say how long ago something happened.

   Rows are one line and the list scrolls at a fixed height, so a long reporter list
   cannot push the statistics out of the sidebar.
   ────────────────────────────────────────────────────────────────────────── */

/** Green / yellow / grey. A deliberate correction — do not revert to grey for idle. */
const DOT: Record<PresenceState, string> = {
  active: "bg-success",
  idle: "bg-warning",
  offline: "bg-muted-foreground/50",
};

const TEXT: Record<PresenceState, string> = {
  active: "text-success",
  idle: "text-warning",
  offline: "text-muted-foreground",
};

export interface PresenceRow {
  id: string;
  name: string;
  state: PresenceState;
  /** Pre-formatted on the server, e.g. "vor 3 Min.". */
  seenLabel: string;
}

export function PresenceTabs({
  staff,
  reporters,
}: {
  staff: PresenceRow[];
  reporters: PresenceRow[];
}) {
  return (
    <Tabs defaultValue="staff" className="gap-2">
      <TabsList className="h-auto w-full gap-1 rounded-full border border-border bg-card p-1">
        <PresenceTrigger value="staff" label="Technik" rows={staff} />
        <PresenceTrigger value="reporters" label="Anwender" rows={reporters} />
      </TabsList>

      <TabsContent value="staff">
        <PresenceRows rows={staff} empty="Keine Technik-Konten." />
      </TabsContent>
      <TabsContent value="reporters">
        <PresenceRows rows={reporters} empty="Keine Anwender-Konten." />
      </TabsContent>
    </Tabs>
  );
}

/** The active count rides on the tab, which saves a line above the list. */
function PresenceTrigger({
  value,
  label,
  rows,
}: {
  value: string;
  label: string;
  rows: PresenceRow[];
}) {
  const active = rows.filter((row) => row.state === "active").length;

  return (
    <TabsTrigger
      value={value}
      className="h-8 flex-1 rounded-full px-3 text-xs font-medium data-active:bg-inverse-surface data-active:text-inverse-surface-foreground data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-inverse-surface dark:data-active:text-inverse-surface-foreground"
    >
      {label}
      <Badge
        variant="secondary"
        className="ml-1.5 h-auto rounded-full px-1.5 py-0 text-[10px] font-normal tabular-nums"
      >
        {active}/{rows.length}
      </Badge>
    </TabsTrigger>
  );
}

function PresenceRows({
  rows,
  empty,
}: {
  rows: PresenceRow[];
  empty: string;
}) {
  /*
   * A message rather than nothing. With two tabs an empty panel is
   * indistinguishable from a broken one — the "nothing to show means no block" rule
   * still applies, but one level up, to the whole section.
   */
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <ScrollArea className="max-h-56 overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2",
              row.state === "offline" && "opacity-70",
            )}
          >
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", DOT[row.state])}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
            <span className={cn("shrink-0 text-xs", TEXT[row.state])}>
              {PRESENCE_LABELS[row.state]}
            </span>
            <span className="w-20 shrink-0 truncate text-right text-[11px] text-muted-foreground">
              {row.seenLabel}
            </span>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
