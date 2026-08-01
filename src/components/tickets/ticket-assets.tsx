"use client";

import { LinkIcon, Loader2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  attachCIToTicketAction,
  detachCIFromTicketAction,
} from "@/app/mits/cmdb/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CIIcon } from "@/components/tickets/ci-icon";
import { Input } from "@/components/ui/input";
import { CI_TYPE_LABELS, type CIType } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Assets a ticket is about.

   Suggestions first: the reporter's own assigned items and then everything at their
   site. Those are the two answers to "which device is this" that do not require the
   agent to know the inventory by heart. A suggestion is not a filter — search stays
   available, because the thing somebody is complaining about is regularly not the one on
   their desk.

   The rows carry no status or owner. This panel answers "which thing", the CMDB page
   answers everything else, and a link is one click away.
   ────────────────────────────────────────────────────────────────────────── */

export interface AssetRow {
  id: string;
  name: string;
  type: CIType;
  assetTag: string;
}

export function TicketAssets({
  ticketId,
  attached,
  suggestions,
  /** Everything live, for the search. Already loaded by the page. */
  candidates,
}: {
  ticketId: string;
  attached: AssetRow[];
  /**
   * Two groups, not one list.
   *
   * "This is the reporter's laptop" and "this is something else at their site"
   * deserve different confidence, and merged the agent cannot tell which is
   * which — on a shared site the first plausible name is regularly the wrong
   * device.
   */
  suggestions: { assigned: AssetRow[]; onSite: AssetRow[] };
  candidates: AssetRow[];
}) {
  const [attachResult, attachAction, attaching] = useActionState(
    attachCIToTicketAction,
    null,
  );
  const [detachResult, detachAction, detaching] = useActionState(
    detachCIFromTicketAction,
    null,
  );
  const [query, setQuery] = useState("");

  const result = attachResult ?? detachResult;
  const attachedIds = new Set(attached.map((row) => row.id));

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? candidates
        .filter(
          (row) =>
            !attachedIds.has(row.id) &&
            (row.name.toLowerCase().includes(needle) ||
              row.assetTag.toLowerCase().includes(needle)),
        )
        .slice(0, 6)
    : [];

  return (
    <div className="grid gap-3">
      {attached.length === 0 ? (
        <p className="text-xs text-muted-foreground">Kein Objekt verknüpft.</p>
      ) : (
        <ul className="grid gap-2">
          {attached.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"
            >
              <CIIcon type={row.type} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/mits/cmdb/${row.id}`}
                  className="block truncate text-sm hover:underline"
                >
                  {row.name}
                </Link>
                <p className="truncate text-[11px] text-muted-foreground">
                  {CI_TYPE_LABELS[row.type]}
                  {row.assetTag ? ` · ${row.assetTag}` : ""}
                </p>
              </div>

              <form action={detachAction}>
                <input type="hidden" name="ticketId" value={ticketId} />
                <input type="hidden" name="ciId" value={row.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${row.name} entfernen`}
                  disabled={detaching}
                  className="rounded-full"
                >
                  <XIcon strokeWidth={1.5} />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {suggestions.assigned.length > 0 && (
        <SuggestionGroup
          title="Dem Melder zugewiesen"
          rows={suggestions.assigned}
          ticketId={ticketId}
          action={attachAction}
          busy={attaching}
        />
      )}

      {suggestions.onSite.length > 0 && (
        <SuggestionGroup
          title="Am selben Standort"
          rows={suggestions.onSite}
          ticketId={ticketId}
          action={attachAction}
          busy={attaching}
        />
      )}

      <div className="grid gap-2 border-t border-border pt-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Objekt suchen"
          aria-label="Objekt suchen"
          disabled={attaching}
          className="h-9 rounded-xl"
        />

        {matches.map((row) => (
          <form key={row.id} action={attachAction}>
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="ciId" value={row.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={attaching}
              className="h-auto w-full justify-start rounded-xl px-3 py-2 text-left"
            >
              {attaching ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <LinkIcon strokeWidth={1.5} />
              )}
              <CIIcon type={row.type} />
              <span className="min-w-0 flex-1 truncate">
                {row.name}
                {row.assetTag ? ` · ${row.assetTag}` : ""}
              </span>
            </Button>
          </form>
        ))}
      </div>

      {result && !result.ok && (
        <Alert variant="destructive" className="rounded-xl border-border px-3 py-2">
          <TriangleAlertIcon strokeWidth={1.5} />
          <AlertDescription className="text-xs">{result.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * One labelled block of attachable objects.
 *
 * Extracted because there are two of them and they differ only in the heading —
 * two copies would be two places for the next change to the row layout, and the
 * one that gets missed is whichever group the author was not looking at.
 */
function SuggestionGroup({
  title,
  rows,
  ticketId,
  action,
  busy,
}: {
  title: string;
  rows: AssetRow[];
  ticketId: string;
  action: (payload: FormData) => void;
  busy: boolean;
}) {
  return (
    <div className="grid gap-1 border-t border-border pt-3">
      <span className="label-industrial">{title}</span>
      {rows.map((row) => (
        <form key={row.id} action={action}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="ciId" value={row.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="h-auto w-full justify-start rounded-xl px-3 py-2 text-left"
          >
            <CIIcon type={row.type} />
            <span className="min-w-0 flex-1 truncate">
              {row.name}
              {row.assetTag ? ` · ${row.assetTag}` : ""}
            </span>
          </Button>
        </form>
      ))}
    </div>
  );
}
