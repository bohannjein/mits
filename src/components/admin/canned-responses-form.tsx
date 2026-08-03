"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { saveCannedResponsesAction } from "@/app/admin/actions";
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
import { Textarea } from "@/components/ui/textarea";
import {
  CANNED_PLACEHOLDERS,
  normalizeShortcut,
  type CannedResponse,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Canned responses.

   `order_index` is not edited by hand — the server rewrites it from the list
   position, so moving a row is the only thing that changes the order.
   ────────────────────────────────────────────────────────────────────────── */

export function CannedResponsesForm({
  responses: initial,
}: {
  responses: CannedResponse[];
}) {
  const [entries, setEntries] = useState<CannedResponse[]>(initial);
  const [result, formAction, saving] = useActionState(
    saveCannedResponsesAction,
    null,
  );

  const patch = (id: string, next: Partial<CannedResponse>) =>
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)),
    );

  /*
   * The textareas, so a placeholder can be dropped where the cursor is.
   *
   * A map keyed by id rather than one ref: the rows are a list that reorders and
   * deletes, and an index-keyed ref would hand the token to whichever row moved
   * into that position.
   */
  const bodyRefs = useRef(new Map<string, HTMLTextAreaElement>());

  /**
   * Insert a token at the cursor, or append when the field was never focused.
   *
   * The caret is moved behind the inserted token afterwards, on the next frame:
   * the field is controlled, so React writes the new value first and anything
   * set before that is overwritten — with the caret jumping to the end of the
   * text, which is the wrong place after inserting into the middle of a
   * sentence.
   */
  const insertToken = (entry: CannedResponse, token: string) => {
    const field = bodyRefs.current.get(entry.id);
    const start = field?.selectionStart ?? entry.body.length;
    const end = field?.selectionEnd ?? entry.body.length;

    patch(entry.id, {
      body: entry.body.slice(0, start) + token + entry.body.slice(end),
    });

    requestAnimationFrame(() => {
      const caret = start + token.length;
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  };

  const move = (index: number, delta: number) =>
    setEntries((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const incomplete = entries.filter(
    (entry) => !entry.title.trim() || !entry.body.trim(),
  ).length;

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Textbausteine</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Erscheinen als Schaltflächen über dem Antwortfeld im Ticket. Ein
            Baustein wird <em>eingesetzt</em>, nie automatisch versendet — was
            rausgeht, bestätigt der Agent.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Bausteine. MITS liefert bewusst keine mit — eine
              vorformulierte Antwort in einer Stimme, die hier niemand gewählt
              hat, geht an echte Kolleginnen und Kollegen.
            </p>
          )}

          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="grid gap-3 rounded-2xl border border-border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {index + 1} von {entries.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Nach oben"
                    disabled={saving || index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded-full"
                  >
                    <ArrowUpIcon strokeWidth={1.5} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Nach unten"
                    disabled={saving || index === entries.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded-full"
                  >
                    <ArrowDownIcon strokeWidth={1.5} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`„${entry.title || "Baustein"}“ löschen`}
                    disabled={saving}
                    onClick={() =>
                      setEntries((current) =>
                        current.filter((candidate) => candidate.id !== entry.id),
                      )
                    }
                    className="rounded-full"
                  >
                    <Trash2Icon strokeWidth={1.5} />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`canned-title-${entry.id}`}>
                  Beschriftung der Schaltfläche
                </Label>
                <Input
                  id={`canned-title-${entry.id}`}
                  value={entry.title}
                  onChange={(event) =>
                    patch(entry.id, { title: event.target.value })
                  }
                  placeholder="z. B. Rückfrage stellen"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`canned-body-${entry.id}`}>Text</Label>
                <Textarea
                  id={`canned-body-${entry.id}`}
                  ref={(node) => {
                    if (node) bodyRefs.current.set(entry.id, node);
                    else bodyRefs.current.delete(entry.id);
                  }}
                  value={entry.body}
                  onChange={(event) =>
                    patch(entry.id, { body: event.target.value })
                  }
                  rows={5}
                  disabled={saving}
                  className="rounded-xl"
                />
                {/*
                  Beside the field, not in the card header where the list used
                  to sit. A placeholder is only useful at the position the
                  cursor is in, and a bar three fields away can only be read and
                  retyped.
                */}
                <div className="flex flex-wrap gap-1.5">
                  {CANNED_PLACEHOLDERS.map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      disabled={saving}
                      onClick={() => insertToken(entry, placeholder)}
                      className="rounded-full disabled:opacity-50"
                    >
                      <Badge
                        variant="outline"
                        className="h-auto cursor-pointer rounded-full px-2 py-0.5 font-mono text-[11px] font-normal transition-colors hover:bg-surface-elevated"
                      >
                        {placeholder}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`canned-shortcut-${entry.id}`}>Kürzel</Label>
                  <Input
                    id={`canned-shortcut-${entry.id}`}
                    value={entry.shortcut}
                    onChange={(event) =>
                      patch(entry.id, {
                        shortcut: normalizeShortcut(event.target.value),
                      })
                    }
                    placeholder="reset"
                    disabled={saving}
                    className="h-10 rounded-xl font-mono"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`canned-category-${entry.id}`}>
                    Kategorie (optional)
                  </Label>
                  <Input
                    id={`canned-category-${entry.id}`}
                    value={entry.category}
                    onChange={(event) =>
                      patch(entry.id, { category: event.target.value })
                    }
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={saving}
            onClick={() =>
              setEntries((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  body: "",
                  category: "",
                  shortcut: "",
                  order_index: current.length,
                },
              ])
            }
          >
            <PlusIcon strokeWidth={1.5} />
            Baustein hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="responses" value={JSON.stringify(entries)} />
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
        {incomplete > 0 && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>
              {incomplete} Baustein(e) ohne Beschriftung oder Text.
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || incomplete > 0}
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
          {saving ? "Speichern …" : "Bausteine speichern"}
        </Button>
      </form>
    </div>
  );
}
