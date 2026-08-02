"use client";

import { startTransition, useActionState, useEffect } from "react";

import { setChecklistValueAction } from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { RelativeTime } from "@/components/layout/relative-time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ChecklistValue } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The agent's checklist, as a panel.

   Steps come from the ticket type, answers from the agent, and the line under each
   answered step says who answered it and when — that is the documentation this
   exists for. Nothing is locked: a step can be re-answered or cleared at any time,
   and every change goes into the audit trail, so the panel shows the state and the
   history shows the sequence.

   **Every control writes immediately**, like the workflow dropdowns above it. There
   is nothing to batch — one step is one decision — and a save button beside a
   checkbox is a second click for something the agent has already done. The trade-off
   is the same one the sidebar already takes: no undo, acceptable because the value
   is visible in the control that set it and can be set back.

   `startTransition` because these come from a click rather than a submit event;
   without it React warns and the pending flag never turns on. One action state for
   the whole list rather than one per row: a failure is a toast about the step it
   names, not a badge on a row somebody has already scrolled past.
   ────────────────────────────────────────────────────────────────────────── */

export interface ChecklistRowProps {
  id: string;
  label: string;
  kind: "check" | "yesno";
  value: ChecklistValue;
  answeredBy: string;
  answeredAt: Date | null;
}

export function TicketChecklist({
  ticketId,
  rows,
}: {
  ticketId: string;
  rows: ChecklistRowProps[];
}) {
  const { toast } = useToast();
  const [result, action, saving] = useActionState(setChecklistValueAction, null);

  useEffect(() => {
    if (result && !result.ok) {
      toast({ kind: "system", tone: "warning", title: result.error });
    }
  }, [result, toast]);

  const set = (itemId: string, value: ChecklistValue) => {
    const data = new FormData();
    data.set("ticketId", ticketId);
    data.set("itemId", itemId);
    data.set("value", value);
    startTransition(() => action(data));
  };

  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="grid gap-1 rounded-xl border border-border px-3 py-2"
        >
          {row.kind === "check" ? (
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={row.value === "done"}
                disabled={saving}
                // Clearing is the same write with an empty value, which is what
                // makes "ich habe zu früh geklickt" a correction in the trail
                // rather than an edit nobody can see.
                onCheckedChange={(next) =>
                  set(row.id, next === true ? "done" : "")
                }
                className="mt-0.5"
              />
              <span
                className={cn(
                  "text-sm",
                  row.value === "done" && "text-muted-foreground line-through",
                )}
              >
                {row.label}
              </span>
            </label>
          ) : (
            <div className="grid gap-1.5">
              <span className="text-sm">{row.label}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Answer
                  label="Ja"
                  active={row.value === "yes"}
                  disabled={saving}
                  onClick={() => set(row.id, row.value === "yes" ? "" : "yes")}
                />
                <Answer
                  label="Nein"
                  active={row.value === "no"}
                  disabled={saving}
                  onClick={() => set(row.id, row.value === "no" ? "" : "no")}
                />
              </div>
            </div>
          )}

          {/*
            Who and when, and only once there is an answer. An unanswered step with
            an empty attribution line would be two rows of nothing per step.
          */}
          {row.value !== "" && row.answeredAt && (
            <span className="text-[11px] text-muted-foreground">
              {row.answeredBy} · <RelativeTime date={row.answeredAt} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * One of the two answers to a Ja/Nein step.
 *
 * A pair of pills rather than a select: two options are faster to hit than a
 * dropdown, and the answer stays readable without opening anything. Pressing the
 * active one clears it — the same gesture the checkbox has.
 *
 * Only the background changes on hover; the label stays at full contrast. See the
 * hover rule in AGENTS.md.
 */
function Answer({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 rounded-full px-3 text-xs",
        active
          ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          : "bg-surface-elevated text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </Button>
  );
}
