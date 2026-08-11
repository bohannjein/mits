"use client";

import {
  CheckCircle2Icon,
  DicesIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { createUserAccountAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MITS_ROLES, ROLE_LABELS } from "@/lib/auth/roles";

/* ──────────────────────────────────────────────────────────────────────────
   Ein Konto anlegen, mit Rolle.

   Das Passwort steht im Klartext im Feld und nicht als Punkte: es wird nicht für
   das eigene Konto gesetzt, sondern für ein fremdes, und muss weitergegeben
   werden. Ein maskiertes Feld hieße, einen Wert abzutippen, den man nicht lesen
   kann — und niemand kann ihn danach noch einmal nachsehen.

   Der Würfel-Knopf ist deshalb der gedachte Weg: sechzehn Zeichen ohne die
   Paare, die auf Papier oder am Telefon nicht unterscheidbar sind.
   ────────────────────────────────────────────────────────────────────────── */

/** Ohne `0/O`, `1/l/I` und ohne Zeichen, die eine Shell oder ein Mailclient frisst. */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-+#";

function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join("");
}

export function CreateUserForm() {
  const [result, formAction, saving] = useActionState(
    createUserAccountAction,
    null,
  );
  const [password, setPassword] = useState("");
  /*
   * Zählt hoch, sobald ein Konto entstanden ist, und ist der `key` des
   * Feldblocks. Ein `form.reset()` würde die eingegebenen Werte löschen, aber
   * nicht den Zustand des Radix-Selects — der Trigger stünde dann auf einer
   * Rolle, die das versteckte Feld nicht mehr trägt. Ein Remount löscht beides.
   */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (result?.ok) {
      setGeneration((value) => value + 1);
      setPassword("");
    }
  }, [result]);

  return (
    <form action={formAction} className="grid gap-4">
      <div key={generation} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="new-user-name">Name</Label>
          <Input
            id="new-user-name"
            name="name"
            required
            maxLength={120}
            autoComplete="off"
            disabled={saving}
            className="h-10 rounded-xl"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="new-user-email">E-Mail</Label>
          <Input
            id="new-user-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="vorname.nachname@firma.de"
            disabled={saving}
            className="h-10 rounded-xl font-mono"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="new-user-password">Passwort (min. 10 Zeichen)</Label>
          <div className="flex gap-2">
            <Input
              id="new-user-password"
              name="password"
              // Kein `type="password"`: siehe Kommentar oben.
              type="text"
              required
              minLength={10}
              maxLength={256}
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={saving}
              className="h-10 rounded-xl font-mono"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setPassword(generatePassword())}
              disabled={saving}
              className="h-10 shrink-0 rounded-xl"
            >
              <DicesIcon strokeWidth={1.5} />
              Würfeln
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="new-user-role">Rolle</Label>
          <Select name="role" defaultValue="agent" disabled={saving}>
            <SelectTrigger id="new-user-role" className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MITS_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border p-4 sm:col-span-2">
          <Checkbox
            id="new-user-must-change"
            name="mustChangePassword"
            defaultChecked
            disabled={saving}
          />
          <Label htmlFor="new-user-must-change" className="font-normal">
            Das Konto kann nichts tun, bis es dieses Passwort ersetzt hat
          </Label>
        </div>
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
        size="sm"
        disabled={saving}
        className="h-9 w-fit rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
      >
        {saving ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <UserPlusIcon strokeWidth={1.5} />
        )}
        {saving ? "Anlegen …" : "Konto anlegen"}
      </Button>
    </form>
  );
}
