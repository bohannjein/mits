"use client";

import {
  CornerDownLeftIcon,
  HashIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Kbd } from "@/components/layout/shortcut-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TicketPriority,
  TicketPriorityValues,
  TicketStatus,
  formatTicketNumber,
  isElevatedPriority,
  parseTicketNumber,
  type MITSLocation,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Search overlay.

   Replaces the filter block that used to sit under the queue tabs. The filters
   were permanently on screen for an operation that happens occasionally, and they
   pushed the actual ticket list below the fold.

   Results are queried live from `/api/tickets?search=1`, which runs the same
   `parseTicketQuery` → `searchTickets` path as the queue page — the role sets the
   scope in the SQL clause before any filter, so this dialog can only ever narrow
   what the agent may already see.

   The ticket number gets its own field because it is not a search: a number is a
   jump, and typing one into a text search means waiting for a list to confirm what
   you already knew.
   ────────────────────────────────────────────────────────────────────────── */

const ANY = "__any";

/**
 * Long enough that typing a word does not fire a query per keystroke.
 *
 * Raised from 250 ms when the free-text search grew to cover payloads and the
 * whole conversation. Those are `LIKE '%…%'` scans, and better-sqlite3 is
 * synchronous — a slow one blocks the Node event loop, so a query per keystroke
 * is not merely wasted work, it stalls every other request on the instance
 * while somebody types.
 */
const DEBOUNCE_MS = 450;

