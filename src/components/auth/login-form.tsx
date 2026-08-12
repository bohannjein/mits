"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, LogInIcon, ShieldCheckIcon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { signIn, twoFactor } from "@/lib/auth/client";
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
 * Dasselbe für den zweiten Schritt.
 *
 * Eigene Funktion, weil „E-Mail oder Passwort ist falsch" dort schlicht nicht
 * stimmt: das Passwort war richtig, sonst gäbe es diesen Schritt nicht. Ein
 * falscher Satz an dieser Stelle schickt Leute zurück auf das Passwortfeld, das
 * in Ordnung ist.
 */
function describeChallengeError(status: number): string {
  if (status === 401 || status === 400) {
    return "Der Code stimmt nicht oder ist abgelaufen.";
  }
  if (status === 403) {
    return "Zu viele Fehlversuche. Das Konto ist vorübergehend gesperrt.";
  }
  if (status === 429) {
    return "Zu viele Versuche. Bitte einen Moment warten.";
  }
  if (status >= 500) {
    return `Serverfehler bei der Prüfung (HTTP ${status}). Details stehen im Server-Log.`;
  }
  return `Prüfung fehlgeschlagen (HTTP ${status}).`;
}

/**
 * Ob die Anmeldung nach einem zweiten Faktor verlangt.
 *
 * Als Prüfung auf dem Wert und nicht über den Antworttyp: `twoFactorRedirect`
 * kommt aus einem Plugin, und ein `data`-Typ, der es kennt, hinge daran, dass die
 * Client-Instanz an dieser Datei sichtbar ist. Die Frage ist ohnehin binär.
 */
function needsSecondFactor(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
  );
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
  /**
   * Der Weg zur Selbstregistrierung. Aus auf der Personalmaske: dort entstehen
   * keine Konten — ein Agentenzugang kommt über `/admin/staff`, und eine
   * Selbstregistrierung an dieser Stelle wäre in jedem Fall ein Melderkonto.
   */
  showRegisterLink = true,
}: {
  next: string;
  sessionLifetimeDays: SessionLifetimeDays;
  showRegisterLink?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  /*
   * Der zweite Schritt lebt in derselben Karte.
   *
   * `challenge` ist der Zustand zwischen „Passwort akzeptiert" und „angemeldet";
   * Better Auth hält ihn serverseitig in einem eigenen Cookie mit zehn Minuten
   * Frist. Eine eigene Seite hätte denselben Zustand aus diesem Cookie
   * rekonstruieren müssen, und ein Reload darauf wäre eine Seite ohne Frage.
   */
  const [challenge, setChallenge] = useState(false);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [verifying, setVerifying] = useState(false);

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
    const { data, error: signInError } = await signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: values.rememberMe,
    });

    if (signInError) {
      setError(describeSignInError(signInError.status));
      return;
    }

    /*
     * Passwort akzeptiert, Sitzung noch nicht vergeben. Kein `router.push` hier:
     * das Ziel wäre eine geschützte Seite, die den Besucher als abgemeldet
     * ansieht und ihn zurück auf die Anmeldung schickt — was aussieht, als hätte
     * das richtige Passwort nicht funktioniert.
     */
    if (needsSecondFactor(data)) {
      setChallenge(true);
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

  async function verifySecondFactor() {
    setError(null);
    setVerifying(true);
    try {
      const trimmed = code.trim();
      const { error: verifyError } = useBackupCode
        ? await twoFactor.verifyBackupCode({ code: trimmed })
        : await twoFactor.verifyTotp({ code: trimmed });

      if (verifyError) {
        setError(describeChallengeError(verifyError.status));
        return;
      }

      router.push(next || CUSTOMER_HOME);
      router.refresh();
    } finally {
      setVerifying(false);
    }
  }

  const busy = form.formState.isSubmitting;

  /* ── Zweiter Schritt ── */
  if (challenge) {
    return (
      <div className="grid gap-5">
        <Alert className="rounded-2xl border-border px-4 py-3">
          <ShieldCheckIcon />
          <AlertTitle>Zweiter Faktor</AlertTitle>
          <AlertDescription>
            {useBackupCode
              ? "Einen der Ersatzcodes eingeben. Jeder gilt einmal."
              : "Den aktuellen Code aus der Authenticator-App eingeben."}
          </AlertDescription>
        </Alert>

        <div className="grid gap-2">
          <Label htmlFor="challengeCode">
            {useBackupCode ? "Ersatzcode" : "Code"}
          </Label>
          <Input
            id="challengeCode"
            autoFocus
            inputMode={useBackupCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              // Kein <form> um dieses Feld: der Enter-Default wäre ein Submit
              // ohne Action, und der leert das Feld statt zu senden.
              if (event.key === "Enter" && code.trim() !== "" && !verifying) {
                event.preventDefault();
                void verifySecondFactor();
              }
            }}
            disabled={verifying}
            placeholder={useBackupCode ? "" : "123456"}
            className="h-10 rounded-xl font-mono"
          />
        </div>

        {error && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <AlertTitle>Nicht angemeldet</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="button"
          size="lg"
          onClick={verifySecondFactor}
          disabled={verifying || code.trim() === ""}
          className="h-11 rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
        >
          {verifying ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <LogInIcon />
          )}
          {verifying ? "Prüfen …" : "Anmelden"}
        </Button>

        <Button
          type="button"
          variant="link"
          onClick={() => {
            setUseBackupCode((previous) => !previous);
            setCode("");
            setError(null);
          }}
          disabled={verifying}
          className="h-auto justify-start p-0 text-sm"
        >
          {useBackupCode
            ? "Doch den Code aus der App verwenden"
            : "Kein Zugriff auf die App? Ersatzcode verwenden"}
        </Button>
      </div>
    );
  }

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

        {showRegisterLink && (
          <p className="text-sm text-muted-foreground">
            Noch kein Konto?{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Registrieren
            </Link>
          </p>
        )}
      </form>
    </Form>
  );
}
