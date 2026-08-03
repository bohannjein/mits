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

import { saveMacrosAction } from "@/app/admin/actions";
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
import {
  MACRO_REPLY_MODE_LABELS,
  MacroReplyMode,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TicketPriorityValues,
  TicketStatus,
  macroIsEmpty,
  normalizeShortcut,
  type CannedResponse,
  type Macro,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Macro editor.

   Radix Select has no legal empty value, so "leave this alone" travels as the
   `__keep` sentinel and is mapped back to the empty string on the way into state.
   The stored shape keeps the empty string, because that is what survives a round
   trip through `FormData` and through the JSON blob unchanged.

   `order_index` is not edited by hand — the server rewrites it from the list
   position, so moving a row is the only thing that changes the order.
   ────────────────────────────────────────────────────────────────────────── */

/** Radix cannot bind `""`; this is what "no change" looks like in the picker. */
const KEEP = "__keep";

const toStored = (value: string) => (value === KEEP ? "" : value);
const toPicker = (value: string) => (value === "" ? KEEP : value);

export function MacrosForm({
  macros: initial,
  cannedResponses,
}: {
  macros: Macro[];
  cannedResponses: CannedResponse[];
}) {
  const [entries, setEntries] = useState<Macro[]>(initial);
  const [result, formAction, saving] = useActionState(saveMacrosAction, null);

  const patch = (id: string, next: Partial<Macro>) =>
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

  const untitled = entries.filter((entry) => !entry.title.trim()).length;
  // A macro that changes nothing reports success and moves no ticket, which is
  // worse than a missing button: the agent believes it worked.
  const inert = entries.filter(macroIsEmpty).length;

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Makros</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Erscheinen als Schaltflächen über dem Antwortfeld im Ticket. Ein Klick
            wendet alle gesetzten Felder an und schreibt für jede Änderung einen
            Eintrag in die Historie.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Makros angelegt.
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
                    aria-label={`„${entry.title || "Makro"}“ löschen`}
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
                <Label htmlFor={`macro-title-${entry.id}`}>
                  Beschriftung der Schaltfläche
                </Label>
                <Input
                  id={`macro-title-${entry.id}`}
                  value={entry.title}
                  onChange={(event) =>
                    patch(entry.id, { title: event.target.value })
                  }
                  placeholder="z. B. Warten auf Kundenrückmeldung"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`macro-description-${entry.id}`}>
                    Kurzbeschreibung (optional)
                  </Label>
                  <Input
                    id={`macro-description-${entry.id}`}
                    value={entry.description}
                    onChange={(event) =>
                      patch(entry.id, { description: event.target.value })
                    }
                    placeholder="Erscheint als Tooltip"
                    disabled={saving}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`macro-shortcut-${entry.id}`}>Kürzel</Label>
                  <Input
                    id={`macro-shortcut-${entry.id}`}
                    value={entry.shortcut}
                    onChange={(event) =>
                      patch(entry.id, {
                        shortcut: normalizeShortcut(event.target.value),
                      })
                    }
                    placeholder="warten"
                    disabled={saving}
                    className="h-10 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor={`macro-status-${entry.id}`}>Status setzen</Label>
                  <Select
                    value={toPicker(entry.set_status)}
                    onValueChange={(value) =>
                      patch(entry.id, { set_status: toStored(value) })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger
                      id={`macro-status-${entry.id}`}
                      className="h-10 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>Nicht ändern</SelectItem>
                      {TicketStatus.options.map((status) => (
                        <SelectItem key={status} value={status}>
                          {TICKET_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`macro-priority-${entry.id}`}>
                    Priorität setzen
                  </Label>
                  <Select
                    value={toPicker(entry.set_priority)}
                    onValueChange={(value) =>
                      patch(entry.id, { set_priority: toStored(value) })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger
                      id={`macro-priority-${entry.id}`}
                      className="h-10 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>Nicht ändern</SelectItem>
                      {TicketPriorityValues.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {TICKET_PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`macro-assign-${entry.id}`}>Zuweisung</Label>
                  <Select
                    value={toPicker(entry.assign)}
                    onValueChange={(value) =>
                      patch(entry.id, {
                        assign: toStored(value) as Macro["assign"],
                      })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger
                      id={`macro-assign-${entry.id}`}
                      className="h-10 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>Nicht ändern</SelectItem>
                      {/* "Der ausführenden Person", not a name: a macro naming a
                          specific agent breaks the day they leave. */}
                      <SelectItem value="self">Mir zuweisen</SelectItem>
                      <SelectItem value="unassign">Zuweisung entfernen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`macro-canned-${entry.id}`}>Textbaustein</Label>
                  <Select
                    value={toPicker(entry.canned_response_id)}
                    onValueChange={(value) =>
                      patch(entry.id, { canned_response_id: toStored(value) })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger
                      id={`macro-canned-${entry.id}`}
                      className="h-10 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>Keiner</SelectItem>
                      {cannedResponses.map((canned) => (
                        <SelectItem key={canned.id} value={canned.id}>
                          {canned.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`macro-mode-${entry.id}`}>
                    Umgang mit dem Baustein
                  </Label>
                  <Select
                    value={entry.reply_mode}
                    onValueChange={(value) =>
                      patch(entry.id, {
                        reply_mode: value as Macro["reply_mode"],
                      })
                    }
                    disabled={saving || entry.canned_response_id === ""}
                  >
                    <SelectTrigger
                      id={`macro-mode-${entry.id}`}
                      className="h-10 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MacroReplyMode.options.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {MACRO_REPLY_MODE_LABELS[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/*
                Said out loud where the choice is made. Everywhere else in MITS a
                template is inserted and a human presses send; this option is the
                one exception, and the person taking it is the admin writing the
                text — not the agent clicking the button later.
              */}
              {entry.reply_mode === "send" && entry.canned_response_id !== "" && (
                <Alert className="rounded-xl border-border px-3 py-2">
                  <TriangleAlertIcon strokeWidth={1.5} />
                  <AlertDescription className="text-xs">
                    Der Text geht beim Klick sofort an den Melder — ohne weitere
                    Bestätigung und mit E-Mail-Benachrichtigung.
                  </AlertDescription>
                </Alert>
              )}

              {macroIsEmpty(entry) && (
                <p className="text-xs text-destructive">
                  Dieses Makro ändert nichts. Bitte mindestens ein Feld setzen oder
                  einen Textbaustein wählen.
                </p>
              )}
            </div>
          ))}

          <Button
            type="button"
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent hover:text-accent-foreground"
            disabled={saving}
            onClick={() =>
              setEntries((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  description: "",
                  icon: "Zap",
                  shortcut: "",
                  set_status: "",
                  set_priority: "",
                  assign: "",
                  canned_response_id: "",
                  reply_mode: "insert",
                  order_index: current.length,
                },
              ])
            }
          >
            <PlusIcon strokeWidth={1.5} />
            Makro hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="macros" value={JSON.stringify(entries)} />
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
        {(untitled > 0 || inert > 0) && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>
              {untitled > 0 && `${untitled} Makro(s) ohne Beschriftung. `}
              {inert > 0 && `${inert} Makro(s) ohne Wirkung.`}
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || untitled > 0 || inert > 0}
        >
          {saving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SaveIcon strokeWidth={1.5} />
          )}
          {saving ? "Speichern …" : "Makros speichern"}
        </Button>
      </form>
    </div>
  );
}
