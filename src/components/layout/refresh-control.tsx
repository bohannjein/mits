"use client";

import { ChevronDownIcon, RefreshCwIcon, RefreshCwOffIcon } from "lucide-react";

import {
  REFRESH_INTERVALS,
  REFRESH_LABELS,
  REFRESH_SHORT_LABELS,
  useAutoRefresh,
  type RefreshInterval,
} from "@/components/providers/auto-refresh";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   The refresh interval, in the header.

   In the header rather than on the queue page because the setting applies to every
   page — a reporter watching their own ticket list wants it as much as an agent
   watching the queue.

   The trigger states the current interval instead of only an icon. An unlabelled
   refresh icon says "you can reload", which the browser already offers; the number
   is the part that is actually configured, and someone who set it to "Aus" needs to
   see that a stale screen is their own setting rather than a broken page.
   ────────────────────────────────────────────────────────────────────────── */

export function RefreshControl() {
  const { minutes, setMinutes, refreshing, refreshNow } = useAutoRefresh();
  const off = minutes === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-full px-3 text-muted-foreground"
          aria-label={`Automatische Aktualisierung: ${REFRESH_LABELS[minutes]}`}
        >
          {off ? (
            <RefreshCwOffIcon strokeWidth={1.5} />
          ) : (
            <RefreshCwIcon
              strokeWidth={1.5}
              className={cn(refreshing && "animate-spin")}
            />
          )}
          <span className="hidden font-mono text-xs sm:inline">
            {REFRESH_SHORT_LABELS[minutes]}
          </span>
          <ChevronDownIcon strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 rounded-2xl border border-border shadow-elev-2"
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Seite automatisch aktualisieren
        </DropdownMenuLabel>

        <DropdownMenuRadioGroup
          value={String(minutes)}
          onValueChange={(value) =>
            setMinutes(Number(value) as RefreshInterval)
          }
        >
          {REFRESH_INTERVALS.map((interval) => (
            <DropdownMenuRadioItem key={interval} value={String(interval)}>
              {REFRESH_LABELS[interval]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {/* Manual refresh stays available with the timer off — that is the case
            where it is needed most. */}
        <div className="p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={refreshing}
            onClick={refreshNow}
            className="h-8 w-full justify-start rounded-lg px-2 text-sm font-normal"
          >
            <RefreshCwIcon
              strokeWidth={1.5}
              className={cn(refreshing && "animate-spin")}
            />
            Jetzt aktualisieren
          </Button>
        </div>

        <p className="px-2 pt-1 pb-2 text-xs leading-relaxed text-muted-foreground">
          Pausiert, solange der Tab im Hintergrund liegt, und holt beim Zurückkehren
          nach. Die Einstellung gilt für dieses Gerät.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
