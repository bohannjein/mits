"use client";

import { LinkIcon, Loader2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  addCIRelationAction,
  removeCIRelationAction,
} from "@/app/mits/cmdb/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLatestResult } from "@/hooks/use-latest-result";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CIRelationKind,
  CI_RELATION_INVERSE_LABELS,
  CI_RELATION_LABELS,
  CI_TYPE_LABELS,
  type MITSConfigurationItem,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Relations of one item.

   The list is handed in resolved — a row whose other end is gone was already dropped
   server-side, so there is nothing here that renders as "unknown".

   Picking a target is a filter-as-you-type over the candidates rather than a Select
   with every asset in it: an inventory of a few hundred items makes a dropdown useless,
   and a free-text id field makes a typo a silent wrong link.
   ────────────────────────────────────────────────────────────────────────── */

export interface RelationView {
  id: string;
  kind: string;
  inverted: boolean;
  other: MITSConfigurationItem;
}

export function CIRelations({
  itemId,
  relations,
  candidates,
}: {
  itemId: string;
  relations: RelationView[];
  /** Every other live item. Filtered in the browser; the list is already loaded. */
  candidates: MITSConfigurationItem[];
}) {
  const [addResult, addAction, adding] = useActionState(addCIRelationAction, null);
  const [removeResult, removeAction, removing] = useActionState(
    removeCIRelationAction,
    null,
  );
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<string>("depends_on");

  const result = useLatestResult(addResult, removeResult);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? candidates
        .filter(
          (item) =>
            item.name.toLowerCase().includes(needle) ||
            item.asset_tag.toLowerCase().includes(needle),
        )
        .slice(0, 6)
    : [];

  const chosen = candidates.find((item) => item.id === target);

  return (
    <div className="grid gap-3">
      {relations.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Beziehungen.</p>
      ) : (
        <ul className="grid gap-2">
          {relations.map((relation) => {
            const label = relation.inverted
              ? CI_RELATION_INVERSE_LABELS[
                  relation.kind as keyof typeof CI_RELATION_INVERSE_LABELS
                ]
              : CI_RELATION_LABELS[
                  relation.kind as keyof typeof CI_RELATION_LABELS
                ];

            return (
              <li
                key={relation.id}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Link
                    href={`/mits/cmdb/${relation.other.id}`}
                    className="block truncate text-sm hover:underline"
                  >
                    {relation.other.name}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {CI_TYPE_LABELS[relation.other.type]}
                    {relation.other.asset_tag ? ` · ${relation.other.asset_tag}` : ""}
                  </p>
                </div>

                <form action={removeAction}>
                  <input type="hidden" name="relationId" value={relation.id} />
                  <input type="hidden" name="fromCi" value={itemId} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Beziehung entfernen"
                    disabled={removing}
                    className="rounded-full"
                  >
                    <XIcon strokeWidth={1.5} />
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <form action={addAction} className="grid gap-2 border-t border-border pt-3">
        <input type="hidden" name="fromCi" value={itemId} />
        <input type="hidden" name="toCi" value={target} />

        <Label htmlFor={`relation-kind-${itemId}`} className="text-xs">
          Beziehung
        </Label>
        <Select value={kind} onValueChange={setKind} name="kind" disabled={adding}>
          <SelectTrigger id={`relation-kind-${itemId}`} className="h-9 w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CIRelationKind.options.map((option) => (
              <SelectItem key={option} value={option}>
                {CI_RELATION_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {chosen ? (
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{chosen.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Andere Auswahl"
              onClick={() => {
                setTarget("");
                setQuery("");
              }}
              className="rounded-full"
            >
              <XIcon strokeWidth={1.5} />
            </Button>
          </div>
        ) : (
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Objekt suchen"
              aria-label="Zielobjekt suchen"
              disabled={adding}
              className="h-9 rounded-xl"
            />
            {matches.length > 0 && (
              <ul className="grid gap-1">
                {matches.map((item) => (
                  <li key={item.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setTarget(item.id)}
                      className="h-auto w-full justify-start rounded-xl px-3 py-2 text-left"
                    >
                      <span className="min-w-0 truncate">
                        {item.name}
                        {item.asset_tag ? ` · ${item.asset_tag}` : ""}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {result && !result.ok && (
          <Alert variant="destructive" className="rounded-xl border-border px-3 py-2">
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription className="text-xs">{result.error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          size="sm"
          disabled={adding || !target}
          className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
        >
          {adding ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <LinkIcon strokeWidth={1.5} />
          )}
          Verknüpfen
        </Button>
      </form>
    </div>
  );
}
