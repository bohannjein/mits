"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, LogInIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/forms/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth/client";
import { homeFor } from "@/lib/auth/roles";

const LoginSchema = z.object({
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: z.string().min(1, "Passwort erforderlich."),
});

/**
 * Turn a sign-in failure into something a person can act on.
 *
 * Credential errors stay deliberately vague — distinguishing "unknown address"
 * from "wrong password" tells an attacker which accounts exist. Everything else
 * gets named, because collapsing a CSRF rejection or a 500 into "password is
 * wrong" sends people hunting for a password problem that is not there. Neither
 * message leaks whether the account exists.
 */
function describeSignInError(status: number): string {
  if (status === 401 || status === 400) {
    return "Anmeldung fehlgeschlagen. E-Mail oder Passwort ist falsch.";
  }
  if (status === 403) {
    return (
      "Die Anmeldung wurde vom Server abgelehnt (403). Das ist der CSRF-Schutz: " +
      "die Adresse im Browser gilt nicht als vertrauenswürdiger Origin. " +
      "BETTER_AUTH_URL auf die öffentliche URL dieser Instanz setzen."
    );
  }
  if (status === 429) {
    return "Zu viele Versuche. Bitte einen Moment warten.";
  }
  if (status >= 500) {
    return `Serverfehler bei der Anmeldung (HTTP ${status}). Details stehen im Server-Log.`;
  }
  return `Anmeldung fehlgeschlagen (HTTP ${status}).`;
}

/**
 * @param next Where to go after signing in. Empty means "decide from the role" —
 *   staff land on the queue, reporters in their portal. A caller that came from a
 *   guarded page passes that page instead, so the redirect returns people where
 *   they were headed.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const { data, error: signInError } = await signIn.email({
      email: values.email,
      password: values.password,
    });

    if (signInError) {
      setError(describeSignInError(signInError.status));
      return;
    }

    // The sign-in response carries the role, so the landing page can be decided
    // without a second round-trip. `homeFor` degrades to the customer portal for
    // an unknown role, never upwards.
    const target = next || homeFor((data?.user as { role?: unknown })?.role);
    router.push(target);
    // The header reads the session on the server, so the new cookie only takes
    // effect after the route cache is dropped.
    router.refresh();
  });

  const busy = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={submit} className="grid gap-5" noValidate>
        {error && (
          <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
            <AlertTitle>Nicht angemeldet</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FormField
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-Mail</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="username"
                  placeholder="vorname.nachname@firma.de"
                  disabled={busy}
                  className="h-10 rounded-xl"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Passwort</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  disabled={busy}
                  className="h-10 rounded-xl"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={busy}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <LogInIcon />}
          {busy ? "Anmelden …" : "Anmelden"}
        </Button>

        <p className="text-sm text-muted-foreground">
          Noch kein Konto?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Registrieren
          </Link>
        </p>
      </form>
    </Form>
  );
}
