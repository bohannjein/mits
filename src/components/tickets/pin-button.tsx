"use client";

import { PinIcon, PinOffIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";

import { togglePinAction } from "@/app/actions/pins";
import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Anheften — als Pille in der Action-Bar und als Symbol in der Queue-Zeile.

   Eine Komponente mit zwei Varianten und nicht zwei Komponenten: es ist dieselbe
   Action, derselbe optimistische Zustand und dasselbe Symbolpaar. Zwei Kopien
   wären zwei Orte, an denen der nächste Zustandsfehler entsteht — und der Fehler
   sähe an beiden Stellen anders aus.

   **Kein `<form>`.** In der Queue steht der Knopf in einer Tabellenzeile, die
   sich unter ihm neu rendert, sobald ein Realtime-Signal kommt; ein Formular in
   einem Element, das gerade ausgetauscht wird, schickt ins Leere. `FormData` von
   Hand plus `startTransition` — dieselbe Bauart wie beim Zurückziehen einer
   Nachricht, und ohne die Transition warnt React und `pending` schaltet nie um.

   **Erfolg meldet sich nicht.** Die Zeile wandert in den Block darüber oder aus
   ihm heraus; das *ist* die Rückmeldung. Ein Toast pro Klick auf ein Symbol wäre
   Lärm über einer Geste, deren Ergebnis man sieht. Der Fehlerfall bekommt einen,
   weil er sonst nirgends steht.
   ────────────────────────────────────────────────────────────────────────── */

export function PinButton({
  ticketId,
  pinned,
  variant = "row",
  /** Nur für die Zeilenvariante: verhindert, dass der Klick den j/k-Cursor bewegt. */
  className,
}: {
  ticketId: string;
  pinned: boolean;
  variant?: "row" | "bar";
  className?: string;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(togglePinAction, null);

  /*
   * Der Zustand, solange der Server antwortet.
   *
   * Gesetzt beim Klick, zurückgenommen nur im Fehlerfall: bei Erfolg entspricht
   * er dem, was der Server gerade geschrieben hat, und das Prop zieht mit der
   * Revalidierung nach. Ein Override, der bei Erfolg sofort zurückspringt, wäre
   * ein sichtbares Flackern für die Dauer der Revalidierung — auf genau dem
   * Symbol, das gerade gedrückt wurde.
   */
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  useEffect(() => {
    if (!result) return;
    if (result.ok) return;

    setOptimistic(null);
    toast({ kind: "system", tone: "warning", title: result.error });
  }, [result, toast]);

  const shown = optimistic ?? pinned;
  const label = shown ? "Angeheftet" : "Anheften";
  const Icon = shown ? PinIcon : PinOffIcon;

  const toggle = (event: React.MouseEvent) => {
    /*
     * Die Zeile trägt `data-ticket-row` und `data-ticket-href` für den
     * j/k-Cursor. Der Knopf darf davon nichts auslösen — wer anheftet, will das
     * Ticket gerade *nicht* öffnen.
     */
    event.stopPropagation();
    event.preventDefault();

    setOptimistic(!shown);

    const formData = new FormData();
    formData.set("ticketId", ticketId);
    startTransition(() => action(formData));
  };

  if (variant === "bar") {
    return (
      <Button
        type="button"
        size="sm"
        disabled={pending}
        aria-pressed={shown}
        onClick={toggle}
        className={cn(
          "h-9 rounded-full px-3.5 text-xs font-medium",
          shown
            ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            : "bg-surface-elevated text-foreground hover:bg-accent hover:text-accent-foreground",
          className,
        )}
      >
        <Icon strokeWidth={1.5} />
        {label}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={pending}
      aria-pressed={shown}
      aria-label={label}
      title={label}
      onClick={toggle}
      className={cn(
        // Hintergrund bewegt sich beim Hover, Vordergrund bleibt auf vollem
        // Kontrast — die Hover-Regel des Design-Systems.
        "size-8 rounded-full hover:bg-accent hover:text-accent-foreground",
        shown ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.5} />
    </Button>
  );
}
