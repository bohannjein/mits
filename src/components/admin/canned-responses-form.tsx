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
import { useActionState, useState } from "react";

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
import { CANNED_PLACEHOLDERS, type CannedResponse } from "@/types/mits";

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
            rausgeht, bestätigt die Technik.
          </CardDescription>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CANNED_PLACEHOLDERS.map((placeholder) => (
              <Badge
                key={placeholder}
                variant="outline"
                className="h-auto rounded-full px-2 py-0.5 font-mono text-[11px] font-normal"
              >
                {placeholder}
              </Badge>
            ))}
          </div>
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
                  value={entry.body}
                  onChange={(event) =>
                    patch(entry.id, { body: event.target.value })
                  }
                  rows={5}
                  disabled={saving}
                  className="rounded-xl"
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
