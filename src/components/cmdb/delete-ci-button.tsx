"use client";

import { Loader2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { deleteConfigurationItemAction } from "@/app/mits/cmdb/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/* ──────────────────────────────────────────────────────────────────────────
   Delete one item, with a confirmation step.

   Two clicks rather than a dialog: the action removes relations and ticket attachments
   for real, and those are not restorable from the trash view — only the item itself is.
   A single click for that is too cheap.

   On success the router leaves the page, because the page it was on no longer resolves.
   ────────────────────────────────────────────────────────────────────────── */

export function DeleteCIButton({
  itemId,
  name,
}: {
  itemId: string;
  name: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [result, formAction, pending] = useActionState(
    deleteConfigurationItemAction,
    null,
  );

  useEffect(() => {
    if (result?.ok) router.push("/mits/cmdb");
  }, [result, router]);

  if (!armed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setArmed(true)}
        className="w-full rounded-full px-4 text-muted-foreground"
      >
        <Trash2Icon strokeWidth={1.5} />
        Löschen
      </Button>
    );
  }

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="itemId" value={itemId} />

      <Alert variant="destructive" className="rounded-xl border-border px-3 py-2">
        <TriangleAlertIcon strokeWidth={1.5} />
        <AlertDescription className="text-xs">
          {result && !result.ok
            ? result.error
            : `${name} löschen? Beziehungen und Ticket-Zuordnungen gehen dabei verloren.`}
        </AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          className="flex-1 rounded-full bg-destructive px-4 text-destructive-foreground hover:bg-destructive-hover"
        >
          {pending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <Trash2Icon strokeWidth={1.5} />
          )}
          Löschen
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setArmed(false)}
          disabled={pending}
          className="rounded-full px-4"
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
