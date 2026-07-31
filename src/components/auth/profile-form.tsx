"use client";

import { CheckCircle2Icon, Loader2Icon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { changeOwnName } from "@/app/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ──────────────────────────────────────────────────────────────────────────
   Own details.

   The name is editable, the address is not. The address is the login identity, and
   this instance has no mail verification configured — someone who could rewrite it
   could lock themselves out of an account they can no longer prove is theirs. It is
   shown read-only with the way to get it changed.
   ────────────────────────────────────────────────────────────────────────── */

export function ProfileForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [result, formAction, saving] = useActionState(changeOwnName, null);
  const [value, setValue] = useState(name);

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          name="name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="name"
          maxLength={120}
          disabled={saving}
          className="h-10 rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Erscheint an Ihren Tickets und in Antworten der Technik.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="profile-email">E-Mail</Label>
        <Input
          id="profile-email"
          value={email}
          readOnly
          disabled
          className="h-10 rounded-xl font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Ihre Anmeldeadresse. Eine Änderung nimmt die IT vor — bitte per Ticket
          anfragen.
        </p>
      </div>

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

      <Button
        type="submit"
        disabled={saving || value.trim() === "" || value.trim() === name}
        className="w-fit rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
      >
        {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
        {saving ? "Speichern …" : "Namen speichern"}
      </Button>
    </form>
  );
}
