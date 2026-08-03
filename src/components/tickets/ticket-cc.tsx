"use client";

import { Loader2Icon, PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";

import { setTicketCcAction } from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CC_LIMIT, normalizeCcEmails } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Who else gets a copy.

   A CC address receives mail. It does not become a participant: no account, no
   access to the ticket in the portal, nothing added to any list of people who
   may read it. That distinction is the whole design — "Beteiligte" in a helpdesk
   usually means both, and conflating them here would mean typing an address into
   a popover silently grants somebody read access to a customer's conversation.

   The list is edited locally and saved whole. Adding a chip that is only
   persisted on "Speichern" is what makes a mistyped address recoverable with
   Escape instead of with a second write.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketCc({
  ticketId,
  emails,
  children,
}: {
  ticketId: string;
  emails: string[];
  /** The trigger — the action bar supplies its own button. */
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const [result, action, pending] = useActionState(setTicketCcAction, null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(emails);
  const [entry, setEntry] = useState("");

  // Re-seeded on open, not on every prop change: the live poll re-renders this
  // component under the popover, and that must not discard a half-made edit.
  useEffect(() => {
    if (open) {
      setDraft(emails);
      setEntry("");
    }
  }, [open, emails]);

  useEffect(() => {
    if (result?.ok) {
      toast({ kind: "system", tone: "success", title: result.message });
      setOpen(false);
    }
  }, [result, toast]);

  const add = () => {
    const next = normalizeCcEmails([...draft, entry]);
    // Unchanged means the entry was rejected or already there — clearing the
    // field either way would look like it worked.
    if (next.length !== draft.length) setDraft(next);
    setEntry("");
  };

  const save = () => {
    const data = new FormData();
    data.set("ticketId", ticketId);
    data.set("emails", draft.join("\n"));
    startTransition(() => action(data));
  };

  const full = draft.length >= CC_LIMIT;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="grid gap-3">
          <Label htmlFor={`cc-${ticketId}`}>Kopie an</Label>

          <div className="flex gap-2">
            <Input
              id={`cc-${ticketId}`}
              value={entry}
              onChange={(event) => setEntry(event.target.value)}
              onKeyDown={(event) => {
                // Enter adds a chip; it must not submit anything, and Escape has
                // to stay the popover's own.
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              placeholder="name@firma.de"
              type="email"
              autoComplete="off"
              disabled={pending || full}
              className="h-9 rounded-xl"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Adresse hinzufügen"
              onClick={add}
              disabled={pending || full || entry.trim() === ""}
              className="size-9 shrink-0 rounded-full"
            >
              <PlusIcon strokeWidth={1.5} />
            </Button>
          </div>

          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Niemand eingetragen.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.map((email) => (
                <Badge
                  key={email}
                  variant="outline"
                  className="h-auto gap-1 rounded-full py-0.5 pr-1 pl-2.5 font-normal"
                >
                  <span className="max-w-40 truncate">{email}</span>
                  <button
                    type="button"
                    aria-label={`${email} entfernen`}
                    disabled={pending}
                    onClick={() =>
                      setDraft((current) =>
                        current.filter((entry) => entry !== email),
                      )
                    }
                    className="grid size-4 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
                  >
                    <XIcon className="size-3" strokeWidth={1.5} />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {result && !result.ok && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-border px-3 py-2"
            >
              <TriangleAlertIcon strokeWidth={1.5} />
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-3"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending}
              className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Speichern
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
