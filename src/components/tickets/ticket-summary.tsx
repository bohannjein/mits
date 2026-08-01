"use client";

import { Loader2Icon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState } from "react";

import { summariseTicketAction } from "@/app/actions/ai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/* ──────────────────────────────────────────────────────────────────────────
   Three questions about a long thread.

   A button, not something that runs on open. Generating a summary costs a model
   call and a few seconds, and most tickets get opened to be answered rather than
   to be understood — an automatic summary would spend that on every visit and
   present a paragraph nobody asked for above the conversation.

   The result is not stored and disappears with the page. A stored summary is
   stale the moment the next reply lands, and a stale summary is worse than none:
   it is confidently wrong about the current state, which is the one thing an agent
   taking over is reading it for.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketSummaryCard({ ticketId }: { ticketId: string }) {
  const [result, action, running] = useActionState(summariseTicketAction, null);

  return (
    <div className="grid gap-3">
      <form action={action}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={running}
          className="h-9 w-full justify-start rounded-xl px-3 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {running ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SparklesIcon strokeWidth={1.5} />
          )}
          {running
            ? "Wird gelesen …"
            : result?.ok
              ? "Neu zusammenfassen"
              : "Verlauf zusammenfassen"}
        </Button>
      </form>

      {result && !result.ok && (
        <Alert
          variant="destructive"
          className="rounded-xl border-border px-3 py-2"
        >
          <TriangleAlertIcon strokeWidth={1.5} />
          <AlertDescription className="text-xs">{result.error}</AlertDescription>
        </Alert>
      )}

      {result?.ok && (
        <div className="grid gap-3 rounded-2xl border border-border bg-background px-3 py-3">
          <Section title="Problem" body={result.summary.problem} />

          {result.summary.steps.length > 0 && (
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">
                Bisherige Schritte
              </span>
              <ul className="grid gap-1 text-sm">
                {result.summary.steps.map((step, index) => (
                  <li key={index} className="flex gap-2">
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section title="Aktueller Stand" body={result.summary.waitingOn} />

          {/*
            Stated once, quietly, and not as a disclaimer nobody reads: the point
            is that this is a reading aid and the thread is the record. An agent
            about to tell a customer "wir haben X versucht" needs to know which of
            the two they are looking at.
          */}
          <p className="text-[11px] text-muted-foreground">
            Maschinell erzeugt. Der Verlauf darüber ist das Original.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{title}</span>
      <p className="text-sm leading-relaxed break-words">{body}</p>
    </div>
  );
}
