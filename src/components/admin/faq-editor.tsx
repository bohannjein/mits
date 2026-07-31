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

import { savePortalFaqsAction } from "@/app/admin/actions";
import { FaqAttachments } from "@/components/admin/faq-attachments";
import { FaqAccordion } from "@/components/dashboard/faq-accordion";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { PortalFaq } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   FAQ editor.

   `order_index` is not edited by hand: the server rewrites it from the list
   position on save, so moving a row is the only thing that changes the order.
   ────────────────────────────────────────────────────────────────────────── */

export function FaqEditor({ faqs }: { faqs: PortalFaq[] }) {
  const [entries, setEntries] = useState<PortalFaq[]>(faqs);
  const [result, formAction, saving] = useActionState(savePortalFaqsAction, null);

  const patch = (id: string, next: Partial<PortalFaq>) =>
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
    (entry) => !entry.question.trim() || !entry.answer.trim(),
  );

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Selbsthilfe / FAQ</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Erscheint als Akkordeon im Portal, gruppiert nach Kategorie. Die
            Reihenfolge ergibt sich aus dieser Liste. Eine leere Liste blendet den
            Block aus — die Standardfragen kommen dann <em>nicht</em> zurück.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine Einträge. Der Selbsthilfe-Block wird nach dem Speichern nicht
              mehr angezeigt.
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
                    aria-label={`„${entry.question || "Eintrag"}“ löschen`}
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
                <Label htmlFor={`faq-q-${entry.id}`}>Frage</Label>
                <Input
                  id={`faq-q-${entry.id}`}
                  value={entry.question}
                  onChange={(event) =>
                    patch(entry.id, { question: event.target.value })
                  }
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`faq-a-${entry.id}`}>Antwort</Label>
                <Textarea
                  id={`faq-a-${entry.id}`}
                  value={entry.answer}
                  onChange={(event) =>
                    patch(entry.id, { answer: event.target.value })
                  }
                  rows={4}
                  disabled={saving}
                  className="rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`faq-c-${entry.id}`}>Kategorie</Label>
                <Input
                  id={`faq-c-${entry.id}`}
                  value={entry.category}
                  onChange={(event) =>
                    patch(entry.id, { category: event.target.value })
                  }
                  placeholder="z. B. Konten & Rechte"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Leer lassen für „ohne Gruppe“. Gleiche Kategorien werden im
                  Portal zusammengefasst.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Anhänge</Label>
                <FaqAttachments
                  attachments={entry.attachments}
                  disabled={saving}
                  onChange={(attachments) => patch(entry.id, { attachments })}
                />
                <p className="text-xs text-muted-foreground">
                  Bilder erscheinen im Beitrag, andere Dateien darunter als
                  Download. Für alle angemeldeten Personen lesbar.
                </p>
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
                  question: "",
                  answer: "",
                  category: "",
                  order_index: current.length,
                  attachments: [],
                },
              ])
            }
          >
            <PlusIcon strokeWidth={1.5} />
            Frage hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="faqs" value={JSON.stringify(entries)} />
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
        {incomplete.length > 0 && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>
              {incomplete.length} Eintrag/Einträge ohne Frage oder Antwort. Bitte
              ausfüllen oder löschen.
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || incomplete.length > 0}
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
          {saving ? "Speichern …" : "FAQ speichern"}
        </Button>
      </form>

      <Separator className="bg-border" />

      {/* The real portal component, not a mock-up. */}
      <div className="grid gap-3">
        <span className="label-industrial">Vorschau</span>
        <FaqAccordion title="Selbsthilfe" faqs={entries} />
      </div>
    </div>
  );
}
