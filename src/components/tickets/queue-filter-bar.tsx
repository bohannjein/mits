"use client";

import { FilterXIcon, FolderTreeIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MITSCategoryNode } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Two dropdowns that depend on each other.

   **The URL is the state.** Not component state that pushes to the URL — the
   controls read `useSearchParams()` and write it, so a shared link, the browser's
   back button and a refresh all describe the same queue. The one time this matters
   is the handover: „schau mal in diese Liste" has to be a link.

   **The subcategory is disabled until a main category is chosen**, and it is
   disabled rather than hidden: a control that appears when you touch the one
   beside it moves the row it is in, and this row sits directly above a ticket
   table. Its options are the children of whatever is selected — nothing else, so
   there is no way to combine „Software" with a subcategory of „Hardware".

   **Only the deepest choice reaches the query.** `parseTicketQuery` folds the two
   parameters into one filter and `ticketWhere` expands it over the subtree, so
   „Hardware" finds the tickets filed under „Hardware / Notebooks" too. Without
   that, the parent level would be a dropdown entry that finds nothing on every
   instance that actually uses subcategories.

   A router push rather than a GET form, unlike `TicketFilters`: there is nothing
   else in this row to submit, and a form would need a hidden field for every
   parameter the page already has in the URL — the tab, the scope, the sort, the
   page. Forgetting one of those is how a filter silently resets the view, which is
   the bug the `carry` prop over there exists to patch.
   ────────────────────────────────────────────────────────────────────────── */

/** Radix Select has no legal empty value, and „all" has to differ from „unset". */
const ANY = "__any";

export function QueueFilterBar({
  categories,
  basePath,
}: {
  categories: MITSCategoryNode[];
  /** Where the filter writes to — `/mits` for the queue. */
  basePath: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const category = params.get("category") ?? "";
  const subCategory = params.get("subCategory") ?? "";

  const children =
    categories.find((entry) => entry.id === category)?.children ?? [];

  /*
   * Rewrite the query, keeping everything that is not ours.
   *
   * Built from the current params rather than from a list of keys to preserve:
   * the page also carries `view`, `scope`, `sort`, `dir`, `q` and `page`, and an
   * allow-list is a list somebody forgets to extend. Deleting a parameter when its
   * value is empty keeps the URL honest — `?category=` in a shared link reads as a
   * filter that is set to nothing.
   */
  const navigate = (next: { category?: string; subCategory?: string }): void => {
    const query = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }

    // Any filter change invalidates the page number: page four of a narrower
    // list is not page four of the old one, and an out-of-range offset renders
    // as an empty table with no explanation.
    query.delete("page");

    const search = query.toString();
    startTransition(() => {
      router.push(search ? `${basePath}?${search}` : basePath);
    });
  };

  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <span className="flex h-10 items-center gap-2 text-sm font-medium">
        <FolderTreeIcon
          className="size-4 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
        Kategorie
      </span>

      <div className="grid min-w-44 flex-1 gap-1.5">
        <Label htmlFor="queue-category" className="text-xs">
          Hauptkategorie
        </Label>
        <Select
          value={category || ANY}
          disabled={pending}
          /*
           * Switching the main category clears the subcategory in the same
           * navigation. Keeping it would leave a child of the *previous* root in
           * the URL — a filter that matches nothing and reads as an empty queue.
           */
          onValueChange={(value) =>
            navigate({
              category: value === ANY ? "" : value,
              subCategory: "",
            })
          }
        >
          <SelectTrigger id="queue-category" className="h-10 w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Alle</SelectItem>
            {categories.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-44 flex-1 gap-1.5">
        <Label htmlFor="queue-subcategory" className="text-xs">
          Unterkategorie
        </Label>
        <Select
          value={subCategory || ANY}
          // Also disabled when the chosen root has no children: an enabled
          // dropdown whose only entry is „Alle" is a control that does nothing.
          disabled={pending || category === "" || children.length === 0}
          onValueChange={(value) =>
            navigate({ subCategory: value === ANY ? "" : value })
          }
        >
          <SelectTrigger
            id="queue-subcategory"
            className="h-10 w-full rounded-xl"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Alle</SelectItem>
            {children.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(category || subCategory) && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => navigate({ category: "", subCategory: "" })}
          className="h-10 rounded-full px-4 text-muted-foreground"
        >
          <FilterXIcon strokeWidth={1.5} />
          Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}
