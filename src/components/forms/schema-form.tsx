"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Form } from "@/components/forms/form";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderField } from "@/lib/forms/registry";
import {
  defaultValuesFor,
  resolveFields,
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
  // Recompiled only when the schema identity changes — compiling on every render
  // would hand react-hook-form a new resolver each time and reset validation.
  const zodSchema = useMemo(() => schemaToZod(schema), [schema]);
  const fields = useMemo(() => resolveFields(schema), [schema]);
  const steps = useMemo(() => stepCount(schema), [schema]);

  const form = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: { ...defaultValuesFor(schema), ...initialPayload },
    mode: "onBlur",
  });

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await onSubmit({
        source,
        form_schema_id: schema.id,
        payload: values as Record<string, unknown>,
        priority: derivePriority(values),
        location_id: locationId,
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

          {groups.map(({ group, entries }) => (
            <fieldset key={group ?? "__ungrouped"} className="grid gap-5">
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

/**
 * A schema may carry its own priority field; otherwise the draft defaults to
 * normal and triage (Phase 3) decides.
 */
function derivePriority(values: Record<string, unknown>): MITSTicketDraft["priority"] {
  const candidate = values.priority;
  return candidate === "low" ||
    candidate === "normal" ||
    candidate === "high" ||
    candidate === "urgent"
    ? candidate
    : "normal";
}

function groupFields(fields: ReturnType<typeof resolveFields>) {
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
