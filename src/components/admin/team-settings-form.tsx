"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveTeamSettingsAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TEAM_SETTINGS,
  TEAM_TOGGLES,
  TEAM_TOGGLE_META,
  type TeamSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Was auf /mits/team steht — und woran der Balken gemessen wird.

   Ein Formular, als JSON in einem versteckten Feld abgeschickt, wie bei den
   Modulen. Das umgeht die Falle, an der eine Schaltermaske sonst scheitert: ein
   nicht angehakter Schalter wird gar nicht gesendet, also ist „aus" von „war
   nicht im Formular" nicht zu unterscheiden — und jedes Speichern der einen
   Sektion löschte die Schalter der anderen, mit Erfolgsmeldung.

   Die Kapazitäten reisen im selben Absenden, aber in einem eigenen Feld: sie
   sind eine Zahl je Konto und keine Eigenschaft der Instanz, und serverseitig
   landen sie in eigenen Setting-Zeilen.
   ────────────────────────────────────────────────────────────────────────── */

export interface TeamAgentRow {
  id: string;
  name: string;
  email: string;
  /** `null` heißt „nimmt den Instanzwert". */
  capacity: number | null;
}

/** Was im Kapazitätsfeld steht — leer ist ein gültiger Zustand, nicht die Null. */
type CapacityDraft = Record<string, string>;

const toDraft = (agents: TeamAgentRow[]): CapacityDraft =>
  Object.fromEntries(
    agents.map((agent) => [
      agent.id,
      agent.capacity === null ? "" : String(agent.capacity),
    ]),
  );

export function TeamSettingsForm({
  settings,
  agents,
}: {
  settings: TeamSettings;
  agents: TeamAgentRow[];
}) {
  const [current, setCurrent] = useState(settings);
  const [capacities, setCapacities] = useState<CapacityDraft>(() =>
    toDraft(agents),
  );
  const [result, formAction, saving] = useActionState(
    saveTeamSettingsAction,
    null,
  );

  const initialDraft = toDraft(agents);
  const changed =
    (Object.keys(current) as (keyof TeamSettings)[]).some(
      (key) => current[key] !== settings[key],
    ) ||
    agents.some((agent) => capacities[agent.id] !== initialDraft[agent.id]);

  const activeCount = TEAM_TOGGLES.filter((key) => current[key]).length;

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-medium">Angaben</CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                Was abgeschaltet ist, wird auch nicht berechnet.
              </CardDescription>
            </div>
            <Badge variant="outline" className="h-auto rounded-full px-3 py-1">
              {activeCount} von {TEAM_TOGGLES.length} sichtbar
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {TEAM_TOGGLES.map((key) => {
            const meta = TEAM_TOGGLE_META[key];
            const isDefault = current[key] === DEFAULT_TEAM_SETTINGS[key];

            return (
              <div
                key={key}
                className={cn(
                  "flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-background px-4 py-3.5",
                  !current[key] && "opacity-70",
                )}
              >
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={key} className="text-sm font-medium">
                      {meta.label}
                    </Label>
                    {!isDefault && (
                      <Badge
                        variant="outline"
                        className="h-auto rounded-full px-2 py-0.5 text-[11px] font-normal"
                      >
                        vom Standard abweichend
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {meta.description}
                  </p>
                </div>

                <Switch
                  id={key}
                  checked={current[key]}
                  onCheckedChange={(value) =>
                    setCurrent((previous) => ({ ...previous, [key]: value }))
                  }
                  disabled={saving}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Maßstäbe</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Woran der Balken gemessen wird und ab wann ein Ticket als liegen
            geblieben zählt.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="default_capacity"
            label="Kapazität (offene Tickets)"
            value={current.default_capacity}
            min={0}
            max={500}
            disabled={saving}
            onChange={(value) =>
              setCurrent((previous) => ({ ...previous, default_capacity: value }))
            }
          />
          <NumberField
            id="stale_days"
            label="Ohne Bewegung ab (Tage)"
            value={current.stale_days}
            min={0}
            max={90}
            disabled={saving}
            onChange={(value) =>
              setCurrent((previous) => ({ ...previous, stale_days: value }))
            }
            hint="0 blendet die Kachel aus."
          />
          <NumberField
            id="current_work_minutes"
            label="Aktuelles Ticket, Rückblick (Minuten)"
            value={current.current_work_minutes}
            min={5}
            max={480}
            disabled={saving}
            onChange={(value) =>
              setCurrent((previous) => ({
                ...previous,
                current_work_minutes: value,
              }))
            }
          />
        </CardContent>
      </Card>

      {agents.length > 0 && (
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              Kapazität je Konto
            </CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Leer lassen heißt: der Wert oben gilt.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-background px-4 py-3"
              >
                <div className="min-w-56 flex-1">
                  <Label
                    htmlFor={`capacity-${agent.id}`}
                    className="text-sm font-medium"
                  >
                    {agent.name}
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {agent.email}
                  </p>
                </div>
                <Input
                  id={`capacity-${agent.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={500}
                  placeholder={String(current.default_capacity)}
                  className="h-9 w-24 rounded-xl"
                  value={capacities[agent.id] ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    setCapacities((previous) => ({
                      ...previous,
                      [agent.id]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="settings" value={JSON.stringify(current)} />
        <input
          type="hidden"
          name="capacities"
          value={JSON.stringify(capacities)}
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || !changed}
        >
          {saving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SaveIcon strokeWidth={1.5} />
          )}
          {saving ? "Speichern …" : changed ? "Speichern" : "Keine Änderung"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-full px-4"
          disabled={saving}
          onClick={() => setCurrent(DEFAULT_TEAM_SETTINGS)}
        >
          Auf Standard zurücksetzen
        </Button>
      </form>

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
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className="h-10 rounded-xl"
        value={value}
        disabled={disabled}
        /*
         * Ein geleertes Zahlenfeld liefert `""`, und `Number("")` ist `0` — ohne
         * diesen Zweig springt das Feld beim Löschen der letzten Ziffer auf null
         * und tippt sich nicht mehr sauber neu. Der Ausreißer wird beim Parsen
         * serverseitig ohnehin geklemmt.
         */
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          onChange(Number.isFinite(next) ? next : min);
        }}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
