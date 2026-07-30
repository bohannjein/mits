"use client";

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { changeOwnPassword } from "@/app/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Own-password form.
 *
 * A plain `<form>` over a server action, like the admin settings forms: the rules
 * are enforced server-side regardless, so there is nothing to gain from
 * duplicating them in react-hook-form here.
 */
export function PasswordChangeForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [result, formAction, pending] = useActionState(changeOwnPassword, null);

  // A forced change leaves the gate behind, so the server-rendered shell that
  // still shows the warning has to be refetched.
  useEffect(() => {
    if (result?.ok && forced) router.refresh();
  }, [result?.ok, forced, router]);

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className="h-10 rounded-xl"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="newPassword">Neues Passwort</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          disabled={pending}
          className="h-10 rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Mindestens 10 Zeichen.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Neues Passwort wiederholen</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          disabled={pending}
          className="h-10 rounded-xl"
        />
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
        size="lg"
        className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
        disabled={pending}
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? "Wird geändert …" : "Passwort ändern"}
      </Button>
    </form>
  );
}
