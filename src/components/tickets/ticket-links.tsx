"use client";

import {
  CheckCircle2Icon,
  Link2Icon,
  Loader2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import {
  addTicketLinkAction,
  removeTicketLinkAction,
} from "@/app/actions/tickets";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_LINK_LABELS,
  TICKET_STATUS_LABELS,
  TicketLinkKind,
  formatTicketNumber,
  type MITSTicket,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket relations.

   The list only ever contains tickets the caller may open — `listLinksFor` drops
   the rest server-side, so there is nothing here that says "a ticket exists but
   is not for you".
   ────────────────────────────────────────────────────────────────────────── */

export interface LinkRow {
  id: string;
  label: string;
  otherId: string;
  otherNumber: string;
  otherTitle: string;
  otherStatus: MITSTicket["status"];
}

export function TicketLinks({
  ticketId,
  links,
  /** Sidebar variant: tighter card, no description, stacked add form. */
  compact = false,
  /** No card and no heading — the sidebar section supplies them. */
  bare = false,
}: {
  ticketId: string;
  links: LinkRow[];
  compact?: boolean;
  bare?: boolean;
}) {
  const [addResult, addAction, adding] = useActionState(addTicketLinkAction, null);
  const [removeResult, removeAction, removing] = useActionState(
    removeTicketLinkAction,
    null,
  );
  const result = addResult ?? removeResult;
  const busy = adding || removing;

  const body = <div className="grid gap-4">
        {links.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <Badge
                  variant="outline"
                  className="h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal"
                >
                  {link.label}
                </Badge>
                <Link
                  href={`/mits/tickets/${link.otherId}`}
                  className="flex min-w-0 flex-1 items-center gap-2 underline-offset-4 hover:underline"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {link.otherNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {link.otherTitle}
                  </span>
                </Link>
                <Badge
                  variant="secondary"
                  className="h-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal"
                >
                  {TICKET_STATUS_LABELS[link.otherStatus]}
                </Badge>
                <form action={removeAction} className="shrink-0">
                  <input type="hidden" name="ticketId" value={ticketId} />
                  <input type="hidden" name="linkId" value={link.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Verknüpfung entfernen"
                    disabled={busy}
                    className="rounded-full"
                  >
                    <XIcon strokeWidth={1.5} />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          action={addAction}
          className={cn(
            "grid gap-3",
            !compact && "sm:grid-cols-[13rem_1fr_auto] sm:items-end",
          )}
        >
          <input type="hidden" name="ticketId" value={ticketId} />

          <div className="grid gap-2">
            <Label htmlFor="link-kind">Beziehung</Label>
            <Select name="kind" defaultValue="relates_to" disabled={busy}>
              <SelectTrigger id="link-kind" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TicketLinkKind.options.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {TICKET_LINK_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="link-target">Ticket-Nummer</Label>
            <Input
              id="link-target"
              name="target"
              placeholder={formatTicketNumber(1042)}
              disabled={busy}
              className="h-10 rounded-xl"
            />
          </div>

          <Button
            type="submit"
            className="h-10 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={busy}
          >
            {adding ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <Link2Icon strokeWidth={1.5} />
            )}
            Verknüpfen
          </Button>
        </form>

        {result && (
          <Alert
            variant={result.ok ? "default" : "destructive"}
            className="rounded-2xl border-border px-4 py-3"
          >
            {result.ok ? (
              <CheckCircle2Icon strokeWidth={1.5} />
            ) : (
              <TriangleAlertIcon strokeWidth={1.5} />
            )}
            <AlertDescription>
              {result.ok ? result.message : result.error}
            </AlertDescription>
          </Alert>
        )}
      </div>;

  if (bare) return body;

  return (
    <Card
      className={cn(
        "border border-border bg-card ring-0 shadow-elev-1",
        compact ? "rounded-2xl" : "rounded-3xl",
      )}
    >
      <CardHeader>
        <CardTitle className={compact ? "text-sm font-medium" : "text-lg font-medium"}>
          Verknüpfungen
        </CardTitle>
        {!compact && (
          <CardDescription className="mt-1 leading-relaxed">
            Bezug zu anderen Tickets. Nur Tickets, die du selbst öffnen darfst,
            erscheinen hier.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
