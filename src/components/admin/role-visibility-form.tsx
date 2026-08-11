"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import {
  saveRoleVisibilityAction,
  saveVisibilityPresetsAction,
} from "@/app/admin/actions";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS_PLURAL } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ROLE_VISIBILITY,
  NAV_AREA_META,
  RESTRICTABLE_ROLES,
  TICKET_PRIORITY_LABELS,
  TicketPriorityValues,
  areasForRole,
  presetRulesFor,
  toTicketPriority,
  type NavArea,
  type RestrictableRole,
  type RoleRules,
  type RoleVisibility,
  type RoleVisibilityRules,
  type VisibilityPreset,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Sichtbarkeit je Rolle.

   Ein Schalter heißt **sichtbar**, nicht „ausgeblendet". Gespeichert wird die
   Gegenrichtung — eine Liste des Weggenommenen —, und genau deshalb steht die
   Umkehrung hier und nicht in der Maske: ein Feld, das man einschaltet, um
   etwas wegzunehmen, wird beim Überfliegen falsch gelesen, und der Preis dafür
   ist eine Rolle, die plötzlich nichts mehr sieht.
   ────────────────────────────────────────────────────────────────────────── */

export interface FormEntry {
  id: string;
  title: string;
  category: string;
  /** Das Freitext-Formular. Trägt den Reiter „Schnellerstellung". */
  fallback: boolean;
}

