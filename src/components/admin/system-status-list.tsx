"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { ConnectionDot } from "@/components/layout/connection-dot";
import { cn } from "@/lib/utils";
import type { StatusTone, SystemStatusRow } from "@/lib/system-status";

/* ──────────────────────────────────────────────────────────────────────────
   The subsystem list.

   A client component for one reason: the live-connection row. Everything else
   arrives already decided from the server — this file draws it and does not
   compute anything, so a subsystem added in `lib/system-status.ts` shows up
   here without a change.

   The dot repeats what the state word says. Colour alone would be the one
   thing a red-green colour blind reader cannot use, and this list is read in
   exactly the situation where guessing is expensive.
   ────────────────────────────────────────────────────────────────────────── */

const DOT: Record<StatusTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  off: "bg-muted-foreground/50",
};

export function SystemStatusList({ rows }: { rows: SystemStatusRow[] }) {
  return (
    <div className="grid gap-2">
      <RealtimeRow />
      {rows.map((row) => (
        <StatusRow key={row.key} row={row} />
      ))}
    </div>
  );
}

function StatusRow({ row }: { row: SystemStatusRow }) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[row.tone])}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{row.label}</span>
          <span className="text-sm text-muted-foreground">{row.state}</span>
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {row.detail}
        </span>
      </span>
      {row.href && (
        <ArrowRightIcon
          aria-hidden
          strokeWidth={1.5}
          className="mt-1 size-4 shrink-0 text-muted-foreground"
        />
      )}
    </>
  );

  const className =
    "flex items-start gap-3 rounded-2xl border border-border px-4 py-3";

  if (!row.href) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link
      href={row.href}
      // Background changes on hover, foreground stays at full contrast — a row
      // whose label fades under the cursor is the one thing the hover rule
      // exists to prevent.
      className={cn(className, "transition-colors hover:bg-surface-elevated")}
    >
      {body}
    </Link>
  );
}

/**
 * The live connection, which only the browser can know.
 *
 * This is where the header's dot went. Here it answers a question somebody
 * came to this page with; in the header it announced a working connection all
 * day to people who could not act on it.
 */
function RealtimeRow() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border px-4 py-3">
      <span className="mt-0.5 shrink-0">
        <ConnectionDot />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Live-Verbindung</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          Gilt für diesen Tab. Ohne sie fragen die Seiten in Abständen nach,
          statt sofort zu aktualisieren.
        </span>
      </span>
    </div>
  );
}
