"use client";

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  KeyRoundIcon,
  Loader2Icon,
  TriangleAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { purgeDataAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PURGE_CONFIRM_WORD } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Emptying the instance, one step at a time.

   Six steps for one button, and the count is the point: this is the only control in
   MITS whose result cannot be undone by anything — not the trash view, not a
   restore, not a support call. Three questions, the word typed by hand, one last
   confirmation, then the account password.

   **The steps are a speed bump, not a lock.** Anybody who can reach the action can
   post to it directly, which is why the two checks that matter — the typed word and
   the password — are verified on the server in `purgeDataAction`. What the steps buy
   is the thing a permission check cannot: they make it impossible to do this by
   accident, and they say out loud what will be gone before it is.

   The scope is chosen in the first step rather than fixed, because "delete the test
   tickets" and "delete everything including the customer list" are different
   intentions and the difference should not be a code change.
   ────────────────────────────────────────────────────────────────────────── */

const SCOPES = [
  {
    key: "tickets",
    field: "scope_tickets",
    label: "Tickets",
    detail: "Tickets, Beiträge, Verknüpfungen, Zeiten, Historie und ihre Dateien.",
  },
  {
    key: "cmdb",
    field: "scope_cmdb",
    label: "CMDB-Objekte",
    detail: "Objekte samt Lizenzen und alle Beziehungen zwischen ihnen.",
  },
  {
    key: "organizations",
    field: "scope_organizations",
    label: "Firmen",
    detail: "Die Firmenliste. Personen und Objekte bleiben, ohne Firma.",
  },
  {
    key: "locations",
    field: "scope_locations",
    label: "Standorte",
    detail: "Die Standortliste. Tickets und Objekte bleiben, ohne Standort.",
  },
] as const;

type ScopeKey = (typeof SCOPES)[number]["key"];

