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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth/client";
import { CUSTOMER_HOME } from "@/lib/auth/roles";
import {
  SESSION_LIFETIME_LABELS,
  type SessionLifetimeDays,
} from "@/types/mits";

const LoginSchema = z.object({
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: z.string().min(1, "Passwort erforderlich."),
  rememberMe: z.boolean(),
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
 * @param next Where to go after signing in. Empty means the customer portal, which
 *   is also where the root sends people — the front door is the same for everyone.
 *   A caller that came from a guarded page passes that page instead, so the redirect
 *   returns people where they were headed.
 */
export function LoginForm({
  next,
  /**
   * Die Obergrenze, die der Admin eingestellt hat — in Tagen, `0` heißt immer.
   *
   * Sie steht **im Label** und nicht in einer Zeile darunter: „Angemeldet bleiben
   * (30 Tage)" ist dieselbe Auskunft in der Zeile, die man ohnehin liest, und ein
   * Haken, dessen Dauer man nicht kennt, ist eine Zusage ohne Frist.
   */
  sessionLifetimeDays,
}: {
  next: string;
  sessionLifetimeDays: SessionLifetimeDays;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(LoginSchema),
    /*
     * Nicht vorbelegt.
     *
     * Better Auths eigener Default ist `true`; hier ist er `false`, weil der Haken
     * eine Aussage über *dieses Gerät* ist und der ungünstige Fall ein geteilter
     * Rechner ist, an dem niemand die Vorbelegung bemerkt. Ohne Haken endet die
     * Sitzung mit dem Browser.
     */
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: signInError } = await signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: values.rememberMe,
    });

    if (signInError) {
      setError(describeSignInError(signInError.status));
      return;
    }

    /*
     * The portal unless the caller asked for somewhere specific.
     *
     * `next` comes from the guarded page that sent them here, so a deep link into a
     * ticket or into /mits still resolves after signing in. Without one the landing
     * is the same as the root's — the portal, for staff too. The role is no longer
     * consulted here, which also means this no longer depends on the sign-in response
     * carrying it.
     */
    const target = next || CUSTOMER_HOME;
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

        <FormField
          name="rememberMe"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={busy}
                  id="rememberMe"
                />
              </FormControl>
              <FormLabel htmlFor="rememberMe" className="font-normal">
                {sessionLifetimeDays === 0
                  ? "Angemeldet bleiben"
                  : `Angemeldet bleiben (${SESSION_LIFETIME_LABELS[sessionLifetimeDays]})`}
              </FormLabel>
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