export function RoleVisibilityForm({
  visibility,
  forms,
  presets: storedPresets,
}: {
  visibility: RoleVisibility;
  forms: FormEntry[];
  presets: VisibilityPreset[];
}) {
  const [current, setCurrent] = useState(visibility);
  const [result, formAction, saving] = useActionState(
    saveRoleVisibilityAction,
    null,
  );

  const changed = JSON.stringify(current) !== JSON.stringify(visibility);
  const formIds = forms.map((form) => form.id);

  /*
   * Die Vorlagenliste liegt hier und nicht in der Karte, obwohl sie pro Reiter
   * gerendert wird: gespeichert wird immer die **ganze** Liste, und zwei Karten
   * mit je eigenem State würden sich beim Speichern gegenseitig die Vorlagen der
   * anderen Rolle überschreiben.
   */
  const [presets, setPresets] = useState(storedPresets);
  const [presetResult, presetAction, presetSaving] = useActionState(
    saveVisibilityPresetsAction,
    null,
  );
  const presetsChanged =
    JSON.stringify(presets) !== JSON.stringify(storedPresets);

  const setForm = (role: RestrictableRole, id: string, visible: boolean) =>
    setCurrent((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        hidden_forms: visible
          ? prev[role].hidden_forms.filter((entry) => entry !== id)
          : [...new Set([...prev[role].hidden_forms, id])],
      },
    }));

  /*
   * Durch `toTicketPriority`, obwohl der Wert aus einer gerade gerenderten Liste
   * kommt: der Blob geht als JSON in ein verstecktes Feld, und was am Ende zaehlt,
   * ist ohnehin die Pruefung in der Action. Hier kostet sie nichts und haelt den
   * State auf einem Wert, den das Select auch anzeigen kann.
   */
  const setPriority = (role: RestrictableRole, value: string) =>
    setCurrent((prev) => ({
      ...prev,
      [role]: { ...prev[role], default_priority: toTicketPriority(value) },
    }));

  const setArea = (role: RestrictableRole, area: NavArea, visible: boolean) =>
    setCurrent((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        hidden_areas: visible
          ? prev[role].hidden_areas.filter((entry) => entry !== area)
          : [...new Set([...prev[role].hidden_areas, area])],
      },
    }));

  return (
    <div className="grid gap-6">
      <Tabs defaultValue={RESTRICTABLE_ROLES[0]}>
        <TabsList className="rounded-full">
          {RESTRICTABLE_ROLES.map((role) => {
            const taken =
              current[role].hidden_forms.length +
              current[role].hidden_areas.length;

            return (
              <TabsTrigger
                key={role}
                value={role}
                className="rounded-full px-4"
              >
                {ROLE_LABELS_PLURAL[role]}
                {taken > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-2 h-auto rounded-full px-2 py-0 text-[11px] font-normal"
                  >
                    {taken}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {RESTRICTABLE_ROLES.map((role) => (
          <TabsContent key={role} value={role} className="mt-6 grid gap-6">
            <IntakeWarning role={role} current={current} forms={forms} />

            <PresetCard
              role={role}
              presets={presets}
              onPresets={setPresets}
              formIds={formIds}
              rules={current[role]}
              onApply={(rules) =>
                setCurrent((prev) => ({
                  ...prev,
                  // Gemischt, nicht ersetzt — siehe `onApply` an `PresetCard`.
                  [role]: { ...prev[role], ...rules },
                }))
              }
              action={presetAction}
              saving={presetSaving}
              changed={presetsChanged}
              result={presetResult}
            />

            {/*
              Die einzige Karte hier, die etwas *setzt* statt etwas wegzunehmen.

              Für einen Melder ist der Wert die Obergrenze: sein Entwurf kann keine
              Priorität mitbringen, `createTicket` klemmt ihn auf diesen Wert. Für
              einen Agenten ist es der Startwert, den er im Ticket überschreibt.
              Beides steht in der Beschreibung, weil dieselbe Einstellung für die
              beiden Reiter zwei verschiedene Dinge bedeutet.
            */}
            <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Neue Tickets</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  {role === "user"
                    ? "Mit dieser Priorität startet jedes Ticket dieser Rolle. Ein Melder kann sie nicht selbst setzen."
                    : "Startwert, wenn beim Erstellen keine Priorität angegeben wird. Am Ticket weiter änderbar."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Label htmlFor={`${role}-default-priority`}>Priorität</Label>
                  <Select
                    value={current[role].default_priority}
                    onValueChange={(next) => setPriority(role, next)}
                    disabled={saving}
                  >
                    <SelectTrigger
                      id={`${role}-default-priority`}
                      className="h-10 rounded-xl sm:w-64"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TicketPriorityValues.map((value) => (
                        <SelectItem key={value} value={value}>
                          {TICKET_PRIORITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Bereiche</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Abgeschaltet verschwindet der Bereich aus der Navigation, und
                  der direkte Aufruf landet auf der Startseite dieser Rolle.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {areasForRole(role).map((area) => {
                  const meta = NAV_AREA_META[area];
                  const visible = !current[role].hidden_areas.includes(area);

                  return (
                    <Row
                      key={area}
                      id={`${role}-${area}`}
                      label={meta.label}
                      description={meta.description}
                      visible={visible}
                      disabled={saving}
                      onChange={(next) => setArea(role, area, next)}
                    />
                  );
                })}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Formulare</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Ein abgeschaltetes Formular fehlt im Katalog, und ein Entwurf
                  darauf wird beim Absenden abgelehnt. Bereits damit erfasste
                  Tickets bleiben lesbar.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {forms.map((form) => {
                  const visible = !current[role].hidden_forms.includes(form.id);

                  return (
                    <Row
                      key={form.id}
                      id={`${role}-form-${form.id}`}
                      label={form.title}
                      description={
                        form.fallback
                          ? "Freitext-Meldung. Trägt den Reiter „Schnellerstellung“ — ohne dieses Formular gibt es den Reiter nicht."
                          : form.category
                      }
                      mono={form.id}
                      visible={visible}
                      disabled={saving}
                      onChange={(next) => setForm(role, form.id, next)}
                    />
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="visibility" value={JSON.stringify(current)} />
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
          {saving
            ? "Speichern …"
            : changed
              ? "Sichtbarkeit speichern"
              : "Keine Änderung"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-full px-4"
          disabled={saving}
          onClick={() => setCurrent(DEFAULT_ROLE_VISIBILITY)}
        >
          Alles sichtbar machen
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

/**
 * Vorlagen für eine Rolle: anwenden, umbenennen, löschen, neu sichern.
 *
 * „Anwenden" schreibt nur in die Schalter darunter — gespeichert wird die
 * Sichtbarkeit mit ihrem eigenen Knopf am Seitenende. Zwei Knöpfe, weil es zwei
 * Dinge sind: eine Vorlage anzulegen darf nicht die halb gesetzten Schalter
 * daneben mitschreiben, und eine Vorlage anzuwenden darf nicht sofort für alle
 * gelten.
 */
function PresetCard({
  role,
  presets,
  onPresets,
  formIds,
  rules,
  onApply,
  action,
  saving,
  changed,
  result,
}: {
  role: RestrictableRole;
  presets: VisibilityPreset[];
  onPresets: (next: VisibilityPreset[]) => void;
  formIds: string[];
  /** Die aktuell gesetzten Schalter dieser Rolle — Grundlage für „sichern". */
  rules: RoleRules;
  /**
   * Bekommt nur die Sichtbarkeitshälfte.
   *
   * Die Startpriorität bleibt stehen: eine Vorlage ist eine Aussage über
   * Sichtbarkeit, und „Personalabteilung anwenden" darf keine Datenentscheidung
   * mitverstellen, die drei Karten weiter unten steht.
   */
  onApply: (rules: RoleVisibilityRules) => void;
  action: (formData: FormData) => void;
  saving: boolean;
  changed: boolean;
  result: { ok: boolean; message?: string; error?: string } | null;
}) {
  const [name, setName] = useState("");
  const mine = presets.filter((preset) => preset.role === role);

  const rename = (id: string, next: string) =>
    onPresets(
      presets.map((preset) =>
        preset.id === id ? { ...preset, name: next } : preset,
      ),
    );

  const remove = (id: string) =>
    onPresets(presets.filter((preset) => preset.id !== id));

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    onPresets([
      ...presets,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        role,
        // Eine Momentaufnahme der Schalter. Anders als bei den mitgelieferten
        // Vorlagen keine Positivliste — „gesichert" heißt: genau das hier.
        hidden_forms: [...rules.hidden_forms],
        hidden_areas: [...rules.hidden_areas],
      },
    ]);
    setName("");
  };

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Vorlagen</CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Eine gespeicherte Zusammenstellung, mit einem Klick auf die Schalter
          darunter gelegt. Sie gilt für jedes Konto mit dieser Rolle — es gibt
          keine Zuordnung pro Person.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {mine.length === 0 && (
          <p className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            Keine Vorlage für diese Rolle.
          </p>
        )}

        {mine.map((preset) => {
          const applied = presetRulesFor(preset, formIds);
          const parts = [
            applied.hidden_forms.length > 0
              ? `${applied.hidden_forms.length} Formular${applied.hidden_forms.length === 1 ? "" : "e"} aus`
              : null,
            applied.hidden_areas.length > 0
              ? `${applied.hidden_areas.length} Bereich${applied.hidden_areas.length === 1 ? "" : "e"} aus`
              : null,
          ].filter(Boolean);

          return (
            <div
              key={preset.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3"
            >
              <div className="min-w-48 flex-1">
                <Input
                  value={preset.name}
                  onChange={(event) => rename(preset.id, event.target.value)}
                  disabled={saving}
                  aria-label="Name der Vorlage"
                  className="h-10 rounded-xl"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {parts.length > 0 ? parts.join(" · ") : "Nimmt nichts weg."}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                disabled={saving}
                onClick={() => onApply(applied)}
              >
                <WandSparklesIcon strokeWidth={1.5} />
                Anwenden
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 rounded-full text-muted-foreground hover:text-destructive"
                disabled={saving}
                aria-label={`Vorlage „${preset.name}“ löschen`}
                onClick={() => remove(preset.id)}
              >
                <Trash2Icon strokeWidth={1.5} />
              </Button>
            </div>
          );
        })}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Enter in einem Feld ohne umgebendes Formular tut sonst nichts,
              // und ein Feld neben einem Knopf lädt genau dazu ein.
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            disabled={saving}
            placeholder="Personalabteilung"
            aria-label="Name der neuen Vorlage"
            className="h-10 min-w-48 flex-1 rounded-xl"
          />
          <Button
            type="button"
            size="sm"
            className="h-10 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={saving || name.trim() === ""}
            onClick={add}
          >
            <PlusIcon strokeWidth={1.5} />
            Aktuelle Auswahl sichern
          </Button>
        </div>

        <form action={action} className="mt-2 flex flex-wrap items-center gap-3">
          {/* Die ganze Liste, nicht nur die dieser Rolle — sonst nähme ein
              Speichern im einen Reiter die Vorlagen des anderen mit. */}
          <input type="hidden" name="presets" value={JSON.stringify(presets)} />
          <Button
            type="submit"
            size="sm"
            className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            disabled={saving || !changed}
          >
            {saving ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SaveIcon strokeWidth={1.5} />
            )}
            {saving
              ? "Speichern …"
              : changed
                ? "Vorlagen speichern"
                : "Vorlagen unverändert"}
          </Button>
        </form>

        {result && (
          <Alert
            variant={result.ok ? "default" : "destructive"}
            className="mt-1 rounded-2xl border-border px-4 py-3"
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
      </CardContent>
    </Card>
  );
}

function Row({
  id,
  label,
  description,
  mono,
  visible,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  mono?: string;
  visible: boolean;
  disabled: boolean;
  onChange: (visible: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-background px-4 py-3.5",
        !visible && "opacity-70",
      )}
    >
      <div className="min-w-56 flex-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
        {mono && (
          <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
            {mono}
          </span>
        )}
      </div>

      <Switch
        id={id}
        checked={visible}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Der eine Zustand, den man versehentlich herstellt.
 *
 * Drei Schalter, die einzeln harmlos sind, nehmen zusammen den letzten Weg in
 * ein Ticket: kein Freitext-Formular, kein Katalogeintrag, kein KI-Chat. Der
 * Eingang steht dann als leere Seite da, und niemand am Bildschirm sieht,
 * welcher der drei Schalter dafür verantwortlich ist.
 */
function IntakeWarning({
  role,
  current,
  forms,
}: {
  role: RestrictableRole;
  current: RoleVisibility;
  forms: FormEntry[];
}) {
  const hiddenForms = current[role].hidden_forms;
  const hiddenAreas = current[role].hidden_areas;

  if (hiddenAreas.includes("customer_new")) return null;

  const anyForm = forms.some((form) => !hiddenForms.includes(form.id));
  if (anyForm || !hiddenAreas.includes("intake_ai")) return null;

  return (
    <Alert className="rounded-2xl border-warning/40 px-4 py-3">
      <TriangleAlertIcon strokeWidth={1.5} />
      <AlertTitle>Kein Weg mehr ins Ticket</AlertTitle>
      <AlertDescription>
        Ohne Formular und ohne KI-Assistent bleibt der Ticketeingang für diese
        Rolle leer. Tickets kommen dann nur noch per E-Mail oder über die
        Schnittstelle herein.
      </AlertDescription>
    </Alert>
  );
}
