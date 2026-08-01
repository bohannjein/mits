"use client";

import {
  CheckCircle2Icon,
  CheckCheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  LockIcon,
  SendIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  addCommentAction,
  replyAndCloseAction,
  runMacroAction,
} from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/tickets/rich-text-editor";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   The reply box.

   **One composer for both views**, where there used to be two. `TicketChat` and
   `TicketThread` each had their own copy of the send action, the clear-on-success
   effect and the snippet insertion — three things that have to behave identically
   and had two implementations, which is how one of them ends up with a fix the
   other never gets.

   What actually differs between an agent and a reporter is the *editor* and which
   controls exist, so that is the prop: `variant`. Everything below it is shared.

   Two submit buttons on one form, each bound to its own action. "Antworten &
   Schließen" is a single server action rather than two client calls: replying and
   closing is one decision, and two round-trips can leave a ticket answered but
   open when the second one fails.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketComposer({
  ticketId,
  isAgent,
  /**
   * `rich` gives the tiptap editor and posts HTML; `plain` a textarea posting
   * text. The reporter's view is deliberately the plain one — a formatting
   * toolbar is furniture on a page whose whole point is to be minimal.
   */
  variant = "rich",
  /** Placeholder-filled server-side. Empty when the module is off. */
  cannedResponses = [],
  /** One-click actions. Empty when the module is off. */
  macros = [],
}: {
  ticketId: string;
  isAgent: boolean;
  variant?: "rich" | "plain";
  cannedResponses?: { id: string; title: string; body: string }[];
  macros?: { id: string; title: string; description: string }[];
}) {
  const { toast } = useToast();
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState("");
  const [editor, setEditor] = useState<RichTextEditorHandle | null>(null);
  const [snippetsOpen, setSnippetsOpen] = useState(false);

  const [replyResult, replyAction, replying] = useActionState(
    addCommentAction,
    null,
  );
  const [closeResult, closeAction, closing] = useActionState(
    replyAndCloseAction,
    null,
  );
  const [macroResult, macroAction, runningMacro] = useActionState(
    runMacroAction,
    null,
  );

  const rich = variant === "rich";
  const result = replyResult ?? closeResult;
  const busy = replying || closing || runningMacro;

  // Clear on confirmation, keyed on the result object's identity so it fires once
  // per submission. A `result?.ok ? "" : body` shortcut would swallow an inserted
  // snippet after the first successful reply.
  useEffect(() => {
    if (result?.ok) setBody("");
  }, [result]);

  /*
   * Insert a snippet where the cursor is.
   *
   * In the rich variant the body travels as HTML and a canned response is stored
   * as plain text: concatenating the two would hand the sanitiser text whose
   * newlines collapse into one paragraph, so the template arrives as a wall.
   * `toParagraphs` escapes and wraps it, and the editor knows where the cursor is.
   * The plain variant needs none of that — it is already text.
   */
  const insertText = useCallback(
    (text: string) => {
      if (!rich) {
        setBody((current) => (current.trim() ? `${current.trimEnd()}\n\n${text}` : text));
        return;
      }

      const html = toParagraphs(text);
      if (editor) {
        editor.insert(html);
        return;
      }
      // Before the editor has mounted there is nothing to insert into; appending
      // to the value keeps the snippet rather than dropping it silently.
      setBody((current) => (current ? `${current}${html}` : html));
    },
    [editor, rich],
  );

  /*
   * A macro reports back through a toast, and hands over its reply text if it
   * chose not to send it. Keyed on the result object so it fires once per run.
   */
  useEffect(() => {
    if (!macroResult) return;
    if (macroResult.ok) {
      toast({ kind: "system", tone: "success", title: macroResult.message });
      if (macroResult.insert) insertText(macroResult.insert);
    } else {
      toast({ kind: "system", tone: "warning", title: macroResult.error });
    }
  }, [macroResult, toast, insertText]);

  const canSend = body.trim() !== "" && !busy;

  /*
   * Ctrl+Enter (Cmd+Enter on a Mac) sends.
   *
   * Plain Enter deliberately does not. This box holds multi-line replies with
   * steps in them, and a bare Enter that submits turns every numbered list into a
   * half-written message — the mistake is unrecoverable in the direction that
   * matters, because the half-message is already in the customer's inbox.
   *
   * On the form rather than on each editor: it then works from the textarea, from
   * the rich editor and from the buttons, and there is one place that knows the
   * shortcut. `requestSubmit` rather than `submit` so the reply action runs and
   * the built-in validation is not skipped.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (!canSend) return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  return (
    <form
      onKeyDown={onKeyDown}
      className={cn(
        /*
         * No border in the ordinary state: the frame already draws a rule
         * above this region, and a second outline twelve pixels below it reads
         * as a rendering fault. `bg-card` on the column's `bg-background` is
         * what makes it an inset field instead.
         *
         * An internal note keeps its dashed amber — that is the one state
         * where the box has to announce itself.
         */
        "grid gap-3 rounded-2xl px-4 py-3 transition-colors",
        internal
          ? "border border-dashed border-bubble-internal-border bg-bubble-internal"
          : "bg-card",
      )}
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <input
        type="hidden"
        name="visibility"
        value={internal ? "internal" : "public"}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="composer-body" className="text-xs text-muted-foreground">
          {internal ? "Interne Notiz" : "Öffentliche Antwort"}
        </Label>

        {/* Inserted into the field, never sent on its own — the agent confirms
            what goes out, same rule as the AI triage. */}
        {isAgent && cannedResponses.length > 0 && (
          <DropdownMenu open={snippetsOpen} onOpenChange={setSnippetsOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                disabled={busy}
              >
                Textbaustein
                {rich && (
                  <kbd className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
                    /
                  </kbd>
                )}
                <ChevronDownIcon strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 rounded-2xl border border-border shadow-elev-2"
            >
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Wird eingefügt, nicht gesendet
              </DropdownMenuLabel>
              {cannedResponses.map((canned) => (
                <DropdownMenuItem
                  key={canned.id}
                  className="rounded-xl"
                  onSelect={() => insertText(canned.body)}
                >
                  {canned.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/*
        Macros. Above the field rather than in the sidebar: a macro usually ends in
        a reply, and the text it inserts lands two centimetres below the button
        that produced it.
      */}
      {isAgent && macros.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <ZapIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
          {macros.map((macro) => (
            <form key={macro.id} action={macroAction}>
              <input type="hidden" name="ticketId" value={ticketId} />
              <input type="hidden" name="macroId" value={macro.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={busy}
                title={macro.description || undefined}
                className="h-7 rounded-full bg-surface-elevated px-2.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {runningMacro ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <ZapIcon strokeWidth={1.5} />
                )}
                {macro.title}
              </Button>
            </form>
          ))}
        </div>
      )}

      {/* The body travels as a hidden field either way: the rich editor keeps its
          value in React state, and a Server Action reads FormData. */}
      <input type="hidden" name="body" value={body} />
      <input type="hidden" name="bodyFormat" value={rich ? "html" : "text"} />

      {rich ? (
        <RichTextEditor
          value={body}
          onChange={setBody}
          disabled={busy}
          tone={internal ? "warning" : "default"}
          onReady={setEditor}
          // Only when there is something to offer: a shortcut that opens an empty
          // menu is a swallowed keystroke.
          onSlash={
            isAgent && cannedResponses.length > 0
              ? () => setSnippetsOpen(true)
              : undefined
          }
          placeholder={placeholderFor(internal)}
        />
      ) : (
        <Textarea
          id="composer-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          disabled={busy}
          placeholder={placeholderFor(internal)}
          // `resize-none`: inside a fixed-height column a draggable textarea can
          // be pulled taller than the frame, which pushes the send button out.
          className="resize-none rounded-xl"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAgent ? (
          <div className="flex items-center gap-2.5">
            <Switch
              id="composer-internal"
              checked={internal}
              onCheckedChange={setInternal}
              disabled={busy}
            />
            <Label
              htmlFor="composer-internal"
              className="text-sm font-normal text-muted-foreground"
            >
              Interne Notiz
            </Label>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            Ihre Antwort ist für die Agenten sichtbar.
          </span>
        )}

        {/* The shortcut, where the hand already is. Hidden below `sm` — a phone
            has no Ctrl key and the line would be furniture. */}
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
          <kbd className="rounded border border-border px-1 font-mono text-[10px]">
            Strg
          </kbd>
          +
          <kbd className="rounded border border-border px-1 font-mono text-[10px]">
            Enter
          </kbd>
          senden
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            formAction={replyAction}
            className={cn(
              "h-10 rounded-full px-4",
              internal
                ? "bg-bubble-internal-accent/15 text-bubble-internal-accent hover:bg-bubble-internal-accent/25 hover:text-bubble-internal-accent"
                : "bg-surface-elevated text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            disabled={!canSend}
          >
            {replying ? (
              <Loader2Icon className="animate-spin" />
            ) : internal ? (
              <LockIcon strokeWidth={1.5} />
            ) : (
              <SendIcon strokeWidth={1.5} />
            )}
            {internal ? "Notiz speichern" : "Antworten"}
          </Button>

          {/* Public only. "Answer and close" that filed an internal note would
              close a ticket the reporter never heard about. */}
          {isAgent && !internal && (
            <Button
              type="submit"
              formAction={closeAction}
              className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
              disabled={!canSend}
            >
              {closing ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckCheckIcon strokeWidth={1.5} />
              )}
              Antworten &amp; Schließen
            </Button>
          )}
        </div>
      </div>

      {result && (
        <Alert
          variant={result.ok ? "default" : "destructive"}
          className="rounded-xl border-border px-3 py-2"
        >
          {result.ok ? (
            <CheckCircle2Icon strokeWidth={1.5} />
          ) : (
            <TriangleAlertIcon strokeWidth={1.5} />
          )}
          <AlertDescription className="text-xs">
            {result.ok ? result.message : result.error}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}

const placeholderFor = (internal: boolean): string =>
  internal
    ? "Nur für Agenten sichtbar."
    : "Geht an den Melder und löst eine Benachrichtigung aus.";

/**
 * Turn a plain-text canned response into paragraphs.
 *
 * The templates are stored as text, and inserting them raw would put their newlines
 * into a single paragraph where the editor collapses them. Escaped first — a template
 * is admin-authored, but this markup goes straight into the document and the editor
 * has no sanitiser of its own.
 */
function toParagraphs(text: string): string {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replaceAll("\n", "<br>")}</p>`)
    .join("");
}
