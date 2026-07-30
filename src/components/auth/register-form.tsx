"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/forms/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth/client";

/** Mirrors the server's `minPasswordLength: 10`. */
const RegisterSchema = z
  .object({
    name: z.string().min(2, "Bitte Vor- und Nachnamen angeben.").max(80),
    email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
    password: z.string().min(10, "Mindestens 10 Zeichen."),
    passwordConfirm: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Die Passwörter stimmen nicht überein.",
  });

export function RegisterForm({ allowedDomains }: { allowedDomains: string[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: "", email: "", password: "", passwordConfirm: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: signUpError } = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });

    if (signUpError) {
      // The server owns the registration policy, so its message (registration
      // disabled, domain not allowed, address taken) is shown as-is.
      setError(signUpError.message ?? "Registrierung fehlgeschlagen.");
      return;
    }

    router.push("/customer/new");
    router.refresh();
  });

  const busy = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={submit} className="grid gap-5" noValidate>
        {error && (
          <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
            <AlertTitle>Registrierung abgelehnt</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FormField
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="name"
                  placeholder="Jana Berger"
                  disabled={busy}
                  className="h-10 rounded-xl"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
              {allowedDomains.length > 0 && (
                <FormDescription>
                  Zugelassene Domains: {allowedDomains.map((d) => `@${d}`).join(", ")}
                </FormDescription>
              )}
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
                  autoComplete="new-password"
                  disabled={busy}
                  className="h-10 rounded-xl"
                />
              </FormControl>
              <FormDescription>Mindestens 10 Zeichen.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="passwordConfirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Passwort wiederholen</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
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
          {busy ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
          {busy ? "Konto wird erstellt …" : "Konto erstellen"}
        </Button>

        <p className="text-sm text-muted-foreground">
          Bereits registriert?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Anmelden
          </Link>
        </p>
      </form>
    </Form>
  );
}
