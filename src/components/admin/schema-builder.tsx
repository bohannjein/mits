"use client";

import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  EyeIcon,
  GripVerticalIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  SlidersHorizontalIcon,
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
import {
  FormOptionsProvider,
  type FormFieldOptions,
} from "@/lib/forms/registry";
import { ICON_NAMES } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type {
  MITSFieldUIHint,
  MITSFieldWidget,
  MITSFormSchema,
  MITSTicketDraft,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Form builder: canvas, inspector, live preview.

   Left: the field canvas — drag to reorder, click to select. Right: the inspector
   for whatever is selected, above a preview rendered by the real <SchemaForm> with
   the real compiler. The preview is not a mock-up, so a form that works here works
   in the intake.

   Two things this file is careful about:

   - **The output has to stay valid JSON Schema.** It is handed to Ollama as the
     extraction target, so presentation-only settings go to `uiHints` and never into
     `schema`. A cascading field keeps the union of its mapped values as its own
     `enum` for exactly that reason.
   - **Renaming a field rewrites everything that points at it.** The property, its
     hint, its `required` entry and any condition referencing it. A rename that left
     a condition pointing at a name that no longer exists would hide the dependent
     field forever, with nothing on screen to explain why.
   ────────────────────────────────────────────────────────────────────────── */

const SPRING = { type: "spring" as const, stiffness: 520, damping: 38 };

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
    widget: "datetime",
    label: "Datum & Zeit",
    build: (title) => ({ type: "string", title, format: "date-time" }),
  },
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
    widget: "location",
    label: "Standort",
    build: (title) => ({ type: "string", title, maxLength: 64 }),
  },
  {
    widget: "user",
    label: "Person",
    build: (title) => ({ type: "string", title, maxLength: 64 }),
  },
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

