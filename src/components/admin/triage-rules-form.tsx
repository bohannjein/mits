"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveTriageRulesAction } from "@/app/admin/actions";
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
import { Switch } from "@/components/ui/switch";
import { iconFor } from "@/lib/icons";
import {
  CATEGORY_ROOT,
  TICKET_PRIORITY_LABELS,
  TicketPriorityValues,
  type MITSFormSchema,
  type MITSTicketCategory,
  type PortalFaq,
  type TriageRule,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Keyword rules.

   One row per rule, submitted whole. A rule is four answers about one set of
   words: which category they mean, whether they raise the priority, and which FAQ
   entries and which catalogue forms to offer while somebody is still typing them.

   **Keywords as a comma-separated line, not a tag widget.** The value is a short
   list of single words that gets pasted in from somewhere else as often as it gets
   typed, and a chip editor makes pasting eight words eight interactions.

   **The evaluation order is the list order**, so a narrow rule belongs above a
   broad one. The matcher breaks ties by position for exactly this reason — see
   `matchTriageRules`.
   ────────────────────────────────────────────────────────────────────────── */

/** Radix Select has no legal empty value; neither can collide with a real id. */
const NO_CATEGORY = "__none";
const NO_PRIORITY = "__keep";

export function TriageRulesForm({
  rules: initial,
  categories,
  faqs,
  /**
   * The catalogue, unfiltered by role: an admin configures for everyone, and the
   * intake drops a form the reporter's role may not see when it renders.
   */
  schemas,
}: {
  rules: TriageRule[];
  /** Flat, with roots first — the dropdown shows the path, not a tree. */
  categories: MITSTicketCategory[];
  faqs: PortalFaq[];
  schemas: MITSFormSchema[];
}) {
  const [rules, setRules] = useState<TriageRule[]>(initial);
  const [result, formAction, saving] = useActionState(saveTriageRulesAction, null);

  const patch = (id: string, next: Partial<TriageRule>) =>
    setRules((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)),
    );

  /** `Hardware / Notebooks` for the dropdown, so a leaf is unambiguous. */
  const pathLabel = (entry: MITSTicketCategory): string => {
    if (entry.parent_id === CATEGORY_ROOT) return entry.name;
    const parent = categories.find(
      (candidate) => candidate.id === entry.parent_id,
    );
    return parent ? `${parent.name} / ${entry.name}` : entry.name;
  };

  const untitled = rules.filter((rule) => !rule.title.trim()).length;
  const wordless = rules.filter(
    (rule) => rule.keywords.filter((word) => word.trim()).length === 0,
  ).length;

  const blocked = untitled > 0 || wordless > 0;

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-medium">
            <SparklesIcon
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            Regeln
          </CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Geprüft wird von oben nach unten; bei gleich vielen Treffern gewinnt die
            obere Regel. Was ein Melder selbst gewählt hat, wird nie überschrieben.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-3">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Regel. Eingehende Tickets bleiben dann unkategorisiert.
            </p>
          )}

          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="grid gap-3 rounded-2xl border border-border p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor={`rule-title-${rule.id}`}>
                    Regel {index + 1}
                  </Label>
                  <Input
                    id={`rule-title-${rule.id}`}
                    value={rule.title}
                    onChange={(event) =>
                      patch(rule.id, { title: event.target.value })
                    }
                    placeholder="Drucker und Toner"
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(value) =>
                      patch(rule.id, { enabled: value })
                    }
                    disabled={saving}
                    aria-label={`Regel „${rule.title || index + 1}“ aktiv`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Regel „${rule.title || index + 1}“ entfernen`}
                    disabled={saving}
                    onClick={() =>
                      setRules((current) =>
                        current.filter((entry) => entry.id !== rule.id),
                      )
                    }
                    className="rounded-full"
                  >
                    <Trash2Icon strokeWidth={1.5} />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`rule-words-${rule.id}`}>
                  Stichworte (Komma getrennt)
                </Label>
                <Input
                  id={`rule-words-${rule.id}`}
                  value={rule.keywords.join(", ")}
                  onChange={(event) =>
                    patch(rule.id, {
                      // Split on save-as-you-type rather than on submit, so the
                      // field always shows what will be stored. Empty entries are
                      // dropped by the server too — this is only the readable half.
                      keywords: event.target.value
                        .split(",")
                        .map((word) => word.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="drucker, toner, papierstau"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`rule-category-${rule.id}`}>Kategorie</Label>
                  <Select
                    value={rule.category_id || NO_CATEGORY}
                    disabled={saving}
                    onValueChange={(value) =>
                      patch(rule.id, {
                        category_id: value === NO_CATEGORY ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger
                      id={`rule-category-${rule.id}`}
                      className="h-10 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* „Keine" makes the rule an article rule only. That is a
                          real configuration: „Passwort" should offer two FAQ
                          entries and not move the ticket anywhere. */}
                      <SelectItem value={NO_CATEGORY}>Keine</SelectItem>
                      {categories.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {pathLabel(entry)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`rule-priority-${rule.id}`}>
                    Priorität mindestens
                  </Label>
                  <Select
                    value={rule.priority || NO_PRIORITY}
                    disabled={saving}
                    onValueChange={(value) =>
                      patch(rule.id, {
                        priority:
                          value === NO_PRIORITY
                            ? ""
                            : (value as TriageRule["priority"]),
                      })
                    }
                  >
                    <SelectTrigger
                      id={`rule-priority-${rule.id}`}
                      className="h-10 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PRIORITY}>Unverändert</SelectItem>
                      {TicketPriorityValues.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {TICKET_PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {faqs.length > 0 && (
                <div className="grid gap-2">
                  <Label>FAQ-Einträge im Eingang anzeigen</Label>
                  <div className="flex flex-wrap gap-2">
                    {faqs.map((faq) => {
                      const chosen = rule.faq_ids.includes(faq.id);
                      return (
                        <Button
                          key={faq.id}
                          type="button"
                          size="sm"
                          disabled={saving}
                          aria-pressed={chosen}
                          onClick={() =>
                            patch(rule.id, {
                              faq_ids: chosen
                                ? rule.faq_ids.filter((id) => id !== faq.id)
                                : [...rule.faq_ids, faq.id],
                            })
                          }
                          className={
                            chosen
                              ? "h-8 max-w-full rounded-full bg-inverse-surface px-3 text-xs font-normal text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                              : "h-8 max-w-full rounded-full bg-surface-elevated px-3 text-xs font-normal text-foreground hover:bg-accent hover:text-accent-foreground"
                          }
                        >
                          <span className="truncate">{faq.question}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {schemas.length > 0 && (
                <div className="grid gap-2">
                  <Label>Prozesse im Eingang vorschlagen</Label>
                  <div className="flex flex-wrap gap-2">
                    {schemas.map((schema) => {
                      const chosen = rule.form_schema_ids.includes(schema.id);
                      const Icon = iconFor(schema.icon);
                      return (
                        <Button
                          key={schema.id}
                          type="button"
                          size="sm"
                          disabled={saving}
                          aria-pressed={chosen}
                          onClick={() =>
                            patch(rule.id, {
                              form_schema_ids: chosen
                                ? rule.form_schema_ids.filter(
                                    (id) => id !== schema.id,
                                  )
                                : [...rule.form_schema_ids, schema.id],
                            })
                          }
                          className={
                            chosen
                              ? "h-8 max-w-full rounded-full bg-inverse-surface px-3 text-xs font-normal text-inverse-surface-foreground hover:bg-inverse-surface-hover"
                              : "h-8 max-w-full rounded-full bg-surface-elevated px-3 text-xs font-normal text-foreground hover:bg-accent hover:text-accent-foreground"
                          }
                        >
                          <Icon strokeWidth={1.5} aria-hidden />
                          <span className="truncate">{schema.title}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          <Button
            type="button"
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={saving}
            onClick={() =>
              setRules((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  keywords: [],
                  category_id: "",
                  priority: "",
                  faq_ids: [],
                  form_schema_ids: [],
                  order_index: current.length,
                  enabled: true,
                },
              ])
            }
          >
            <PlusIcon strokeWidth={1.5} />
            Regel hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="rules" value={JSON.stringify(rules)} />

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
              {untitled > 0 && `${untitled} Regel(n) ohne Namen. `}
              {wordless > 0 && `${wordless} Regel(n) ohne Stichworte.`}
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
          {saving ? "Speichern …" : "Regeln speichern"}
        </Button>
      </form>
    </div>
  );
}
