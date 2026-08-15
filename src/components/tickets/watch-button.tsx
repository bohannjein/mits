"use client";

import { BellIcon, BellOffIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";

import { toggleWatchAction } from "@/app/actions/watchers";
import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Einem Ticket folgen.

   Neben dem Pin und bewusst nicht derselbe Knopf: der Pin sortiert die eigene
   Queue („ich komme darauf zurück"), das hier entscheidet über Meldungen („sag
   mir Bescheid"). Zwei Fragen, zwei Zustände — zusammengelegt wäre jedes
   Lesezeichen ein Abo und jede stille Beobachtung eine Zeile über der Queue.

   **Kein `<form>`**, dieselbe Bauart wie beim Anheften: die Zeile wird unter dem
   Knopf neu gerendert, sobald ein Realtime-Signal kommt, und ein Formular in
   einem ausgetauschten Element schickt ins Leere. `FormData` von Hand plus
   `startTransition`, ohne die React warnt und `pending` nie umschaltet.

   **Erfolg meldet sich als Toast, anders als beim Pin.** Beim Pin wandert die
   Zeile sichtbar in den Block darüber — das *ist* die Rückmeldung. Hier ändert
   sich nur ein Symbol, und „ab jetzt bekomme ich Meldungen" ist eine Zusage, die
   man einmal gelesen haben will.
   ────────────────────────────────────────────────────────────────────────── */

export function WatchButton({
  ticketId,
  watching,
}: {
  ticketId: string;
  watching: boolean;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(toggleWatchAction, null);

  /*
   * Der Zustand, solange der Server antwortet. Zurückgenommen nur im
   * Fehlerfall — bei Erfolg entspricht er dem Geschriebenen, und das Prop zieht
   * mit der Revalidierung nach.
   */
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  useEffect(() => {
    if (!result) return;

    if (!result.ok) {
      setOptimistic(null);
      toast({ kind: "system", tone: "warning", title: result.error });
      return;
    }

    toast({ kind: "system", tone: "info", title: result.message });
  }, [result, toast]);

  const shown = optimistic ?? watching;
  const label = shown ? "Folgt" : "Folgen";
  const Icon = shown ? BellIcon : BellOffIcon;

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      aria-pressed={shown}
      title={
        shown
          ? "Du bekommst Meldungen zu diesem Ticket"
          : "Meldungen zu diesem Ticket bekommen"
      }
      onClick={() => {
        setOptimistic(!shown);
        const formData = new FormData();
        formData.set("ticketId", ticketId);
        startTransition(() => action(formData));
      }}
      className={cn(
        "h-9 rounded-full px-3.5 text-xs font-medium",
        shown
          ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          : "bg-surface-elevated text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon strokeWidth={1.5} />
      {label}
    </Button>
  );
}
