"use client";

import {
  BotIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlugZapIcon,
  SaveIcon,
  SlidersIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveAISettingsAction, testAIProviderAction } from "@/app/admin/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AIProvider,
  AI_FEATURES,
  AI_FEATURE_META,
  AI_PROVIDER_ENDPOINTS,
  AI_PROVIDER_LABELS,
  KEEP_AI_KEY,
  providerNeedsKey,
  type AIFallbackField,
  type AISettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The AI control centre.

   One form, submitted as a whole. Every switch on this page is a checkbox, and a
   checkbox that is not posted is indistinguishable from one that is off — so
   splitting the master switch, the provider and the four features across several
   forms would make each save silently clear the others. Same trap as the mail
   mask, same fix.

   The page states what is *off* as prominently as what is on. An admin arriving
   here for the first time should be able to tell at a glance that MITS is
   currently sending nothing anywhere.
   ────────────────────────────────────────────────────────────────────────── */

export function AIFeaturesForm({
  stored,
  effective,
  source,
  hasKey,
}: {
  /** What is in the database — empty fields mean "fall back". */
  stored: AISettings;
  /** What a request would use right now. */
  effective: AISettings;
  source: Record<AIFallbackField, "db" | "env">;
  /** Whether a key is on file. The key itself never leaves the server. */
  hasKey: boolean;
}) {
  const [saveResult, saveAction, saving] = useActionState(
    saveAISettingsAction,
    null,
  );
  const [testResult, testAction, testing] = useActionState(
    testAIProviderAction,
    null,
  );

  // Controlled, so the page can show the right endpoint hint and hide the key
  // field for a provider that has no key to give.
  const [enabled, setEnabled] = useState(stored.enabled);
  const [provider, setProvider] = useState<AIProvider>(stored.provider);
  const needsKey = providerNeedsKey(provider);

  return (
    <div className="grid gap-6">
      <form action={saveAction} className="grid gap-6">
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <BotIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
            <CardTitle className="mt-4 text-lg font-medium">
              KI-Funktionen
            </CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              MITS funktioniert vollständig ohne KI. Alles auf dieser Seite ist
              zusätzlich und einzeln abschaltbar.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
              <Switch
                id="enabled"
                name="enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={saving}
              />
              <div className="grid gap-1">
                <Label htmlFor="enabled" className="font-normal">
                  Hauptschalter
                </Label>
                <span className="text-xs text-muted-foreground">
                  Aus bedeutet: MITS stellt keine einzige Anfrage an ein Modell —
                  auch nicht für den KI-Assistenten im Ticket-Eingang.
                </span>
              </div>
            </div>

            <div
              className={cn(
                "grid gap-5 transition-opacity",
                !enabled && "pointer-events-none opacity-50",
              )}
              aria-hidden={!enabled}
            >
              <div className="grid gap-2">
                <Label htmlFor="provider">Anbieter</Label>
                <Select
                  name="provider"
                  value={provider}
                  onValueChange={(value) => setProvider(value as AIProvider)}
                  disabled={saving}
                >
                  <SelectTrigger id="provider" className="h-10 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AIProvider.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {AI_PROVIDER_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {provider === "ollama"
                    ? "Läuft im eigenen Netz. Es verlässt kein Ticket-Text das Haus."
                    : "Ticket-Texte werden an einen externen Dienst gesendet."}
                </p>
              </div>

              {provider === "ollama" ? (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="ollamaBaseUrl">Basis-URL</Label>
                    <SourceBadge source={source.ollamaBaseUrl} />
                  </div>
                  <Input
                    id="ollamaBaseUrl"
                    name="ollamaBaseUrl"
                    defaultValue={stored.ollamaBaseUrl}
                    placeholder={effective.ollamaBaseUrl}
                    disabled={saving}
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leer lassen für den Wert aus der Umgebung (aktuell{" "}
                    <code>{effective.ollamaBaseUrl}</code>).
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="baseUrl">Basis-URL</Label>
                  <Input
                    id="baseUrl"
                    name="baseUrl"
                    defaultValue={stored.baseUrl}
                    placeholder={AI_PROVIDER_ENDPOINTS[provider]}
                    disabled={saving}
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nur nötig für ein eigenes Gateway. Leer nutzt{" "}
                    <code>{AI_PROVIDER_ENDPOINTS[provider]}</code>.
                  </p>
                </div>
              )}

              {/* Rendered but hidden for Ollama, so switching provider back and
                  forth in the form does not drop a key that is already stored. */}
              <div className={cn("grid gap-2", !needsKey && "hidden")}>
                <Label htmlFor="apiKey">API-Schlüssel</Label>
                <Input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  defaultValue={hasKey ? KEEP_AI_KEY : ""}
                  autoComplete="new-password"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  {hasKey
                    ? "Hinterlegt. Leer lassen behält den gespeicherten Schlüssel."
                    : "Noch keiner hinterlegt."}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="textModel">Textmodell</Label>
                    <SourceBadge source={source.textModel} />
                  </div>
                  <Input
                    id="textModel"
                    name="textModel"
                    defaultValue={stored.textModel}
                    placeholder={effective.textModel}
                    disabled={saving}
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="visionModel">Vision-Modell</Label>
                    <SourceBadge source={source.visionModel} />
                  </div>
                  <Input
                    id="visionModel"
                    name="visionModel"
                    defaultValue={stored.visionModel}
                    placeholder={effective.visionModel}
                    disabled={saving}
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                  {/* Said here because it is genuinely surprising: the OCR stage
                      runs in the Python backend against Ollama, whichever provider
                      is chosen above. */}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <SlidersIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
            <CardTitle className="mt-4 text-lg font-medium">
              Assistenzfunktionen
            </CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Alle standardmäßig aus. Jede einzeln einschaltbar.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4">
            {AI_FEATURES.map((feature) => (
              <div
                key={feature}
                className="flex items-start gap-3 rounded-2xl border border-border p-4"
              >
                <Switch
                  id={feature}
                  name={feature}
                  defaultChecked={stored[feature]}
                  disabled={saving || !enabled}
                />
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={feature} className="font-normal">
                      {AI_FEATURE_META[feature].label}
                    </Label>
                    {/* The two that work with no model at all are worth marking:
                        they are the ones an instance without a GPU can still use. */}
                    {!AI_FEATURE_META[feature].needsModel && (
                      <Badge
                        variant="outline"
                        className="h-auto rounded-full px-2 py-0.5 text-[11px] font-normal"
                      >
                        ohne Modell nutzbar
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {AI_FEATURE_META[feature].description}
                  </span>
                </div>
              </div>
            ))}

            <Separator className="bg-border" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="clusterWindowMinutes">
                  Zeitfenster der Störungserkennung
                </Label>
                <Input
                  id="clusterWindowMinutes"
                  name="clusterWindowMinutes"
                  type="number"
                  min={15}
                  max={1440}
                  defaultValue={stored.clusterWindowMinutes}
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="clusterMinTickets">Ab wie vielen Tickets</Label>
                <Input
                  id="clusterMinTickets"
                  name="clusterMinTickets"
                  type="number"
                  min={2}
                  max={20}
                  defaultValue={stored.clusterMinTickets}
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            {saveResult && (
              <Alert
                variant={saveResult.ok ? "default" : "destructive"}
                className="rounded-2xl border-border px-4 py-3"
              >
                {saveResult.ok ? (
                  <CheckCircle2Icon strokeWidth={1.5} />
                ) : (
                  <TriangleAlertIcon strokeWidth={1.5} />
                )}
                <AlertDescription>
                  {saveResult.ok ? saveResult.message : saveResult.error}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              size="lg"
              className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
              disabled={saving}
            >
              {saving ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SaveIcon strokeWidth={1.5} />
              )}
              {saving ? "Speichern …" : "Alles speichern"}
            </Button>
          </CardContent>
        </Card>
      </form>

      {/* Its own form: testing is not saving, and inside the settings form the
          button would submit the whole mask as a side effect. */}
      <form action={testAction}>
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <SparklesIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
            <CardTitle className="mt-4 text-lg font-medium">
              Verbindung testen
            </CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Stellt eine winzige Anfrage an den <em>gespeicherten</em> Zugang und
              prüft, ob das Modell strukturiert antwortet — nicht nur, ob der Server
              erreichbar ist.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {testResult && (
              <Alert
                variant={testResult.ok ? "default" : "destructive"}
                className="rounded-2xl border-border px-4 py-3"
              >
                {testResult.ok ? (
                  <CheckCircle2Icon strokeWidth={1.5} />
                ) : (
                  <TriangleAlertIcon strokeWidth={1.5} />
                )}
                <AlertTitle>
                  {testResult.ok ? "Antwortet" : "Keine Antwort"}
                </AlertTitle>
                <AlertDescription className="break-words">
                  {testResult.ok ? testResult.message : testResult.error}
                </AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={testing}
              className="h-10 w-fit rounded-full bg-surface-elevated px-5 text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {testing ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PlugZapIcon strokeWidth={1.5} />
              )}
              {testing ? "Wird geprüft …" : "Test durchführen"}
            </Button>
          </CardContent>
        </Card>
      </form>
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