const WIDGET_LABELS: Record<string, string> = Object.fromEntries(
  FIELD_TYPES.map((type) => [type.widget, type.label]),
);

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
  /**
   * `feature_advanced_form_builder`. Gates *authoring* of conditions and cascades,
   * never their evaluation — see the note rendered in the inspector.
   */
  advanced = true,
  /** Live choices so the preview's location and person pickers are populated. */
  fieldOptions = { locations: [], users: [] },
}: {
  /** Schemas already in effect, so one can be loaded for editing. */
  existing: { id: string; title: string; builtIn: boolean }[];
  advanced?: boolean;
  fieldOptions?: FormFieldOptions;
}) {
  const [draft, setDraft] = useState<MITSFormSchema>(EMPTY_SCHEMA);
  const [jsonText, setJsonText] = useState(() => pretty(EMPTY_SCHEMA));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, formAction, saving] = useActionState(saveFormSchemaAction, null);
  const reduced = useReducedMotion();

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
      setSelected(null);
    } catch {
      setJsonError("Schema konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  const properties = draft.schema?.properties ?? {};
  const required = new Set(draft.schema?.required ?? []);

  /*
   * Canvas order. `uiHints.order` wins when present so a drag survives a
   * round-trip through the JSON pane; property order is the fallback, which is
   * what a hand-written schema without any hints relies on.
   */
  const order = useMemo(() => {
    const names = Object.keys(properties);
    return names
      .map((name, index) => ({
        name,
        order: draft.uiHints?.[name]?.order ?? index + 1,
      }))
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.name);
  }, [properties, draft.uiHints]);

  // A field removed in the JSON pane must not stay selected, or the inspector
  // edits a property that no longer exists.
  useEffect(() => {
    if (selected && !(selected in properties)) setSelected(null);
  }, [selected, properties]);

  const writeOrder = (names: string[]) => {
    const uiHints = { ...(draft.uiHints ?? {}) };
    names.forEach((name, index) => {
      uiHints[name] = { ...(uiHints[name] ?? {}), order: index + 1 };
    });
    applyDraft({ ...draft, uiHints });
  };

  const moveField = (name: string, delta: -1 | 1) => {
    const from = order.indexOf(name);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    writeOrder(next);
  };

  const addField = (widget: MITSFieldWidget) => {
    const type = FIELD_TYPES.find((entry) => entry.widget === widget);
    if (!type) return;

    const name = uniqueFieldName(draft, widget);
    applyDraft({
      ...draft,
      schema: {
        ...draft.schema,
        type: "object",
        properties: { ...properties, [name]: type.build("Neues Feld") },
      },
      uiHints: {
        ...(draft.uiHints ?? {}),
        [name]: { widget, order: order.length + 1 },
      },
    });
    setSelected(name);
  };

  const removeField = (name: string) => {
    const nextProperties = { ...properties };
    delete nextProperties[name];
    const uiHints = { ...(draft.uiHints ?? {}) };
    delete uiHints[name];

    // Anything that pointed at the removed field loses its condition rather than
    // keeping a reference to a name that is gone — a dangling `visibleWhen` would
    // hide its field permanently with no way to see why.
    for (const [key, hint] of Object.entries(uiHints)) {
      if (hint.visibleWhen?.field === name) {
        uiHints[key] = { ...hint, visibleWhen: undefined };
      }
      if (hint.optionsFrom?.field === name) {
        uiHints[key] = { ...uiHints[key], optionsFrom: undefined };
      }
    }

    applyDraft({
      ...draft,
      schema: {
        ...draft.schema,
        properties: nextProperties,
        required: [...required].filter((entry) => entry !== name),
      },
      uiHints,
    });
    if (selected === name) setSelected(null);
  };

  /** Move a property to a new name, carrying everything that references it. */
  const renameField = (from: string, to: string) => {
    const target = to.trim();
    if (!target || target === from || target in properties) return;

    const nextProperties: Record<string, JSONSchema7 | boolean> = {};
    for (const [key, value] of Object.entries(properties)) {
      nextProperties[key === from ? target : key] = value;
    }

    const uiHints: Record<string, MITSFieldUIHint> = {};
    for (const [key, hint] of Object.entries(draft.uiHints ?? {})) {
      const moved: MITSFieldUIHint = { ...hint };
      if (moved.visibleWhen?.field === from) {
        moved.visibleWhen = { ...moved.visibleWhen, field: target };
      }
      if (moved.optionsFrom?.field === from) {
        moved.optionsFrom = { ...moved.optionsFrom, field: target };
      }
      uiHints[key === from ? target : key] = moved;
    }

    applyDraft({
      ...draft,
      schema: {
        ...draft.schema,
        properties: nextProperties,
        required: [...required].map((entry) => (entry === from ? target : entry)),
      },
      uiHints,
    });
    setSelected(target);
  };

  const patchProperty = (name: string, patch: Partial<JSONSchema7>) => {
    const property = properties[name];
    if (typeof property !== "object" || property === null) return;
    applyDraft({
      ...draft,
      schema: {
        ...draft.schema,
        properties: { ...properties, [name]: { ...property, ...patch } },
      },
    });
  };

  const patchHint = (name: string, patch: Partial<MITSFieldUIHint>) => {
    const merged: MITSFieldUIHint = {
      ...(draft.uiHints?.[name] ?? {}),
      ...patch,
    };
    // Explicit undefined means "clear it"; leaving the key in place would emit
    // `"visibleWhen": undefined`, which is not valid JSON.
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete merged[key as keyof MITSFieldUIHint];
    }
    applyDraft({
      ...draft,
      uiHints: { ...(draft.uiHints ?? {}), [name]: merged },
    });
  };

  const setRequired = (name: string, value: boolean) => {
    const next = new Set(required);
    if (value) next.add(name);
    else next.delete(name);
    applyDraft({
      ...draft,
      schema: { ...draft.schema, required: [...next] },
    });
  };

  /** Options for an enum field, written back in the shape its type demands. */
  const setOptions = (name: string, values: string[]) => {
    const property = properties[name];
    if (typeof property !== "object" || property === null) return;

    const next: JSONSchema7 = { ...property };
    if (next.type === "array") {
      next.items = { type: "string", enum: values };
    } else {
      next.enum = values;
    }
    patchProperty(name, next);
  };

  /**
   * Store a cascade and mirror its value union into the field's own enum.
   *
   * Without the mirror the property would carry no `enum` at all: the browser
   * would still narrow correctly, but the schema handed to Ollama would describe a
   * free-text field and the model would invent values nothing accepts.
   */
  const setCascade = (name: string, field: string, map: Record<string, string[]>) => {
    const union = [...new Set(Object.values(map).flat())];
    setOptions(name, union);
    patchHint(name, { optionsFrom: { field, map } });
  };

  const idPattern = /^[a-z0-9][a-z0-9-]{1,48}$/;
  const idValid = idPattern.test(draft.id);
  const fieldCount = order.length;
  const canSave =
    !jsonError && idValid && draft.title.trim().length > 0 && fieldCount > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      {/* ── left: header, canvas, palette, JSON ────────────────────────── */}
      <div className="grid min-w-0 gap-5">
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Formular</CardTitle>
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
                  <SelectTrigger className="h-10 w-full rounded-xl">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="schema-id">ID</Label>
                <Input
                  id="schema-id"
                  value={draft.id}
                  placeholder="z. B. monitor-defekt"
                  className="h-10 rounded-xl font-mono"
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
                  className="h-10 rounded-xl"
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
                className="h-10 rounded-xl"
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
                className="rounded-xl"
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
                className="rounded-xl"
                onChange={(event) => applyDraft({ ...draft, aiHint: event.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Icon</Label>
                <Select
                  value={draft.icon ?? "Ticket"}
                  onValueChange={(icon) => applyDraft({ ...draft, icon })}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl">
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
                  className="h-10 rounded-xl"
                  onChange={(event) =>
                    applyDraft({ ...draft, submitLabel: event.target.value })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── canvas ──────────────────────────────────────────────────── */}
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Canvas</CardTitle>
            <CardDescription>
              {fieldCount === 0
                ? "Noch keine Felder — unten einen Typ hinzufügen."
                : "Ziehen ordnet um, Klick öffnet das Feld im Inspektor."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {fieldCount > 0 && (
              <Reorder.Group
                axis="y"
                values={order}
                onReorder={writeOrder}
                className="grid list-none gap-2"
              >
                {order.map((name, index) => (
                  <CanvasRow
                    key={name}
                    name={name}
                    index={index}
                    total={fieldCount}
                    property={properties[name]}
                    hint={draft.uiHints?.[name]}
                    required={required.has(name)}
                    selected={selected === name}
                    reduced={reduced === true}
                    onSelect={() => setSelected(name)}
                    onMove={(delta) => moveField(name, delta)}
                    onRemove={() => removeField(name)}
                  />
                ))}
              </Reorder.Group>
            )}

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
                    className="h-9 rounded-full px-4"
                    onClick={() => addField(type.widget)}
                  >
                    <PlusIcon strokeWidth={1.5} />
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">JSON</CardTitle>
            <CardDescription>
              Dieselbe Definition, direkt editierbar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea
              value={jsonText}
              onChange={(event) => onJsonChange(event.target.value)}
              rows={16}
              spellCheck={false}
              className="rounded-xl font-mono text-xs"
              aria-label="Schema als JSON"
            />
            {jsonError && (
              <Alert variant="destructive" className="rounded-2xl border-border px-4 py-3">
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
            disabled={!canSave || saving}
          >
            {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {saving ? "Speichern …" : "Formular speichern"}
          </Button>
        </form>
      </div>

      {/* ── right: inspector above preview ─────────────────────────────── */}
      <div className="grid gap-5 lg:sticky lg:top-6">
        <FieldInspector
          name={selected}
          property={selected ? properties[selected] : undefined}
          hint={selected ? draft.uiHints?.[selected] : undefined}
          required={selected ? required.has(selected) : false}
          siblings={order.filter((name) => name !== selected)}
          advanced={advanced}
          onRename={renameField}
          onProperty={patchProperty}
          onHint={patchHint}
          onRequired={setRequired}
          onOptions={setOptions}
          onCascade={setCascade}
        />

        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
          <CardHeader>
            <EyeIcon className="size-5 text-primary" aria-hidden />
            <CardTitle className="mt-4 text-lg font-medium">Live-Vorschau</CardTitle>
            <CardDescription>
              Gerendert von derselben <code>&lt;SchemaForm /&gt;</code> wie im
              Ticket-Eingang. Bedingungen greifen hier genauso. Absenden ist
              abgeschaltet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormOptionsProvider options={fieldOptions}>
              <SchemaPreview draft={draft} />
            </FormOptionsProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── canvas row ─────────────────────────────────────────────────────────── */

function CanvasRow({
  name,
  index,
  total,
  property,
  hint,
  required,
  selected,
  reduced,
  onSelect,
  onMove,
  onRemove,
}: {
  name: string;
  index: number;
  total: number;
  property: JSONSchema7 | boolean | undefined;
  hint: MITSFieldUIHint | undefined;
  required: boolean;
  selected: boolean;
  reduced: boolean;
  onSelect: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  // Drag starts on the handle only. With the whole row draggable, clicking to
  // select would start a drag instead.
  const controls = useDragControls();
  const schema = typeof property === "object" && property !== null ? property : {};
  const widget = hint?.widget;
  const conditional = hint?.visibleWhen !== undefined;
  const cascading = hint?.optionsFrom !== undefined;

  return (
    <Reorder.Item
      value={name}
      dragListener={false}
      dragControls={controls}
      transition={reduced ? { duration: 0 } : SPRING}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border bg-background px-3 py-2.5 transition-colors",
        selected
          ? "border-primary/50 shadow-elev-1"
          : "border-border hover:border-foreground/20",
      )}
    >
      <button
        type="button"
        aria-label={`${name} verschieben`}
        onPointerDown={(event) => controls.start(event)}
        className="cursor-grab touch-none rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-4" strokeWidth={1.5} />
      </button>

      {/* The row's select target. Restyled through className rather than rebuilt:
          the default Button centres a single line, this needs a left-aligned stack. */}
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        className="h-auto min-w-40 flex-1 flex-col items-start gap-0.5 px-2 py-1 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {schema.title || name}
          {required && (
            <span aria-hidden className="text-destructive">
              *
            </span>
          )}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{name}</span>
      </Button>

      <div className="flex flex-wrap items-center gap-1">
        {widget && (
          <Badge variant="secondary" className="rounded-full text-[11px] font-normal">
            {WIDGET_LABELS[widget] ?? widget}
          </Badge>
        )}
        {conditional && (
          <Badge variant="outline" className="rounded-full text-[11px] font-normal">
            bedingt
          </Badge>
        )}
        {cascading && (
          <Badge variant="outline" className="rounded-full text-[11px] font-normal">
            abhängig
          </Badge>
        )}
      </div>

      {/* The keyboard path. `Reorder` is pointer-only. */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${name} nach oben`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="rounded-full"
        >
          <ArrowUpIcon strokeWidth={1.5} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${name} nach unten`}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          className="rounded-full"
        >
          <ArrowDownIcon strokeWidth={1.5} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${name} entfernen`}
          onClick={onRemove}
          className="rounded-full"
        >
          <Trash2Icon strokeWidth={1.5} />
        </Button>
      </div>
    </Reorder.Item>
  );
}

/* ── inspector ──────────────────────────────────────────────────────────── */

function FieldInspector({
  name,
  property,
  hint,
  required,
  siblings,
  advanced,
  onRename,
  onProperty,
  onHint,
  onRequired,
  onOptions,
  onCascade,
}: {
  name: string | null;
  property: JSONSchema7 | boolean | undefined;
  hint: MITSFieldUIHint | undefined;
  required: boolean;
  /** Candidate controlling fields — everything but the selected one. */
  siblings: string[];
  advanced: boolean;
  onRename: (from: string, to: string) => void;
  onProperty: (name: string, patch: Partial<JSONSchema7>) => void;
  onHint: (name: string, patch: Partial<MITSFieldUIHint>) => void;
  onRequired: (name: string, value: boolean) => void;
  onOptions: (name: string, values: string[]) => void;
  onCascade: (name: string, field: string, map: Record<string, string[]>) => void;
}) {
  if (!name || typeof property !== "object" || property === null) {
    return (
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <SlidersHorizontalIcon className="size-5 text-muted-foreground" aria-hidden />
          <CardTitle className="mt-4 text-lg font-medium">Inspektor</CardTitle>
          <CardDescription>
            Ein Feld im Canvas anklicken, um Beschriftung, Pflicht, Optionen und
            Bedingungen zu bearbeiten.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const options = enumOf(property);
  const cascade = hint?.optionsFrom;
  const condition = hint?.visibleWhen;

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Inspektor</CardTitle>
        <CardDescription>
          <span className="font-mono text-xs">{name}</span>
          {hint?.widget && ` · ${WIDGET_LABELS[hint.widget] ?? hint.widget}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="insp-title">Beschriftung</Label>
          <Input
            id="insp-title"
            value={property.title ?? ""}
            className="h-10 rounded-xl"
            onChange={(event) => onProperty(name, { title: event.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="insp-name">Feldname</Label>
          <Input
            id="insp-name"
            key={name}
            defaultValue={name}
            spellCheck={false}
            className="h-10 rounded-xl font-mono"
            onBlur={(event) => onRename(name, event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Schlüssel in der Payload. Antworten in bereits gespeicherten Tickets
            behalten den alten Namen.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="insp-placeholder">Platzhalter</Label>
          <Input
            id="insp-placeholder"
            value={hint?.placeholder ?? ""}
            className="h-10 rounded-xl"
            onChange={(event) => onHint(name, { placeholder: event.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="insp-help">Hilfetext</Label>
          <Input
            id="insp-help"
            value={hint?.help ?? ""}
            className="h-10 rounded-xl"
            onChange={(event) => onHint(name, { help: event.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="insp-group">Gruppe</Label>
          <Input
            id="insp-group"
            value={hint?.group ?? ""}
            placeholder="Fieldset-Überschrift, leer für keine"
            className="h-10 rounded-xl"
            onChange={(event) => onHint(name, { group: event.target.value || undefined })}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="insp-required"
            checked={required}
            onCheckedChange={(checked) => onRequired(name, checked === true)}
          />
          <Label htmlFor="insp-required" className="font-normal">
            Pflichtfeld
          </Label>
        </div>

        {options && !cascade && (
          <>
            <Separator className="bg-border" />
            <div className="grid gap-2">
              <Label htmlFor="insp-options">Optionen (kommagetrennt)</Label>
              <Input
                id="insp-options"
                key={`${name}-options`}
                defaultValue={options.join(", ")}
                spellCheck={false}
                className="h-10 rounded-xl font-mono text-xs"
                onBlur={(event) =>
                  onOptions(
                    name,
                    event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  )
                }
              />
            </div>
          </>
        )}

        {advanced ? (
          <>
            <Separator className="bg-border" />

            {/* ── conditional visibility ─────────────────────────────── */}
            <div className="grid gap-2">
              <Label>Nur zeigen, wenn</Label>
              <div className="grid gap-2">
                <Select
                  value={condition?.field ?? "__none"}
                  onValueChange={(value) =>
                    onHint(
                      name,
                      value === "__none"
                        ? { visibleWhen: undefined }
                        : {
                            visibleWhen: {
                              field: value,
                              equals: condition?.equals ?? [],
                            },
                          },
                    )
                  }
                >
                  <SelectTrigger className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="Immer zeigen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Immer zeigen</SelectItem>
                    {siblings.map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {condition && (
                  <Input
                    key={`${name}-cond`}
                    defaultValue={condition.equals.join(", ")}
                    placeholder="einen dieser Werte hat, z. B. laptop, desktop"
                    spellCheck={false}
                    className="h-10 rounded-xl font-mono text-xs"
                    aria-label="Werte, die das Feld einblenden"
                    onBlur={(event) =>
                      onHint(name, {
                        visibleWhen: {
                          field: condition.field,
                          equals: event.target.value
                            .split(",")
                            .map((entry) => entry.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                )}
              </div>
              {condition && condition.equals.length === 0 && (
                <p className="text-xs font-medium text-warning">
                  Ohne Werte bleibt das Feld dauerhaft verborgen.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Bei Checkbox und Schalter sind die Werte <code>true</code> und{" "}
                <code>false</code>.
              </p>
            </div>

            {/* ── cascading options ──────────────────────────────────── */}
            {(options || cascade) && (
              <>
                <Separator className="bg-border" />
                <div className="grid gap-2">
                  <Label>Auswahl abhängig von</Label>
                  <Select
                    value={cascade?.field ?? "__none"}
                    onValueChange={(value) =>
                      value === "__none"
                        ? onHint(name, { optionsFrom: undefined })
                        : onCascade(name, value, cascade?.map ?? {})
                    }
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue placeholder="Feste Optionen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Feste Optionen</SelectItem>
                      {siblings.map((field) => (
                        <SelectItem key={field} value={field}>
                          {field}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {cascade && (
                    <>
                      <Textarea
                        key={`${name}-cascade`}
                        defaultValue={formatCascade(cascade.map)}
                        rows={5}
                        spellCheck={false}
                        className="rounded-xl font-mono text-xs"
                        aria-label="Zuordnung von Elternwert zu Optionen"
                        onBlur={(event) =>
                          onCascade(name, cascade.field, parseCascade(event.target.value))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Eine Zeile pro Wert des Feldes{" "}
                        <code>{cascade.field}</code>, Format{" "}
                        <code>wert: option-a, option-b</code>.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <Separator className="bg-border" />
            <Alert className="rounded-2xl border-border px-4 py-3">
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertTitle>Erweiterter Builder ist aus</AlertTitle>
              <AlertDescription>
                Bedingte Sichtbarkeit und abhängige Auswahl lassen sich nicht
                bearbeiten. Bereits gespeicherte Bedingungen bleiben wirksam — ein
                Schalter im Admin-Bereich soll nicht die Pflichtfelder
                veröffentlichter Formulare verändern. Einschalten unter{" "}
                <code>/admin/settings/features</code>.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── preview ────────────────────────────────────────────────────────────── */

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
          <pre className="max-h-60 overflow-auto rounded-xl border border-border bg-muted p-3 font-mono text-xs">
            {JSON.stringify(submitted.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function pretty(schema: MITSFormSchema): string {
  return JSON.stringify(schema, null, 2);
}

/** Enum values of a property, whether it carries them directly or on `items`. */
function enumOf(property: JSONSchema7): string[] | undefined {
  if (Array.isArray(property.enum)) {
    return property.enum.filter((value): value is string => typeof value === "string");
  }
  const { items } = property;
  if (typeof items === "object" && items !== null && !Array.isArray(items)) {
    const inner = (items as JSONSchema7).enum;
    if (Array.isArray(inner)) {
      return inner.filter((value): value is string => typeof value === "string");
    }
  }
  return undefined;
}

/** `parent: a, b` per line → `{ parent: ["a", "b"] }`. */
function parseCascade(text: string): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;

    const key = line.slice(0, separator).trim();
    if (!key) continue;

    map[key] = line
      .slice(separator + 1)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return map;
}

function formatCascade(map: Record<string, string[]>): string {
  return Object.entries(map)
    .map(([key, values]) => `${key}: ${values.join(", ")}`)
    .join("\n");
}

/** `text_1`, `text_2`, … — never collides with an existing property. */
function uniqueFieldName(draft: MITSFormSchema, widget: string): string {
  const taken = new Set(Object.keys(draft.schema?.properties ?? {}));
  let index = 1;
  while (taken.has(`${widget}_${index}`)) index += 1;
  return `${widget}_${index}`;
}
