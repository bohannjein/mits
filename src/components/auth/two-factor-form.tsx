"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { twoFactor } from "@/lib/auth/client";

/* ──────────────────────────────────────────────────────────────────────────
   Zweiter Faktor, aus Sicht des eigenen Kontos.

   Drei Zustände in einer Karte statt drei Seiten: aus, in Einrichtung, an. Der
   mittlere existiert nur im Speicher dieser Komponente — die Ersatzcodes kommen
   **einmal** aus der API zurück und lassen sich danach nirgends mehr nachlesen,
   also darf zwischen "erzeugt" und "gezeigt" keine Navigation liegen.

   Der QR-Code wird nachgeladen (`await import("qrcode")`) statt importiert. Die
   Bibliothek wiegt mehr als diese Karte und wird von einem Konto genau einmal
   gebraucht; im normalen Bundle läge sie auf jedem Profilaufruf mit.
   ────────────────────────────────────────────────────────────────────────── */

interface SetupState {
  totpURI: string;
  backupCodes: string[];
  qrDataUrl: string | null;
}

/** Eine abgelehnte Antwort in einen Satz, den jemand lesen kann. */
function describeError(status: number, fallback: string): string {
  if (status === 401 || status === 400) {
    return "Das Passwort stimmt nicht, oder der Code ist abgelaufen.";
  }
  if (status === 403) {
    return "Der Server hat die Anfrage abgelehnt (403).";
  }
  if (status === 429) {
    return "Zu viele Versuche. Bitte einen Moment warten.";
  }
  if (status >= 500) {
    return `Serverfehler (HTTP ${status}). Details stehen im Server-Log.`;
  }
  return fallback;
}

