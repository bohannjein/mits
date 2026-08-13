"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Form } from "@/components/forms/form";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderField } from "@/lib/forms/registry";
import {
  cascadedValues,
  defaultValuesFor,
  resolveFieldsFor,
  schemaToZod,
  stepCount,
} from "@/lib/forms/schema-to-zod";
import type { MITSFormSchema, MITSTicketDraft, TicketSource } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The one form component in MITS.

   It takes a MITSFormSchema, compiles it to zod, and renders whatever fields the
   schema declares. There is deliberately no per-ticket-type variant: a new
   ticket type is a new schema, not a new component.
   ────────────────────────────────────────────────────────────────────────── */

export interface SchemaFormProps {
  schema: MITSFormSchema;
  /** Which intake mode this submission came from — stamped onto the draft. */
  source: TicketSource;
  /** Receives the validated draft. Async: the button shows a spinner until it settles. */
  onSubmit: (draft: MITSTicketDraft) => void | Promise<void>;
  /** Pre-filled answers — Phase 3 hands AI-extracted values in here. */
  initialPayload?: Record<string, unknown>;
  /** Rendered to the left of the submit button (e.g. a back button). */
  secondaryAction?: React.ReactNode;
  /**
   * Site the ticket belongs to. Chosen once above the intake tabs rather than per
   * form, since it is the same answer whichever mode produced the ticket.
   */
  locationId?: string | null;
}

export function SchemaForm({
  schema,
  source,
  onSubmit,
  initialPayload,
  secondaryAction,
  locationId = null,
}: SchemaFormProps) {
  const steps = useMemo(() => stepCount(schema), [schema]);

  /*
   * Which fields other fields depend on. Empty for a schema without conditions,
   * and that is what switches the subscription below off entirely — an ordinary
   * form must not pay a re-render per keystroke for a feature it does not use.
   */
  const controllers = useMemo(() => {
    const keys = new Set<string>();
    for (const hint of Object.values(schema.uiHints ?? {})) {
      if (hint.visibleWhen) keys.add(hint.visibleWhen.field);
      if (hint.optionsFrom) keys.add(hint.optionsFrom.field);
    }
    return [...keys];
  }, [schema]);

  const form = useForm({
    /*
     * Compiled per validation run against the current answers, because the shape
     * itself depends on them.
     *
     * The values are reduced to the visible fields *before* being handed to zod.
     * The form always holds an entry for every declared field — `defaultValuesFor`
     * seeds them all — while the compiled schema omits the ones the conditions
     * ruled out. Passing the full set to a `strictObject` would fail on those keys
     * as unrecognised, and the form could never be submitted at all once any field
     * was conditional.
     *
     * What the resolver returns is what `handleSubmit` receives, so this is also
     * the single place the hidden answers are dropped.
     */
    resolver: (values, context, options) => {
      const answers = values as Record<string, unknown>;
      const applicable = resolveFieldsFor(schema, answers);
      return zodResolver(schemaToZod(schema, { values: answers }))(
        visibleOnly(answers, applicable),
        context,
        options,
      );
    },
    defaultValues: { ...defaultValuesFor(schema), ...initialPayload },
    mode: "onBlur",
  });

  // Only the controlling fields are watched, and only when there are any.
  const watched = useWatch({
    control: form.control,
    disabled: controllers.length === 0,
  });

  const conditionValues = useMemo(() => {
    if (controllers.length === 0) return undefined;
    const values = (watched ?? {}) as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of controllers) picked[key] = values[key];
    return picked;
  }, [controllers, watched]);

  const fields = useMemo(
    () => resolveFieldsFor(schema, conditionValues),
    [schema, conditionValues],
  );

  /*
   * Drop a cascading field's answer once its parent no longer permits it.
   *
   * Without this the form holds a value the narrowed dropdown does not offer: the
   * control shows blank, validation fails on a field whose choices never included
   * the offending value, and the reporter has no way to correct what they cannot
   * see.
   */
  useEffect(() => {
    if (!conditionValues) return;
    for (const field of fields) {
      const allowed = cascadedValues(field.hint, conditionValues);
      if (!allowed) continue;
      const current = form.getValues(field.name);
      if (typeof current === "string" && current !== "" && !allowed.includes(current)) {
        form.setValue(field.name, "", { shouldValidate: false });
      }
    }
  }, [fields, conditionValues, form]);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await onSubmit({
        source,
        form_schema_id: schema.id,
        // Already reduced to the applicable fields by the resolver, which is what
        // produced these values.
        payload: values as Record<string, unknown>,
        priority: derivePriority(values),
        location_id: locationId,
        /*
         * Null here, filled by the container.
         *
         * The intent tiles sit above the tab strip, so the chosen category belongs
         * to the intake as a whole rather than to one of its three forms —
         * `TriModalContainer` writes it into the request body the same way it
         * writes the site. Threading it through every mode and through
         * `ServiceCatalog` would be four props for one value that none of them own.
         */
        category_id: null,
      });
    } finally {
      setSubmitting(false);
    }
  });

  // Fields are grouped by their uiHints.group inside each step, preserving the
  // order resolveFields already established.
  const groups = groupFields(fields);

  return (
    <TooltipProvider>
      <Form {...form}>
        <form onSubmit={handleSubmit} className="grid gap-6" noValidate>
          {steps > 1 && (
            <p className="label-industrial">
              {steps} Abschnitte · alle Felder auf einer Seite
            </p>
          )}

          {/* `gap-4`, nicht `gap-5`: der größere Abstand war Luft für zweizeilige
              Hilfetexte unter den Feldern, damit sie nicht in die nächste
              Beschriftung liefen. Die sind weg, das umgebende `<form>` ist `gap-6`
              für den Abstand zwischen Gruppen. */}
          {groups.map(({ group, entries }) => (
            <fieldset key={group ?? "__ungrouped"} className="grid gap-4">
              {group && (
                <legend className="label-industrial mb-1">{group}</legend>
              )}
              {entries.map((field) => renderField({ field, disabled: submitting }))}
            </fieldset>
          ))}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
            {secondaryAction}
            <Button
              type="submit"
              size="lg"
              className="h-11 rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
              disabled={submitting}
            >
              {submitting && <Loader2Icon className="animate-spin" />}
              {submitting ? "Wird gesendet …" : (schema.submitLabel ?? "Ticket senden")}
            </Button>
          </div>
        </form>
      </Form>
    </TooltipProvider>
  );
}

/** Reduce the form values to the fields still on screen. */
function visibleOnly(
  values: Record<string, unknown>,
  fields: ReturnType<typeof resolveFieldsFor>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name in values) payload[field.name] = values[field.name];
  }
  return payload;
}

/**
 * A schema may carry its own priority field; otherwise the draft defaults to
 * normal and triage (Phase 3) decides.
 */
function derivePriority(values: Record<string, unknown>): MITSTicketDraft["priority"] {
  const candidate = values.priority;
  return candidate === "low" ||
    candidate === "medium" ||
    candidate === "high" ||
    candidate === "critical"
    ? candidate
    : "medium";
}

function groupFields(fields: ReturnType<typeof resolveFieldsFor>) {
  const groups: { group?: string; entries: typeof fields }[] = [];
  for (const field of fields) {
    const group = field.hint.group;
    const last = groups.at(-1);
    if (last && last.group === group) {
      last.entries.push(field);
    } else {
      groups.push({ group, entries: [field] });
    }
  }
  return groups;
}