export function TicketSearchDialog({
  locations,
  /** Where a hit leads. Reporters get their own detail route. */
  detailBase = "/mits/tickets",
  /** Restrict to the caller's own tickets — the API narrows, never widens. */
  ownOnly = false,
  /** Rendered as the trigger. Defaults to a search-shaped button. */
  trigger,
}: {
  locations: MITSLocation[];
  detailBase?: string;
  ownOnly?: boolean;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [q, setQ] = useState("");
  const [number, setNumber] = useState("");
  const [locationId, setLocationId] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [priority, setPriority] = useState(ANY);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [results, setResults] = useState<MITSTicket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Cmd+K / Ctrl+K anywhere on the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ search: "1" });
    if (q.trim()) params.set("q", q.trim());
    if (locationId !== ANY) params.set("locationId", locationId);
    if (status !== ANY) params.set("status", status);
    if (priority !== ANY) params.set("priority", priority);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (ownOnly) params.set("scope", "own");
    return params.toString();
  }, [q, locationId, status, priority, from, to, ownOnly]);

  // Anything set counts — an agent filtering by status alone expects results
  // without having to type a word first.
  const hasCriteria =
    q.trim() !== "" ||
    locationId !== ANY ||
    status !== ANY ||
    priority !== ANY ||
    from !== "" ||
    to !== "";

  /*
   * Debounced live query, with the in-flight one aborted on every change. Without
   * the abort a slow early response can land after a fast later one and the list
   * shows results for a query the agent has already moved on from.
   */
  useEffect(() => {
    if (!open || !hasCriteria) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/tickets?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { tickets: MITSTicket[] };
        setResults(body.tickets);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setFailed(true);
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, hasCriteria, query]);

  const parsedNumber = parseTicketNumber(number);

  const reset = () => {
    setQ("");
    setNumber("");
    setLocationId(ANY);
    setStatus(ANY);
    setPriority(ANY);
    setFrom("");
    setTo("");
    setResults(null);
  };

  const locationName = (id: string | null) =>
    locations.find((entry) => entry.id === id)?.name ?? null;

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? <SearchTrigger />}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="max-h-[85vh] gap-0 overflow-hidden rounded-3xl border border-border bg-card p-0 shadow-elev-3 sm:max-w-2xl"
        >
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="text-lg font-medium">
              Tickets suchen
            </DialogTitle>
            <DialogDescription>
              Freitext durchsucht Titel und Inhalt. Eine Ticket-Nummer springt
              direkt.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="grid gap-4 px-6 py-5">
              <div className="grid gap-2">
                <Label htmlFor="search-q">Freitext</Label>
                <div className="relative">
                  <SearchIcon
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <Input
                    id="search-q"
                    autoFocus
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder="Titel oder Inhalt"
                    className="h-10 rounded-xl pl-9"
                  />
                </div>
              </div>

              {/* Its own field and its own action: a number is a jump. */}
              <div className="grid gap-2">
                <Label htmlFor="search-number">Ticket-Nummer</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <HashIcon
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <Input
                      id="search-number"
                      value={number}
                      onChange={(event) => setNumber(event.target.value)}
                      placeholder={formatTicketNumber(1042)}
                      inputMode="numeric"
                      className="h-10 rounded-xl pl-9 font-mono"
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || parsedNumber === null) return;
                        event.preventDefault();
                        setOpen(false);
                        router.push(`/mits?q=${parsedNumber}`);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={parsedNumber === null}
                    className="h-10 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                    onClick={() => {
                      if (parsedNumber === null) return;
                      setOpen(false);
                      router.push(`/mits?q=${parsedNumber}`);
                    }}
                  >
                    <CornerDownLeftIcon strokeWidth={1.5} />
                    Öffnen
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="search-location">Standort</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger id="search-location" className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Alle Standorte</SelectItem>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                          {location.code ? ` (${location.code})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="search-status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="search-status" className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Jeder Status</SelectItem>
                      {TicketStatus.options.map((value) => (
                        <SelectItem key={value} value={value}>
                          {TICKET_STATUS_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="search-priority">Priorität</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="search-priority" className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Jede Priorität</SelectItem>
                      {TicketPriorityValues.map((value) => (
                        <SelectItem key={value} value={value}>
                          {TICKET_PRIORITY_LABELS[TicketPriority.parse(value)]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor="search-from">Von</Label>
                    <Input
                      id="search-from"
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="search-to">Bis</Label>
                    <Input
                      id="search-to"
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {hasCriteria && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="h-8 w-fit rounded-full px-3 text-xs text-muted-foreground"
                >
                  Filter zurücksetzen
                </Button>
              )}
            </div>

            {/* ── live results ─────────────────────────────────────────── */}
            <div className="border-t border-border">
              {!hasCriteria ? (
                <p className="px-6 py-5 text-sm text-muted-foreground">
                  Ein Kriterium eingeben — Ergebnisse erscheinen hier.
                </p>
              ) : failed ? (
                <p className="px-6 py-5 text-sm text-destructive">
                  Die Suche ist fehlgeschlagen. Bitte erneut versuchen.
                </p>
              ) : loading && results === null ? (
                <p className="flex items-center gap-2 px-6 py-5 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" strokeWidth={1.5} />
                  Suche läuft …
                </p>
              ) : results && results.length === 0 ? (
                <p className="px-6 py-5 text-sm text-muted-foreground">
                  Keine Treffer.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {results?.map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        href={`${detailBase}/${ticket.id}`}
                        onClick={() => setOpen(false)}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-6 py-3 transition-colors hover:bg-accent"
                      >
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatTicketNumber(ticket.ticket_number)}
                        </span>
                        <span className="min-w-40 flex-1 truncate text-sm">
                          {ticket.title}
                        </span>
                        <Badge
                          variant="secondary"
                          className="h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal"
                        >
                          {TICKET_STATUS_LABELS[ticket.status]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal",
                            isElevatedPriority(ticket.priority) &&
                              "border-destructive/40 text-destructive",
                          )}
                        >
                          {TICKET_PRIORITY_LABELS[ticket.priority]}
                        </Badge>
                        {locationName(ticket.location_id) && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {locationName(ticket.location_id)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The default trigger: looks like a search field, behaves like a button. */
function SearchTrigger() {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 w-full justify-start gap-2 rounded-xl px-3 text-muted-foreground sm:w-72"
    >
      <SearchIcon strokeWidth={1.5} />
      <span className="flex-1 text-left text-sm font-normal">
        Ticket suchen …
      </span>
      {/* The same badge component every other shortcut uses — three hand-rolled
          variants of this had already drifted on padding. Both modifiers are not
          named: the page does not know which platform it is on, and Strg is the
          one this application is written in. */}
      <Kbd keys={["Strg", "K"]} />
    </Button>
  );
}
