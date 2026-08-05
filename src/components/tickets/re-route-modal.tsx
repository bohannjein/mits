"use client";

import {
  ArrowRightLeftIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { setTicketCategoryAction } from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryPathLabel, type MITSCategoryNode } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Correcting the queue, in one dialog.

   The counterpart to the automatic filing: a rule or a reporter put this ticket
   somewhere, and this is where an agent says otherwise. Two dropdowns like the
   queue filter, for the same reason — a flat list of every leaf on an instance
   with six roots is forty entries in a dialog.

   **The suggestion is offered, never applied.** When the model has left a routing
   hint on the ticket it appears as one button that fills the two dropdowns; the
   save is still a separate press. That is the rule from `services/ai/routing.ts`
   restated on a surface where it would be tempting to break: a dialog that
   pre-selected the model's answer would be a dialog most people confirm without
   reading, which is the same thing as letting the model write.

   **„Keine Kategorie" is a real choice.** A ticket wrongly filed is worse than one
   honestly unfiled, because only the second one shows up when somebody goes
   looking for what still needs sorting.
   ────────────────────────────────────────────────────────────────────────── */

/** Radix Select has no legal empty value; a real id can never collide with these. */
const NONE = "__none";

export function ReRouteModal({
  ticketId,
  categories,
  currentCategoryId,
  /**
   * What the model thinks, resolved to a real category by the server — or null.
   *
   * A resolved node, not a raw tag: the routing hint names a *form schema*, and
   * mapping that to a category is a decision with a table behind it. Doing it here
   * would mean this component guessing from strings.
   */
  suggestion,
  open,
  onOpenChange,
}: {
  ticketId: string;
  categories: MITSCategoryNode[];
  currentCategoryId: string | null;
  suggestion: { id: string; path: string[] } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(setTicketCategoryAction, null);

  /** Root of the current leaf, so the dialog opens on what the ticket actually is. */
  const rootOf = (leafId: string | null): string => {
    if (!leafId) return NONE;
    if (categories.some((entry) => entry.id === leafId)) return leafId;
    const parent = categories.find((entry) =>
      entry.children.some((child) => child.id === leafId),
    );
    return parent?.id ?? NONE;
  };

  const [root, setRoot] = useState(() => rootOf(currentCategoryId));
  const [leaf, setLeaf] = useState(currentCategoryId ?? NONE);

  /*
   * Reset when the dialog opens, not when the prop changes.
   *
   * The ticket page re-renders under this component on every live poll, so
   * resetting on `currentCategoryId` would wipe a half-made choice the moment
   * somebody else replied.
   */
  /*
   * Deliberately keyed on `open` and the ticket's own value, and on nothing else.
   *
   * `rootOf` closes over `categories`, so listing it would re-run this whenever
   * the page re-renders — which is every time the live poll finds a new message.
   * That is the case this guard exists for.
   */
  useEffect(() => {
    if (!open) return;
    setRoot(rootOf(currentCategoryId));
    setLeaf(currentCategoryId ?? NONE);
  }, [open, currentCategoryId]);

  useEffect(() => {
    if (!result?.ok) return;
    toast({ kind: "system", tone: "success", title: result.message });
    onOpenChange(false);
  }, [result, toast, onOpenChange]);

  const children =
    categories.find((entry) => entry.id === root)?.children ?? [];

  /*
   * What gets saved: the leaf if one is chosen, otherwise the root.
   *
   * A root on its own is a legal filing — not every branch has children, and
   * forcing a leaf would make a category like „Sonstiges" unusable.
   */
  const submitted = leaf !== NONE ? leaf : root === NONE ? "" : root;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-medium">
            <ArrowRightLeftIcon
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            Ticket umsortieren
          </DialogTitle>
          <DialogDescription>
            Die Änderung steht in der Historie.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-4">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="categoryId" value={submitted} />

          {suggestion && suggestion.id !== currentCategoryId && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setRoot(rootOf(suggestion.id));
                setLeaf(suggestion.id);
              }}
              className="h-auto justify-start rounded-2xl border border-border px-3 py-2.5 text-left font-normal"
            >
              <SparklesIcon
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                  Vorschlag übernehmen
                </span>
                <span className="block truncate text-sm">
                  {categoryPathLabel(suggestion.path)}
                </span>
              </span>
            </Button>
          )}

          <div className="grid gap-2">
            <Label htmlFor="reroute-root">Hauptkategorie</Label>
            <Select
              value={root}
              disabled={pending}
              onValueChange={(value) => {
                setRoot(value);
                // Cleared together, or the dialog could submit a child of the
                // previous root — a filing nobody chose and no filter finds.
                setLeaf(NONE);
              }}
            >
              <SelectTrigger id="reroute-root" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Keine Kategorie</SelectItem>
                {categories.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reroute-leaf">Unterkategorie</Label>
            <Select
              value={leaf === NONE ? NONE : leaf}
              disabled={pending || root === NONE || children.length === 0}
              onValueChange={setLeaf}
            >
              <SelectTrigger id="reroute-leaf" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ohne Unterkategorie</SelectItem>
                {children.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {result && !result.ok && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-border px-4 py-3"
            >
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-full px-4"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              {pending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckCircle2Icon strokeWidth={1.5} />
              )}
              Umsortieren
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
