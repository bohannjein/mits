"use client";

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { JSONSchema7 } from "json-schema";

import { saveFormSchemaAction } from "@/app/admin/actions";
import { SchemaForm } from "@/components/forms/schema-form";
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
import { Textarea } from "@/components/ui/textarea";
import { ICON_NAMES } from "@/lib/icons";
import type {
  MITSFieldWidget,
  MITSFormSchema,
  MITSTicketDraft,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Split-screen form builder.

   Left: the schema, editable either field by field or as raw JSON. Right: the
   real <SchemaForm> rendering that schema. The preview is not a mock-up — it is
   the same component and the same compiler the intake uses, so what passes here
   passes in production.
   ────────────────────────────────────────────────────────────────────────── */

/** Widgets offered in the builder, with the JSON Schema each one produces. */
const FIELD_TYPES: {
  widget: MITSFieldWidget;
  label: string;
  build: (title: string) => JSONSchema7;
}[] = [
  { widget: "text", label: "Text (einzeilig)", build: (title) => ({ type: "string", title, maxLength: 160 }) },
  { widget: "textarea", label: "Text (mehrzeilig)", build: (title) => ({ type: "string", title, maxLength: 2000 }) },
  { widget: "number", label: "Zahl", build: (title) => ({ type: "integer", title, minimum: 0 }) },
  { widget: "email", label: "E-Mail", build: (title) => ({ type: "string", title, format: "email" }) },
  { widget: "date", label: "Datum", build: (title) => ({ type: "string", title, format: "date" }) },
  {
    widget: "select",
    label: "Auswahl (eine)",
    build: (title) => ({ type: "string", title, enum: ["option-a", "option-b"] }),
  },
  {
    widget: "radio",
    label: "Auswahl (Radio)",
    build: (title) => ({ type: "string", title, enum: ["option-a", "option-b"] }),
  },
  {
    widget: "multiselect",
    label: "Auswahl (mehrere)",
    build: (title) => ({
      type: "array",
      title,
      items: { type: "string", enum: ["option-a", "option-b"] },
    }),
  },
  { widget: "checkbox", label: "Checkbox", build: (title) => ({ type: "boolean", title }) },
  { widget: "switch", label: "Schalter", build: (title) => ({ type: "boolean", title }) },
  {
    widget: "file",
    label: "Datei-Anhang",
    build: (title) => ({
      type: "array",
      title,
      maxItems: 5,
      items: { type: "string", format: "data-url" },
    }),
  },
];

const EMPTY_SCHEMA: MITSFormSchema = {
  id: "",
  title: "",
  description: "",
  category: "Allgemein",
  version: 1,
  icon: "Ticket",
  submitLabel: "Ticket senden",
  aiHint: "",
  schema: { type: "object", required: [], properties: {} },
  uiHints: {},
};

export function SchemaBuilder({
  existing,
}: {
  /** Schemas already in effect, so one can be loaded for editing. */
  existing: { id: string; title: string; builtIn: boolean }[];
}) {
  const [draft, setDraft] = useState<MITSFormSchema>(EMPTY_SCHEMA);
  const [jsonText, setJsonText] = useState(() => pretty(EMPTY_SCHEMA));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, formAction, saving] = useActionState(saveFormSchemaAction, null);

  /** Replace the whole draft and re-render the JSON pane from it. */
  const applyDraft = (next: MITSFormSchema) => {
    setDraft(next);
    setJsonText(pretty(next));
    setJsonError(null);
  };

  // The JSON pane is authoritative while it parses: typing there updates the
  // draft, and anything invalid leaves the last good draft in place so the
  // preview does not blank out mid-edit.
  const onJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value) as MITSFormSchema;
      if (!parsed || typeof parsed !== "object") throw new Error("Kein Objekt.");
      setDraft(parsed);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Ungültiges JSON.");
    }
  };

  const loadExisting = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/form-schemas/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { schema: MITSFormSchema };
      applyDraft(body.schema);
    } catch {
      setJsonError("Schema konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  const fields = Object.entries(draft.schema?.properties ?? {});
  const required = new Set(draft.schema?.required ?? []);

  const addField = (widget: MITSFieldWidget) => {
    const type = FIELD_TYPES.find((entry) => entry.widget === widget);
    if (!type) return;

    const name = uniqueFieldName(draft, widget);
    const next: MITSFormSchema = {
      ...draft,
      schema: {
        ...draft.schema,
        type: "object",
        properties: {
          ...(draft.schema?.properties ?? {}),
          [name]: type.build("Neues Feld"),
        },
      },
      uiHints: {
        ...(draft.uiHints ?? {}),
        [name]: { widget, order: fields.length + 1 },
      },
    };
    applyDraft(next);
  };

  const updateField = (
    name: string,
    change: { title?: string; required?: boolean; placeholder?: string; options?: string },
  ) => {
    const property = draft.schema?.properties?.[name];
    if (!property || typeof property !== "object") return;

    const nextProperty: JSONSchema7 = { ...property };
    if (change.title !== undefined) nextProperty.title = change.title;

    if (change.options !== undefined) {
      const values = change.options
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (nextProperty.type === "array") {
        nextProperty.items = { type: "string", enum: values };
      } else {
        nextProperty.enum = values;
      }
    }

    const nextRequired = new Set(required);
    if (change.required === true) nextRequired.add(name);
    if (change.required === false) nextRequired.delete(name);

    applyDraft({
      ...draft,
      schema: {
        ...draft.schema,
        required: [...nextRequired],
        properties: { ...(draft.schema?.properties ?? {}), [name]: nextProperty },
      },
      uiHints:
        change.placeholder === undefined
          ? draft.uiHints
          : {
              ...(draft.uiHints ?? {}),
              [name]: { ...(draft.uiHints?.[name] ?? {}), placeholder: change.placeholder },
            },
    });
  };

  const removeField = (name: string) => {
    const properties = { ...(draft.schema?.properties ?? {}) };
    delete properties[name];
    const uiHints = { ...(draft.uiHints ?? {}) };
    delete uiHints[name];

    applyDraft({
      ...draft,
      schema: {
        ...draft.schema,
        properties,
        required: (draft.schema?.required ?? []).filter((entry) => entry !== name),
      },
      uiHints,
    });
  };

  const moveField = (name: string, direction: -1 | 1) => {
    const order = fields.map(([key]) => key);
    const from = order.indexOf(name);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];

    // Order is expressed through uiHints, so the JSON Schema property order stays
    // untouched and the change survives a round-trip through the JSON pane.
    const uiHints = { ...(draft.uiHints ?? {}) };
    order.forEach((key, index) => {
      uiHints[key] = { ...(uiHints[key] ?? {}), order: index + 1 };
    });
    applyDraft({ ...draft, uiHints });
  };

  // A save is only meaningful once the form has an id and at least one field.
  const idPattern = /^[a-z0-9][a-z0-9-]{1,48}$/;
  const idValid = idPattern.test(draft.id);
  const canSave =
    !jsonError && idValid && draft.title.trim().length > 0 && fields.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* ── left: configurator ─────────────────────────────────────────── */}
      <div className="grid gap-5">
        <Card className="rounded-sm border-2 border-border ring-0">
          <CardHeader>
            <CardTitle className="uppercase">Formular</CardTitle>
            <CardDescription>
              Kopfdaten. Die ID landet als <code>form_schema_id</code> im Ticket und
              darf sich später nicht mehr ändern.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {existing.length > 0 && (
              <div className="grid gap-2">
                <Label>Vorhandenes Formular laden</Label>
                <Select disabled={loading} onValueChange={loadExisting}>
                  <SelectTrigger className="h-9 w-full rounded-sm">
                    <SelectValue placeholder="Zum Bearbeiten auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {existing.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.title} {entry.builtIn ? "(eingebaut)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="schema-id">ID</Label>
                <Input
                  id="schema-id"
                  value={draft.id}
                  placeholder="z. B. monitor-defekt"
                  className="rounded-sm font-mono"
                  onChange={(event) =>
                    applyDraft({ ...draft, id: event.target.value.toLowerCase() })
                  }
                />
                {draft.id && !idValid && (
                  <p className="text-xs font-medium text-destructive">
                    Nur Kleinbuchstaben, Ziffern und Bindestriche, 2–49 Zeichen.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="schema-category">Kategorie</Label>
                <Input
                  id="schema-category"
                  value={draft.category}
                  className="rounded-sm"
                  onChange={(event) =>
                    applyDraft({ ...draft, category: event.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="schema-title">Titel</Label>
              <Input
                id="schema-title"
                value={draft.title}
                placeholder="z. B. Monitor defekt melden"
                className="rounded-sm"
                onChange={(event) =>
                  applyDraft({ ...draft, title: event.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="schema-description">Beschreibung</Label>
              <Textarea
                id="schema-description"
                rows={2}
                value={draft.description ?? ""}
                className="rounded-sm"
                onChange={(event) =>
                  applyDraft({ ...draft, description: event.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="schema-aihint">Hinweis für die KI-Triage</Label>
              <Textarea
                id="schema-aihint"
                rows={2}
                value={draft.aiHint ?? ""}
                placeholder="Wann passt dieses Formular? Wird dem Routing-Modell vorgelegt."
                className="rounded-sm"
                onChange={(event) => applyDraft({ ...draft, aiHint: event.target.value })}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Icon</Label>
                <Select
                  value={draft.icon ?? "Ticket"}
                  onValueChange={(icon) => applyDraft({ ...draft, icon })}
                >
                  <SelectTrigger className="h-9 w-full rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="schema-submit">Beschriftung des Absenden-Buttons</Label>
                <Input
                  id="schema-submit"
                  value={draft.submitLabel ?? ""}
                  className="rounded-sm"
                  onChange={(event) =>
                    applyDraft({ ...draft, submitLabel: event.target.value })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-sm border-2 border-border ring-0">
          <CardHeader>
            <CardTitle className="uppercase">Felder</CardTitle>
            <CardDescription>
              {fields.length === 0
                ? "Noch keine Felder — unten einen Typ hinzufügen."
                : `${fields.length} Feld${fields.length === 1 ? "" : "er"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {fields.map(([name, property], index) => {
              const schemaProperty =
                typeof property === "object" && property !== null ? property : {};
              const widget = draft.uiHints?.[name]?.widget;
              const enumValues =
                (schemaProperty.enum as string[] | undefined) ??
                (typeof schemaProperty.items === "object" &&
                schemaProperty.items !== null &&
                !Array.isArray(schemaProperty.items)
                  ? ((schemaProperty.items as JSONSchema7).enum as string[] | undefined)
                  : undefined);

              return (
                <div key={name} className="grid gap-3 rounded-sm border-2 border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-sm font-mono">
                        {name}
                      </Badge>
                      {widget && (
                        <Badge variant="secondary" className="rounded-sm font-mono">
                          {widget}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="nach oben"
                        disabled={index === 0}
                        onClick={() => moveField(name, -1)}
                      >
                        <ChevronUpIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="nach unten"
                        disabled={index === fields.length - 1}
                        onClick={() => moveField(name, 1)}
                      >
                        <ChevronDownIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`${name} entfernen`}
                        onClick={() => removeField(name)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor={`title-${name}`}>Beschriftung</Label>
                    <Input
                      id={`title-${name}`}
                      value={schemaProperty.title ?? ""}
                      className="rounded-sm"
                      onChange={(event) =>
                        updateField(name, { title: event.target.value })
                      }
                    />
                  </div>

                  {enumValues && (
                    <div className="grid gap-2">
                      <Label htmlFor={`options-${name}`}>
                        Optionen (kommagetrennt)
                      </Label>
                      <Input
                        id={`options-${name}`}
                        defaultValue={enumValues.join(", ")}
                        className="rounded-sm font-mono"
                        onBlur={(event) =>
                          updateField(name, { options: event.target.value })
                        }
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Switch
                      id={`required-${name}`}
                      checked={required.has(name)}
                      onCheckedChange={(checked) =>
                        updateField(name, { required: checked === true })
                      }
                    />
                    <Label htmlFor={`required-${name}`}>Pflichtfeld</Label>
                  </div>
                </div>
              );
            })}

            <Separator className="bg-border" />

            <div className="grid gap-2">
              <Label>Feld hinzufügen</Label>
              <div className="flex flex-wrap gap-2">
                {FIELD_TYPES.map((type) => (
                  <Button
                    key={type.widget}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                    onClick={() => addField(type.widget)}
                  >
                    <PlusIcon />
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-sm border-2 border-border ring-0">
          <CardHeader>
            <CardTitle className="uppercase">JSON</CardTitle>
            <CardDescription>
              Dieselbe Definition, direkt editierbar. Ungültiges JSON lässt die
              Vorschau auf dem letzten gültigen Stand.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea
              value={jsonText}
              onChange={(event) => onJsonChange(event.target.value)}
              rows={18}
              spellCheck={false}
              className="rounded-sm font-mono text-xs"
              aria-label="Schema als JSON"
            />
            {jsonError && (
              <Alert variant="destructive" className="rounded-sm border-2">
                <TriangleAlertIcon />
                <AlertTitle>JSON ungültig</AlertTitle>
                <AlertDescription>{jsonError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="definition" value={JSON.stringify(draft)} />
          {result && (
            <Alert
              variant={result.ok ? "default" : "destructive"}
              className="rounded-sm border-2"
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
            className="w-fit rounded-sm"
            disabled={!canSave || saving}
          >
            {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {saving ? "Speichern …" : "Formular speichern"}
          </Button>
          {!canSave && !jsonError && (
            <p className="text-xs text-muted-foreground">
              Zum Speichern braucht das Formular eine gültige ID, einen Titel und
              mindestens ein Feld.
            </p>
          )}
        </form>
      </div>

      {/* ── right: live preview ────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-6">
        <Card className="rounded-sm border-2 border-border shadow-brutal ring-0">
          <CardHeader>
            <EyeIcon className="size-5 text-primary" aria-hidden />
            <CardTitle className="mt-2 uppercase">Live-Vorschau</CardTitle>
            <CardDescription>
              Gerendert von derselben <code>&lt;SchemaForm /&gt;</code> wie im
              Ticket-Eingang. Absenden ist hier abgeschaltet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SchemaPreview draft={draft} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * The preview form.
 *
 * Remounted whenever the schema changes — react-hook-form keeps its default
 * values for the life of the component, so without a fresh key a newly added
 * field would render uncontrolled.
 */
function SchemaPreview({ draft }: { draft: MITSFormSchema }) {
  const [submitted, setSubmitted] = useState<MITSTicketDraft | null>(null);
  const signature = useMemo(() => JSON.stringify(draft), [draft]);

  useEffect(() => {
    setSubmitted(null);
  }, [signature]);

  const fieldCount = Object.keys(draft.schema?.properties ?? {}).length;
  if (fieldCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sobald das Formular ein Feld hat, erscheint es hier.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <SchemaForm
        key={signature}
        schema={draft}
        source="wizard"
        onSubmit={(value) => {
          // Preview only: nothing is persisted, the payload is shown instead.
          setSubmitted(value);
        }}
      />
      {submitted && (
        <div className="grid gap-1.5">
          <span className="label-industrial">Validierte Vorschau-Payload</span>
          <pre className="max-h-60 overflow-auto rounded-sm border-2 border-border bg-muted p-3 font-mono text-xs">
            {JSON.stringify(submitted.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function pretty(schema: MITSFormSchema): string {
  return JSON.stringify(schema, null, 2);
}

/** `text_1`, `text_2`, … — never collides with an existing property. */
function uniqueFieldName(draft: MITSFormSchema, widget: string): string {
  const taken = new Set(Object.keys(draft.schema?.properties ?? {}));
  let index = 1;
  while (taken.has(`${widget}_${index}`)) index += 1;
  return `${widget}_${index}`;
}
