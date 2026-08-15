"use client";

import { Loader2Icon, SlidersHorizontalIcon } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { saveQueueColumnsAction } from "@/app/actions/queue-columns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  QUEUE_COLUMN_LABELS,
  type QueueColumn,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Welche Spalten die Queue zeigt.

   Als letzter Spaltenkopf in der Tabelle, nur von der Queue durchgereicht.

   **Angeboten wird nur, was die Instanz hat.** Die Liste kommt als Prop vom
   Server: `feature_time_tracking` entscheidet über „Zeit", die Pins über
   „Anheften", und ob es überhaupt Standorte gibt über „Standort". Ein Haken für
   eine Spalte, die es nicht gibt, wäre ein Schalter ohne Wirkung.

   **Nummer und Titel stehen nicht in der Liste.** Der Titel ist die absorbierende
   Spalte, die Nummer die Kennung — die Begründung steht an `QUEUE_COLUMNS`.

   Angewendet bei Änderung, ohne Speichern-Knopf: es ist ein Haken pro Spalte, die
   Wirkung steht unmittelbar in der Tabelle daneben, und ein „Übernehmen" wäre ein
   zweiter Klick für eine Entscheidung, die schon getroffen ist. Dieselbe Wahl wie
   bei den Dropdowns der Ticket-Sidebar.
   ────────────────────────────────────────────────────────────────────────── */

export function QueueColumnPicker({
  /** Die Spalten, die diese Instanz überhaupt anbietet — in Anzeigereihenfolge. */
  available,
  /** Was dieser Agent davon ausgeblendet hat. */
  hidden,
}: {
  available: QueueColumn[];
  hidden: QueueColumn[];
}) {
  const [, formAction, pending] = useActionState(saveQueueColumnsAction, null);

  /*
   * Der Zustand liegt hier und nicht in der URL.
   *
   * Anders als Reiter und Sortierung ist die Spaltenwahl keine Ansicht, die man
   * teilt oder als Lesezeichen ablegt — sie gehört zum Konto. In der URL wäre sie
   * bei jedem Sortierklick mitzuschleppen, und ein geteilter Link würde die Wahl
   * des Empfängers überschreiben.
   */
  const [off, setOff] = useState<QueueColumn[]>(hidden);

  function toggle(column: QueueColumn, show: boolean): void {
    const next = show
      ? off.filter((entry) => entry !== column)
      : [...off, column];

    setOff(next);

    const data = new FormData();
    // Ein Feld pro ausgeblendeter Spalte. `getAll` auf der Serverseite liest sie
    // als Liste; eine kommaseparierte Zeichenkette wäre ein zweites Format, das
    // beide Seiten gleich verstehen müssten.
    for (const entry of next) data.append("hidden", entry);
    startTransition(() => formAction(data));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Nur das Symbol: ein Wort neben den Spaltenköpfen nähme dem Titel
            Breite. Was der Knopf tut, steht im `title`. */}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Spalten wählen"
          title="Spalten wählen"
          className="size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SlidersHorizontalIcon className="size-4" strokeWidth={1.5} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-2xl">
        <p className="label-industrial pb-2">Spalten</p>
        <div className="grid gap-3">
          {available.map((column) => {
            const id = `queue-column-${column}`;
            return (
              <div key={column} className="flex items-center gap-3">
                <Checkbox
                  id={id}
                  checked={!off.includes(column)}
                  onCheckedChange={(checked) => toggle(column, checked === true)}
                />
                <Label htmlFor={id} className="font-normal">
                  {QUEUE_COLUMN_LABELS[column]}
                </Label>
              </div>
            );
          })}
        </div>
        {/* Was nicht zur Wahl steht, und warum — eine Zeile, weil sonst jemand
            sucht, wo Nummer und Titel abgeblieben sind. */}
        <p className="mt-4 text-sm text-muted-foreground">
          Nummer und Titel bleiben immer.
        </p>
      </PopoverContent>
    </Popover>
  );
}