export function TwoFactorForm({
  enabled,
  required,
}: {
  enabled: boolean;
  /** Pflicht für diese Rolle. Entscheidet, ob es einen Weg zurück gibt. */
  required: boolean;
}) {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setError(null);
    setBusy(true);
    try {
      const { data, error: enableError } = await twoFactor.enable({ password });
      if (enableError || !data) {
        setError(
          describeError(
            enableError?.status ?? 0,
            "Der zweite Faktor konnte nicht eingerichtet werden.",
          ),
        );
        return;
      }

      // Fehlschlag hier ist kein Fehlschlag der Einrichtung: der Schlüssel steht
      // im URI daneben und lässt sich von Hand eintippen.
      let qrDataUrl: string | null = null;
      try {
        const { toDataURL } = await import("qrcode");
        qrDataUrl = await toDataURL(data.totpURI, { margin: 2, width: 224 });
      } catch {
        qrDataUrl = null;
      }

      setSetup({
        totpURI: data.totpURI,
        backupCodes: data.backupCodes,
        qrDataUrl,
      });
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setError(null);
    setBusy(true);
    try {
      const { error: verifyError } = await twoFactor.verifyTotp({ code });
      if (verifyError) {
        setError(
          describeError(verifyError.status, "Der Code wurde nicht akzeptiert."),
        );
        return;
      }
      setSetup(null);
      setCode("");
      // Better Auth tauscht bei der Bestätigung die Sitzung aus, und die Karte
      // hängt an einem Serverwert — ohne das bliebe sie im Einrichtungszustand.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const { error: disableError } = await twoFactor.disable({ password });
      if (disableError) {
        setError(
          describeError(
            disableError.status,
            "Der zweite Faktor konnte nicht entfernt werden.",
          ),
        );
        return;
      }
      setPassword("");
      setFreshCodes(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function regenerateCodes() {
    setError(null);
    setBusy(true);
    try {
      const { data, error: codesError } = await twoFactor.generateBackupCodes({
        password,
      });
      if (codesError || !data) {
        setError(
          describeError(
            codesError?.status ?? 0,
            "Die Ersatzcodes konnten nicht erneuert werden.",
          ),
        );
        return;
      }
      setFreshCodes(data.backupCodes);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  const problem = error && (
    <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
      <TriangleAlertIcon />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  /* ── Zustand 2: eingerichtet, aber noch nicht bestätigt ── */
  if (setup) {
    return (
      <div className="grid gap-5">
        {setup.qrDataUrl ? (
          <div className="flex justify-center">
            {/* Kein `next/image`: das ist eine Data-URL, es gibt nichts zu
                optimieren und nichts zu laden. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qrDataUrl}
              alt="QR-Code für die Authenticator-App"
              width={224}
              height={224}
              className="rounded-xl"
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="totpUri">Schlüssel zum Abtippen</Label>
          <Input
            id="totpUri"
            readOnly
            value={setup.totpURI}
            onFocus={(event) => event.currentTarget.select()}
            className="h-10 rounded-xl font-mono text-xs"
          />
        </div>

        <div className="rounded-2xl border border-border p-4">
          <p className="text-sm font-medium">Ersatzcodes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Werden nur jetzt angezeigt. Jeder Code ersetzt einmal die App.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
            {setup.backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
        </div>

        <Separator className="bg-border" />

        <div className="grid gap-2">
          <Label htmlFor="setupCode">Code aus der App</Label>
          <Input
            id="setupCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
            placeholder="123456"
            className="h-10 rounded-xl font-mono"
          />
        </div>

        {problem}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={confirmSetup}
            disabled={busy || code.trim() === ""}
            className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            {busy && <Loader2Icon className="animate-spin" />}
            {busy ? "Prüfen …" : "Bestätigen"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSetup(null);
              setCode("");
              setError(null);
            }}
            disabled={busy}
            className="h-10 rounded-full"
          >
            Abbrechen
          </Button>
        </div>
      </div>
    );
  }

  /* ── Zustand 3: aktiv ── */
  if (enabled) {
    return (
      <div className="grid gap-5">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="h-auto rounded-full px-2.5 py-0.5 font-normal"
          >
            <ShieldCheckIcon className="size-3.5" strokeWidth={1.5} />
            Aktiv
          </Badge>
          {required && (
            <span className="text-sm text-muted-foreground">
              Für diese Rolle vorgeschrieben.
            </span>
          )}
        </div>

        {freshCodes && (
          <div className="rounded-2xl border border-border p-4">
            <p className="text-sm font-medium">Neue Ersatzcodes</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Werden nur jetzt angezeigt. Die alten gelten nicht mehr.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
              {freshCodes.map((backupCode) => (
                <li key={backupCode}>{backupCode}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="twoFactorPassword">Passwort</Label>
          <Input
            id="twoFactorPassword"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            className="h-10 rounded-xl"
          />
        </div>

        {problem}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={regenerateCodes}
            disabled={busy || password === ""}
            className="h-10 rounded-full bg-surface-elevated px-5 text-foreground hover:bg-accent"
          >
            {busy && <Loader2Icon className="animate-spin" />}
            Ersatzcodes erneuern
          </Button>
          {/* Kein Weg heraus, solange die Rolle den Faktor braucht: der Guard
              schickt das Konto sonst umgehend zurück auf diese Seite, und ein
              Knopf, der in eine Umleitung läuft, ist schlechter als keiner. */}
          {!required && (
            <Button
              type="button"
              variant="ghost"
              onClick={disable}
              disabled={busy || password === ""}
              className="h-10 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Entfernen
            </Button>
          )}
        </div>
      </div>
    );
  }

  /* ── Zustand 1: aus ── */
  return (
    <div className="grid gap-5">
      {required && (
        <Alert className="rounded-2xl border-border px-4 py-3">
          <TriangleAlertIcon />
          <AlertTitle>Erforderlich</AlertTitle>
          <AlertDescription>
            Für diese Rolle ist ein zweiter Faktor vorgeschrieben. Bis er
            eingerichtet ist, kann dieses Konto nichts anderes tun.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label htmlFor="twoFactorPassword">Passwort</Label>
        <Input
          id="twoFactorPassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          className="h-10 rounded-xl"
        />
      </div>

      {problem}

      <div>
        <Button
          type="button"
          onClick={startSetup}
          disabled={busy || password === ""}
          className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
        >
          {busy ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CheckCircle2Icon />
          )}
          {busy ? "Wird eingerichtet …" : "Einrichten"}
        </Button>
      </div>
    </div>
  );
}
