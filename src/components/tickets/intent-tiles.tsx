"use client";

import { ArrowLeftIcon, CheckIcon, LayoutGridIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { iconFor } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { MITSCategoryNode, MITSTicketCategory } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   „Worum geht es?" as tiles, in two steps.

   A dropdown with forty leaves asks somebody to know the desk's filing system
   before they are allowed to describe their problem. Two rounds of tiles ask two
   questions they can answer: what kind of thing, and then which one — Intention,
   dann Szenario.

   **The queue assignment is invisible.** A reporter picks „Notebook", and what
   gets stored is a category id that the queue filters on. Nothing here says
   „Hardware / Notebooks" or „Queue", because the reporter has no queue and the
   words would only invite them to guess at the org chart.

   **Skippable, always.** The category is optional in the draft schema and it stays
   optional here: somebody who only wants to describe what is broken should not have
   to file it first. An unanswered question is a question for the desk; a forced one
   is a wall in front of a support request. Same call the chat intake's three pills
   already make.

   Icons come from the category rows via `iconFor`, so an admin naming `Laptop`,
   `KeyRound` or `AppWindow` in the tree changes the tile without anybody editing
   this file. An unset or unknown name falls back to the ticket icon rather than
   rendering an empty circle — `iconFor` is an allow-list, not a dynamic lookup,
   because those names are admin input and resolving them dynamically would pull
   the whole lucide set into the bundle.
   ────────────────────────────────────────────────────────────────────────── */

export function IntentTiles({
  categories,
  /** Chosen leaf, or null. Owned by the container so every mode stamps the same one. */
  value,
  onChange,
  /** Which root is open. Also the container's, so a re-render does not fold it up. */
  openRoot,
  onOpenRoot,
}: {
  categories: MITSCategoryNode[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  openRoot: string | null;
  onOpenRoot: (rootId: string | null) => void;
}) {
  if (categories.length === 0) return null;

  const root = categories.find((entry) => entry.id === openRoot) ?? null;

  /*
   * Chosen and collapsed: one line with the answer and a way back.
   *
   * Not the tile grid with one tile highlighted — that keeps nine choices on
   * screen after the choice has been made, above a form that is the actual task.
   */
  if (value) {
    const chosen = labelFor(categories, value);
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <CheckIcon
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm">{chosen}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            onOpenRoot(null);
          }}
          className="h-8 rounded-full px-3 text-xs text-muted-foreground"
        >
          Ändern
        </Button>
      </div>
    );
  }

  const tiles: MITSTicketCategory[] = root ? root.children : categories;

  /*
   * A root without children is a leaf: choosing it is the whole answer, so it is
   * stored on the first click rather than opening an empty second step.
   */
  const choose = (entry: MITSTicketCategory): void => {
    if (root) {
      onChange(entry.id);
      return;
    }
    const node = categories.find((candidate) => candidate.id === entry.id);
    if (node && node.children.length > 0) {
      onOpenRoot(entry.id);
      return;
    }
    onChange(entry.id);
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-card px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {root ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenRoot(null)}
            className="h-8 rounded-full px-3 text-xs"
          >
            <ArrowLeftIcon strokeWidth={1.5} />
            Zurück
          </Button>
        ) : (
          <LayoutGridIcon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
        <span className="text-sm font-medium">
          {root ? root.name : "Worum geht es?"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            onOpenRoot(null);
          }}
          className="ml-auto h-8 rounded-full px-3 text-xs text-muted-foreground"
        >
          Überspringen
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((entry) => {
          const Icon = iconFor(entry.icon);
          return (
            <Button
              key={entry.id}
              type="button"
              onClick={() => choose(entry)}
              className={cn(
                "h-auto flex-col items-start gap-2 rounded-2xl border border-border bg-surface-elevated px-3 py-3 text-left font-normal",
                "transition-[box-shadow,border-color] duration-300 hover:border-foreground/20 hover:bg-accent hover:text-accent-foreground hover:shadow-elev-3",
              )}
            >
              <span className="grid size-9 place-items-center rounded-full bg-card text-muted-foreground">
                <Icon className="size-4" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="w-full truncate text-sm">{entry.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * `Hardware / Notebooks` for a leaf id.
 *
 * Walked over the two-level tree the component already has rather than asking the
 * server: this runs in the browser, and the shape it was handed is the shape the
 * label needs.
 */
function labelFor(categories: MITSCategoryNode[], id: string): string {
  const root = categories.find((entry) => entry.id === id);
  if (root) return root.name;

  for (const entry of categories) {
    const child = entry.children.find((candidate) => candidate.id === id);
    if (child) return `${entry.name} / ${child.name}`;
  }

  // A category deleted between the render and the click. The id still submits and
  // the server rejects it; saying "unbekannt" here would be a label nobody chose.
  return "";
}
