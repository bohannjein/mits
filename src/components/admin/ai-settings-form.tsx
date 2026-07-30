"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  PlugZapIcon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveAISettingsAction } from "@/app/admin/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isSafeOllamaUrl, type AISettings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Ollama endpoint and model choice.

   The dropdowns are filled from the Ollama instance itself, so an admin picks
   from what is actually installed instead of typing a tag that turns out to be
   missing at the first real request.
   ────────────────────────────────────────────────────────────────────────── */

const FREE_TEXT = "__free__";

export function AISettingsForm({
  stored,
  effective,
  source,
}: {
  /** What is in the database — empty fields mean "fall back". */
  stored: AISettings;
  /** What a triage request would use right now. */
  effective: AISettings;
  source: Record<keyof AISettings, "db" | "env">;
}) {
  const [url, setUrl] = useState(stored.ollamaBaseUrl || effective.ollamaBaseUrl);
  const [textModel, setTextModel] = useState(stored.textModel);
  const [visionModel, setVisionModel] = useState(stored.visionModel);

  const [models, setModels] = useState<string[] | null>(null);
  const [probe, setProbe] = useState<
    { ok: true; count: number } | { ok: false; message: string } | null
  >(null);
  const [probing, setProbing] = useState(false);

  const [result, formAction, saving] = useActionState(saveAISettingsAction, null);

  const urlValid = url.trim() === "" || isSafeOllamaUrl(url);

  const testConnection = async () => {
    setProbing(true);
    setProbe(null);
    try {
      const response = await fetch("/api/admin/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaBaseUrl: url.trim() }),
      });
      const body = (await response.json().catch(() => null)) as
        | { models?: string[]; error?: string }
        | null;

      if (!response.ok || !body?.models) {
        setProbe({
          ok: false,
          message: body?.error ?? `Fehlgeschlagen (HTTP ${response.status}).`,
        });
        setModels(null);
        return;
      }

      setModels(body.models);
      setProbe({ ok: true, count: body.models.length });
    } catch {
      setProbe({ ok: false, message: "Anfrage konnte nicht gesendet werden." });
      setModels(null);
    } finally {
      setProbing(false);
    }
  };

  return (
    <form action={formAction} className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Ollama-Verbindung</CardTitle>
          <CardDescription>
            Adresse der Ollama-Instanz. Läuft sie auf demselben Docker-Host, ist{" "}
            <code>http://host.docker.internal:11434</code> richtig.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="ollamaBaseUrl">Basis-URL</Label>
              <SourceBadge source={source.ollamaBaseUrl} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                id="ollamaBaseUrl"
                name="ollamaBaseUrl"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="http://host.docker.internal:11434"
                aria-invalid={!urlValid}
                disabled={saving}
                className="min-w-64 flex-1 rounded-xl font-mono"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full px-4"
                disabled={probing || !urlValid}
                onClick={() => void testConnection()}
              >
                {probing ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <PlugZapIcon />
                )}
                Verbindung testen
              </Button>
            </div>
            {!urlValid && (
              <p className="text-xs font-medium text-destructive">
                Muss mit http:// oder https:// beginnen.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Leer lassen, um den Wert aus der Umgebung zu nutzen (aktuell{" "}
              <code>{effective.ollamaBaseUrl}</code>).
            </p>
          </div>

          {probe?.ok === true && (
            <Alert className="rounded-2xl border-border px-4 py-3">
              <CheckCircle2Icon />
              <AlertTitle>Verbindung steht</AlertTitle>
              <AlertDescription>
                {probe.count === 0
                  ? "Ollama antwortet, hat aber kein Modell installiert. Erst z. B. „ollama pull llama3.1“ ausführen."
                  : `${probe.count} Modell(e) gefunden — unten auswählbar.`}
              </AlertDescription>
            </Alert>
          )}
          {probe?.ok === false && (
            <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
              <TriangleAlertIcon />
              <AlertTitle>Keine Verbindung</AlertTitle>
              <AlertDescription>{probe.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Modelle</CardTitle>
          <CardDescription>
            Erst „Verbindung testen“ — dann stehen hier die installierten Modelle zur
            Auswahl. Ohne Test lässt sich der Tag auch direkt eintippen.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ModelField
            id="textModel"
            label="Textmodell"
            hint="Wählt das Formular aus und extrahiert die Felder."
            value={textModel}
            onChange={setTextModel}
            models={models}
            fallback={effective.textModel}
            source={source.textModel}
            disabled={saving}
          />
          <ModelField
            id="visionModel"
            label="Vision-Modell"
            hint="Liest den Text aus Screenshots — die OCR-Stufe."
            value={visionModel}
            onChange={setVisionModel}
            models={models}
            fallback={effective.visionModel}
            source={source.visionModel}
            disabled={saving}
          />
        </CardContent>
        <CardFooter className="grid gap-3 rounded-b-3xl border-t border-border bg-transparent">
          {result && (
            <Alert
              variant={result.ok ? "default" : "destructive"}
              className="rounded-2xl border-border px-4 py-3"
            >
              {result.ok ? <CheckCircle2Icon /> : <TriangleAlertIcon />}
              <AlertDescription>
                {result.ok ? result.message : result.error}
              </AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-fit rounded-full px-4"
            disabled={saving || !urlValid}
          >
            {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {saving ? "Speichern …" : "Einstellungen speichern"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/**
 * One model field: a dropdown once the instance has been probed, a plain input
 * otherwise. The value is submitted through a hidden input either way, so the
 * server action sees the same field name in both modes.
 */
function ModelField({
  id,
  label,
  hint,
  value,
  onChange,
  models,
  fallback,
  source,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  models: string[] | null;
  fallback: string;
  source: "db" | "env";
  disabled: boolean;
}) {
  // "Free text" stays selectable so an admin can enter a tag that is not pulled
  // yet without losing the dropdown.
  const known = models?.includes(value) ?? false;
  const [freeText, setFreeText] = useState(!known && value !== "");

  const useDropdown = models !== null && models.length > 0 && !freeText;

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <SourceBadge source={source} />
      </div>

      {/* The single source of truth for the form submission. */}
      <input type="hidden" name={id} value={value} />

      {useDropdown ? (
        <Select
          value={value || FREE_TEXT}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === FREE_TEXT) {
              setFreeText(true);
              return;
            }
            onChange(next);
          }}
        >
          <SelectTrigger id={id} className="h-10 w-full rounded-xl font-mono">
            <SelectValue placeholder="Modell wählen" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
            <SelectItem value={FREE_TEXT}>… anderen Tag eintippen</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Input
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={fallback}
            disabled={disabled}
            className="min-w-56 flex-1 rounded-xl font-mono"
          />
          {models !== null && models.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-full px-4"
              onClick={() => setFreeText(false)}
            >
              Aus Liste wählen
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {hint} Leer lassen für den Umgebungswert (aktuell <code>{fallback}</code>).
      </p>
    </div>
  );
}

function SourceBadge({ source }: { source: "db" | "env" }) {
  return (
    <Badge
      variant={source === "db" ? "default" : "outline"}
      className="rounded-full"
    >
      {source === "db" ? "aus der UI" : "aus der Umgebung"}
    </Badge>
  );
}
