"use client";

import { BellIcon, BellOffIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";

import { toggleWatchAction } from "@/app/actions/watchers";
import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Kein `<form>`, wie beim Pin: die Zeile wird unter dem Knopf neu gerendert.
// Erfolg meldet sich hier als Toast — anders als beim Pin ändert sich nur ein
// Symbol.

export function WatchButton({
  ticketId,
  watching,
}: {
  ticketId: string;
  watching: boolean;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(toggleWatchAction, null);

  // Zurückgenommen nur im Fehlerfall; bei Erfolg zieht das Prop nach.
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
