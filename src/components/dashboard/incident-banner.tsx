"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  LayersIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  createMajorIncidentAction,
  dismissClusterAction,
} from "@/app/actions/ai";
import { useToast } from "@/components/feedback/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLatestResult } from "@/hooks/use-latest-result";
import type { ClusterMember } from "@/lib/services/ai/clustering";

/* ──────────────────────────────────────────────────────────────────────────
   "Several people are reporting the same thing."

   A suggestion with two buttons and nothing else. It does not create anything, it
   does not re-status anybody's ticket, and it does not nag — declaring a major
   incident re-labels other people's tickets as waiting on something, and getting
   that wrong on the strength of word overlap is a cost paid by the reporters.

   The headline is editable before the ticket is created. Whatever named the group
   — a model, or the words the tickets share — is a starting point, and the agent
   is the one who knows whether it is the mail server or the switch in front of it.
   ────────────────────────────────────────────────────────────────────────── */

const ENTRANCE = { type: "spring", stiffness: 300, damping: 30, mass: 0.9 } as const;

export function IncidentBanner({
  title,
  keywords,
  members,
}: {
  title: string;
  keywords: string[];
  members: ClusterMember[];
}) {
  const reduceMotion = useReducedMotion();
  const { toast } = useToast();

  const [incidentTitle, setIncidentTitle] = useState(title);
  const [expanded, setExpanded] = useState(false);
  const [gone, setGone] = useState(false);

  const [createResult, createAction, creating] = useActionState(
    createMajorIncidentAction,
    null,
  );
  const [dismissResult, dismissAction, dismissing] = useActionState(
    dismissClusterAction,
    null,
  );

  const ids = members.map((member) => member.id).join(",");
  const busy = creating || dismissing;

  /*
   * `createResult ?? dismissResult` pinned the first result that ever arrived: a
   * refused "Hauptstörung anlegen" masked the successful dismiss that followed, so
   * `setGone(true)` below never fired and the banner stayed above the queue —
   * exactly the second click the comment underneath warns about.
   */
  const result = useLatestResult(createResult, dismissResult);

  /*
   * Removed from the page on success rather than waiting for the revalidation to
   * come back. Both actions revalidate `/mits`, but the banner sits above the
   * queue an agent is reading — leaving it visible for the round trip invites a
   * second click, and a second click creates a second major incident.
   */
  useEffect(() => {
    if (!result?.ok) return;
    toast({ kind: "system", tone: "success", title: result.message });
    setGone(true);
  }, [result, toast]);

  useEffect(() => {
    if (result && !result.ok) {
      toast({ kind: "system", tone: "warning", title: result.error });
    }
  }, [result, toast]);

  if (gone) return null;

  return (
    <motion.section
      aria-label="Mögliche Hauptstörung"
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ENTRANCE}
      // Warning surface, not destructive: this is a suggestion about a pattern,
      // not something that has gone wrong with MITS.
      className="grid gap-3 rounded-2xl border border-bubble-internal-border bg-bubble-internal px-4 py-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangleIcon
          className="mt-0.5 size-5 shrink-0 text-bubble-internal-accent"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="min-w-56 flex-1">
          <p className="text-sm font-medium">
            Mögliche Hauptstörung erkannt: {title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {members.length} Tickets in kurzer Zeit mit demselben Thema
            {keywords.length > 0 && (
              <>
                {" "}
                (<span className="font-mono">{keywords.join(", ")}</span>)
              </>
            )}
            .{" "}
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {expanded ? "Liste ausblenden" : "Tickets anzeigen"}
            </button>
          </p>
        </div>
      </div>

      {expanded && (
        <ul className="grid gap-1 pl-8">
          {members.map((member) => (
            <li key={member.id} className="text-xs">
              <Badge
                variant="outline"
                className="mr-2 h-auto rounded-full px-2 py-0 font-mono text-[10px] font-normal"
              >
                {member.number}
              </Badge>
              {member.title}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 pl-8">
        <form action={createAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ticketIds" value={ids} />
          <div className="grid gap-1.5">
            <Label
              htmlFor="incident-title"
              className="text-xs text-muted-foreground"
            >
              Titel der Hauptstörung
            </Label>
            <Input
              id="incident-title"
              name="title"
              value={incidentTitle}
              onChange={(event) => setIncidentTitle(event.target.value)}
              disabled={busy}
              maxLength={160}
              className="h-9 w-72 max-w-full rounded-xl"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={busy || incidentTitle.trim() === ""}
            className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            {creating ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <LayersIcon strokeWidth={1.5} />
            )}
            Hauptstörung erstellen
          </Button>
        </form>

        <form action={dismissAction}>
          <input type="hidden" name="ticketIds" value={ids} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="h-9 rounded-full px-4 text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {dismissing ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <XIcon strokeWidth={1.5} />
            )}
            Ignorieren
          </Button>
        </form>
      </div>

      {/* The failure case only. Success removes the banner, so an alert saying so
          would flash and vanish with it. */}
      {result && !result.ok && (
        <Alert
          variant="destructive"
          className="ml-8 rounded-xl border-border px-3 py-2"
        >
          <CheckCircle2Icon className="hidden" />
          <AlertDescription className="text-xs">{result.error}</AlertDescription>
        </Alert>
      )}
    </motion.section>
  );
}
