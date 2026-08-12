"use client";

import { Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { resetTwoFactorAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Den zweiten Faktor eines fremden Kontos entfernen.
 *
 * Zwei Klicks statt einem, und ohne Dialog: das hier senkt den Schutz eines
 * Kontos, ist aber die Standardantwort auf ein verlorenes Telefon und kommt in
 * einer Zeile einer Tabelle vor. Ein Dialog wie bei „Bestand löschen" wäre für
 * einen Vorgang, der mehrmals pro Woche vorkommt, ein Ritual — ein blanker Knopf
 * neben einer Zeile ist dagegen einer, den man versehentlich trifft.
 *
 * Ist kein Faktor eingerichtet, gibt es keinen Knopf: der Server lehnt den Fall
 * ohnehin ab, und ein Knopf, der nur eine Fehlermeldung erzeugen kann, ist
 * keiner.
 */
export function TwoFactorResetForm({
  userId,
  enabled,
}: {
  userId: string;
  enabled: boolean;
}) {
  const [result, formAction, pending] = useActionState(
    resetTwoFactorAction,
    null,
  );
  const [armed, setArmed] = useState(false);

  if (!enabled && !result?.ok) {
    return <span className="text-sm text-muted-foreground">Nicht aktiv</span>;
  }

  if (result?.ok) {
    return <span className="text-sm text-muted-foreground">Entfernt</span>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />

      <Badge
        variant="outline"
        className="h-auto rounded-full px-2.5 py-0.5 font-normal"
      >
        <ShieldCheckIcon className="size-3.5" strokeWidth={1.5} />
        Aktiv
      </Badge>

      {armed ? (
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          disabled={pending}
          className="h-9 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {pending && <Loader2Icon className="animate-spin" />}
          Wirklich entfernen
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setArmed(true)}
          className="h-9 rounded-full"
        >
          Zurücksetzen
        </Button>
      )}

      {result && !result.ok && (
        <span className="text-xs font-medium text-destructive">
          {result.error}
        </span>
      )}
    </form>
  );
}
