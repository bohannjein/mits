"use client";

import {
  CheckCircle2Icon,
  CornerDownRightIcon,
  FolderTreeIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveCategoriesAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ICON_NAMES, iconFor } from "@/lib/icons";
import { CATEGORY_ROOT, type MITSTicketCategory } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The category tree, as an indented list.

   Submitted whole; the server deletes what is gone. A deleted category does not
   take its tickets with it — they keep the id and render without a category,
   exactly as a deleted location does.

   **Indentation, not drag and drop.** A tree editor is where a settings mask
   usually acquires a pointer-event library, and the operation it buys is „move
   this branch", which happens once per instance. The parent is a dropdown; the
   list sorts itself by parent on every render, so the shape is visible without
   anything being dragged.

   **A root is a tile, a child is a filter entry.** That is why only roots carry
   an icon field: the intent tiles draw one per top-level category, and the
   subcategory dropdown has no room for one.
   ────────────────────────────────────────────────────────────────────────── */

export function CategoryTreeForm({
  categories: initial,
  ticketCounts,
}: {
  categories: MITSTicketCategory[];
  ticketCounts: Record<string, number>;
}) {
  const [categories, setCategories] = useState<MITSTicketCategory[]>(initial);
  const [result, formAction, saving] = useActionState(saveCategoriesAction, null);

  const patch = (id: string, next: Partial<MITSTicketCategory>) =>
    setCategories((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)),
    );

  /*
   * Removing a row removes its children with it.
   *
   * The server refuses an orphan — a category whose parent is not in the
   * submission — so leaving them behind would mean a save that fails with a
   * message about a row the admin did not touch. One level deep, because the
   * dropdown only offers roots as parents.
   */
  const remove = (id: string) =>
    setCategories((current) =>
      current.filter((entry) => entry.id !== id && entry.parent_id !== id),
    );

  const roots = categories.filter((entry) => entry.parent_id === CATEGORY_ROOT);

  /** Parent first, then its children — the reading order of a tree. */
  const ordered = roots.flatMap((root) => [
    root,
    ...categories.filter((entry) => entry.parent_id === root.id),
  ]);

  /*
   * A child whose parent vanished from the list.
   *
   * Only reachable by removing a root's *last* row while a child pointed at
   * something else, but the save would fail server-side and the message would name
   * a row that is not visible in `ordered` — so it is named here instead.
   */
  const orphans = categories.filter(
    (entry) =>
      entry.parent_id !== CATEGORY_ROOT &&
      !roots.some((root) => root.id === entry.parent_id),
  );

  const unnamed = categories.filter((entry) => !entry.name.trim()).length;

  /*
   * Names claimed twice among siblings.
   *
   * Grouped by parent, because the same name under two different roots is two
   * legitimate categories -- the unique index in the database says the same. A
   * composite key string would need a separator that cannot occur in a typed
   * name, and there is no such character; grouping needs none.
   */
  const byParent = new Map<string, string[]>();
  for (const entry of categories) {
    const name = entry.name.trim().toLowerCase();
    if (!name) continue;
    const group = byParent.get(entry.parent_id) ?? [];
    group.push(name);
    byParent.set(entry.parent_id, group);
  }

  const duplicates = new Set<string>();
  for (const group of byParent.values()) {
    for (const name of group) {
      if (group.indexOf(name) !== group.lastIndexOf(name)) duplicates.add(name);
    }
  }
  const blocked = unnamed > 0 || duplicates.size > 0 || orphans.length > 0;

  const add = (parentId: string) =>
    setCategories((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: "",
        parent_id: parentId,
        icon: "",
        order_index: current.length,
      },
    ]);

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-medium">
            <FolderTreeIcon
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            Kategorien
          </CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Hauptkategorien erscheinen als Kacheln im Ticket-Eingang und als erstes
            Auswahlfeld im Queue-Filter. Beim Entfernen bleiben Tickets erhalten,
            verlieren aber die Zuordnung.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-3">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Kategorie. Ohne Kategorien entfallen die Kacheln im
              Eingang und der Filter in der Queue.
            </p>
          )}

          {ordered.map((entry) => {
            const isRoot = entry.parent_id === CATEGORY_ROOT;
            const count = ticketCounts[entry.id] ?? 0;
            const isDuplicate = duplicates.has(entry.name.trim().toLowerCase());
            const Icon = iconFor(entry.icon);

            return (
              <div
                key={entry.id}
                className={
                  isRoot
                    ? "grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_11rem_auto] sm:items-end"
                    : "ml-6 grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_11rem_auto] sm:items-end"
                }
              >
                <div className="grid gap-2">
                  <Label htmlFor={`cat-name-${entry.id}`}>
                    {isRoot ? "Hauptkategorie" : "Unterkategorie"}
                  </Label>
                  <div className="flex items-center gap-2">
                    {!isRoot && (
                      <CornerDownRightIcon
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    )}
                    <Input
                      id={`cat-name-${entry.id}`}
                      value={entry.name}
                      onChange={(event) =>
                        patch(entry.id, { name: event.target.value })
                      }
                      placeholder={isRoot ? "Hardware" : "Notebooks"}
                      aria-invalid={isDuplicate}
                      disabled={saving}
                      className="h-10 rounded-xl"
                    />
                  </div>
                </div>

                {isRoot ? (
                  <div className="grid gap-2">
                    <Label htmlFor={`cat-icon-${entry.id}`}>Kachel-Symbol</Label>
                    <Select
                      value={entry.icon || "__none"}
                      disabled={saving}
                      onValueChange={(value) =>
                        patch(entry.id, { icon: value === "__none" ? "" : value })
                      }
                    >
                      <SelectTrigger
                        id={`cat-icon-${entry.id}`}
                        className="h-10 w-full rounded-xl"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Standard</SelectItem>
                        {ICON_NAMES.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor={`cat-parent-${entry.id}`}>Gehört zu</Label>
                    <Select
                      value={entry.parent_id}
                      disabled={saving}
                      onValueChange={(value) =>
                        patch(entry.id, { parent_id: value })
                      }
                    >
                      <SelectTrigger
                        id={`cat-parent-${entry.id}`}
                        className="h-10 w-full rounded-xl"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Roots only. A three-level tree parses and stores fine —
                            see `MITSTicketCategorySchema` — but the filter has two
                            dropdowns, so a grandchild would be reachable by URL and
                            by no control. */}
                        {roots.map((root) => (
                          <SelectItem key={root.id} value={root.id}>
                            {root.name || "(ohne Namen)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {isRoot && (
                    <span className="grid size-9 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
                      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`„${entry.name || "Kategorie"}“ entfernen`}
                    disabled={saving}
                    onClick={() => remove(entry.id)}
                    className="rounded-full"
                  >
                    <Trash2Icon strokeWidth={1.5} />
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground sm:col-span-3">
                  {count === 0
                    ? "Noch keine Tickets."
                    : `${count} Ticket(s) in dieser Kategorie.`}
                </p>

                {isRoot && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => add(entry.id)}
                    className="w-fit rounded-full px-3 text-xs sm:col-span-3"
                  >
                    <PlusIcon strokeWidth={1.5} />
                    Unterkategorie
                  </Button>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={saving}
            onClick={() => add(CATEGORY_ROOT)}
          >
            <PlusIcon strokeWidth={1.5} />
            Hauptkategorie hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input
          type="hidden"
          name="categories"
          value={JSON.stringify(categories)}
        />

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

        {blocked && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>
              {unnamed > 0 && `${unnamed} Kategorie(n) ohne Namen. `}
              {duplicates.size > 0 &&
                `Auf gleicher Ebene doppelt: ${[...duplicates].join(", ")}. `}
              {orphans.length > 0 &&
                `${orphans.length} Unterkategorie(n) ohne Hauptkategorie.`}
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          size="lg"
          className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || blocked}
        >
          {saving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SaveIcon strokeWidth={1.5} />
          )}
          {saving ? "Speichern …" : "Kategorien speichern"}
        </Button>
      </form>
    </div>
  );
}