export function PurgeDataDialog({
  /** What is there right now, so the second step can name it. */
  counts,
}: {
  counts: Record<ScopeKey, number>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Record<ScopeKey, boolean>>({
    // Tickets on, the rest off: the common case on a test instance is "clear the
    // tickets", and a pre-checked customer list is how somebody deletes one by
    // accident while agreeing to something else.
    tickets: true,
    cmdb: false,
    organizations: false,
    locations: false,
  });
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");

  const [result, action, running] = useActionState(purgeDataAction, null);

  /*
   * Back to the start after a run, and the fields cleared.
   *
   * On success because the dialog now describes a state that no longer exists; on
   * failure because a password that was refused must not sit in the field for the
   * next attempt. Keyed on the result object so it fires once per submission.
   */
  useEffect(() => {
    if (!result) return;
    setPassword("");
    if (result.ok) {
      setWord("");
      setStep(1);
      setOpen(false);
    }
  }, [result]);

  const chosen = SCOPES.filter((scope) => selected[scope.key]);
  const total = chosen.reduce((sum, scope) => sum + counts[scope.key], 0);
  const wordMatches = word.trim().toLowerCase() === PURGE_CONFIRM_WORD;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Never resume mid-flow: a dialog that reopens on step five is a dialog
          // whose remaining click deletes the database.
          if (!next) {
            setStep(1);
            setWord("");
            setPassword("");
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="h-10 rounded-full border-destructive/40 px-5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon strokeWidth={1.5} />
            Bestand löschen
          </Button>
        </DialogTrigger>

        <DialogContent className="rounded-3xl border border-border bg-card shadow-elev-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bestand endgültig löschen</DialogTitle>
            <DialogDescription>Schritt {step} von 6</DialogDescription>
          </DialogHeader>

          {/* One form across all steps: the fields of the earlier ones travel as
              hidden inputs, so the submit in the last step posts everything. */}
          <form action={action} className="grid gap-4">
            {chosen.map((scope) => (
              <input key={scope.field} type="hidden" name={scope.field} value="on" />
            ))}
            <input type="hidden" name="confirm" value={word} />

            {step === 1 && (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  Was soll gelöscht werden?
                </p>
                {SCOPES.map((scope) => (
                  <Label
                    key={scope.key}
                    htmlFor={`purge-${scope.key}`}
                    className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-4 py-3 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Checkbox
                      id={`purge-${scope.key}`}
                      checked={selected[scope.key]}
                      onCheckedChange={(value) =>
                        setSelected((current) => ({
                          ...current,
                          [scope.key]: value === true,
                        }))
                      }
                      className="mt-0.5"
                    />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">
                        {scope.label}
                        <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                          {counts[scope.key]}
                        </span>
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {scope.detail}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-3">
                <p className="text-sm">
                  Es werden <strong className="tabular-nums">{total}</strong>{" "}
                  Datensätze gelöscht:
                </p>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  {chosen.map((scope) => (
                    <li key={scope.key} className="flex items-baseline gap-2">
                      <span className="tabular-nums">{counts[scope.key]}</span>
                      <span>{scope.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === 3 && (
              <Alert
                variant="destructive"
                className="rounded-2xl border-destructive/40"
              >
                <TriangleAlertIcon strokeWidth={1.5} />
                <AlertDescription className="grid gap-1 text-sm">
                  <span>
                    Diese Daten sind danach weg — nicht im Papierkorb, nicht
                    wiederherstellbar.
                  </span>
                  <span>
                    Konten, Einstellungen, Formulare, Textbausteine und FAQ-Anhänge
                    bleiben.
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {step === 4 && (
              <div className="grid gap-2">
                <Label htmlFor="purge-word">
                  Tippe „{PURGE_CONFIRM_WORD}“, um fortzufahren
                </Label>
                <Input
                  id="purge-word"
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                  autoComplete="off"
                  className="h-10 rounded-xl"
                />
              </div>
            )}

            {step === 5 && (
              <p className="text-sm">
                Letzte Frage: {total} Datensätze aus{" "}
                {chosen.map((scope) => scope.label).join(", ")} löschen?
              </p>
            )}

            {step === 6 && (
              <div className="grid gap-2">
                <Label htmlFor="purge-password">Passwort dieses Kontos</Label>
                <Input
                  id="purge-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="h-10 rounded-xl"
                />
                {/* Not a hint about how it works — the one thing worth saying is
                    that a session alone is not enough here. */}
                <p className="text-xs text-muted-foreground">
                  Eine offene Sitzung reicht dafür nicht.
                </p>
              </div>
            )}

            {result && !result.ok && (
              <Alert
                variant="destructive"
                className="rounded-2xl border-destructive/40 px-3 py-2"
              >
                <TriangleAlertIcon strokeWidth={1.5} />
                <AlertDescription className="text-xs">
                  {result.error}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-full px-4 text-xs"
                disabled={running}
                onClick={() => (step === 1 ? setOpen(false) : setStep(step - 1))}
              >
                {step === 1 ? "Abbrechen" : "Zurück"}
              </Button>

              {step < 6 ? (
                <Button
                  type="button"
                  className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent hover:text-accent-foreground"
                  disabled={
                    (step === 1 && chosen.length === 0) ||
                    (step === 4 && !wordMatches)
                  }
                  onClick={() => setStep(step + 1)}
                >
                  {step === 5 ? "Ja, weiter" : "Weiter"}
                  <ChevronRightIcon strokeWidth={1.5} />
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="h-9 rounded-full bg-destructive px-4 text-destructive-foreground hover:bg-destructive-hover"
                  disabled={running || password === ""}
                >
                  {running ? (
                    <Loader2Icon className="animate-spin" strokeWidth={1.5} />
                  ) : (
                    <KeyRoundIcon strokeWidth={1.5} />
                  )}
                  Endgültig löschen
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Outside the dialog, because the dialog closes on success and the one
          sentence saying what happened has to outlive it. */}
      {result?.ok && (
        <Alert className="mt-3 rounded-2xl border-border">
          <CheckCircle2Icon strokeWidth={1.5} />
          <AlertDescription className="text-xs">{result.message}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
