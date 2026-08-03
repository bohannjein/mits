"use client";

import {
  CheckCircle2Icon,
  CheckCheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  Loader2Icon,
  LockIcon,
  PaperclipIcon,
  SendIcon,
  TriangleAlertIcon,
  TypeIcon,
  ZapIcon,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  addCommentAction,
  replyAndCloseAction,
  runMacroAction,
} from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { Kbd } from "@/components/layout/shortcut-hint";
import { useComposerHandle } from "@/components/tickets/composer-handle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  cannedResponses?: {
    id: string;
    title: string;
    body: string;
    shortcut: string;
  }[];
  macros?: {
    id: string;
    title: string;
    description: string;
    shortcut: string;
  }[];
}) {
  const { toast } = useToast();
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState("");
  const [editor, setEditor] = useState<RichTextEditorHandle | null>(null);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  /*
   * What has been typed after the slash.
   *
   * Kept here rather than in an input inside the menu: a text field inside a
   * Radix menu takes the arrow keys away from the list, and the list is the
   * thing being navigated. The keystrokes are read off the menu itself, which
   * leaves arrows, Enter and Escape doing exactly what the primitive already
   * does with them.
   */
  const [snippetFilter, setSnippetFilter] = useState("");

  /*
   * The formatting bar starts folded.
   *
   * A permanent row of sixteen buttons over a one-line field is more chrome than
   * content, and the overwhelming majority of replies are prose. Teams and Slack
   * both made this call; the bar is one click away and stays open once opened,
   * so somebody who formats a lot pays for it once per reply.
   */
  const [formatting, setFormatting] = useState(false);

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

  /*
   * Running a macro from the dropdown, where there is no form to submit.
   *
   * `useActionState`'s dispatch takes the same `FormData` a form would have
   * posted, so the action is untouched. `startTransition` because this comes from
   * a menu selection rather than a submit event — without it React warns and the
   * pending flag that disables the controls never turns on.
   */
  /*
   * Hand the page two callbacks rather than two DOM nodes.
   *
   * Focusing differs by variant — the textarea takes `.focus()`, the rich editor
   * needs a tiptap command — and the internal switch is React state with no
   * element to click. A ref to a node would make the page know both of those.
   */
  const plainRef = useRef<HTMLTextAreaElement>(null);

  const handle = useComposerHandle();

  useEffect(() => {
    if (!handle) return;

    handle.focus.current = () => {
      if (rich) editor?.focus();
      else plainRef.current?.focus();
    };
    // Only an agent has the switch; for a reporter the shortcut does nothing
    // rather than toggling a control that is not on their screen.
    handle.toggleInternal.current = isAgent
      ? () => setInternal((on) => !on)
      : null;
  }, [handle, rich, editor, isAgent]);

  const dispatchMacro = (fields: { ticketId: string; macroId: string }) => {
    const data = new FormData();
    data.set("ticketId", fields.ticketId);
    data.set("macroId", fields.macroId);
    startTransition(() => macroAction(data));
  };

  /*
   * What the typed filter still matches.
   *
   * A shortcut matches from the front, a title anywhere. That is the difference
   * between the two: a shortcut is a word somebody memorised and types from its
   * first letter, a title is a sentence they remember one word out of.
   */
  const needle = snippetFilter.toLowerCase();
  const matchesFilter = (title: string, shortcut: string): boolean =>
    needle === "" ||
    shortcut.startsWith(needle) ||
    title.toLowerCase().includes(needle);

  const shownCanned = cannedResponses.filter((entry) =>
    matchesFilter(entry.title, entry.shortcut),
  );
  const shownMacros = macros.filter((entry) =>
    matchesFilter(entry.title, entry.shortcut),
  );
  const noMatches = shownCanned.length === 0 && shownMacros.length === 0;

  /** Enter on the filter itself takes the first match, without arrowing to it. */
  const takeFirstMatch = () => {
    if (shownCanned[0]) {
      insertText(shownCanned[0].body);
    } else if (shownMacros[0]) {
      dispatchMacro({ ticketId, macroId: shownMacros[0].id });
    } else {
      return;
    }
    setSnippetsOpen(false);
  };
  const result = replyResult ?? closeResult;
  const busy = replying || closing || runningMacro;

  // Clear on confirmation, keyed on the result object's identity so it fires once
  // per submission. A `result?.ok ? "" : body` shortcut would swallow an inserted
  // snippet after the first successful reply.
  useEffect(() => {
    if (result?.ok) setBody("");
  }, [result]);

  /*
   * A refused reply is a toast, and the text stays in the field.
   *
   * The alert below already shows it, but the composer sits at the bottom of a
   * column that scrolls — on a long thread the message can appear off-screen, and
   * what the agent sees is a button that went back to normal and a reply that is
   * still sitting there. The toast is the part that cannot be missed.
   *
   * Never clearing on failure is the other half: whatever went wrong, the one
   * thing that must survive it is the text somebody just wrote.
   */
  useEffect(() => {
    if (result && !result.ok) {
      toast({ kind: "system", tone: "warning", title: result.error });
    }
  }, [result, toast]);

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
   * Ctrl+Enter, Cmd+Enter and Shift+Enter all send.
   *
   * Plain Enter deliberately does not. This box holds multi-line replies with
   * steps in them, and a bare Enter that submits turns every numbered list into a
   * half-written message — the mistake is unrecoverable in the direction that
   * matters, because the half-message is already in the customer's inbox.
   *
   * Shift+Enter is in there because it is what this application was asked for and
   * what several helpdesk tools use; the cost is that it no longer inserts a
   * newline. That is affordable **only** because plain Enter still does — in the
   * textarea natively, and in the rich editor as a new paragraph. Binding plain
   * Enter to send is the version that would be wrong.
   *
   * On the form rather than on each editor: it then works from the textarea, from
   * the rich editor and from the buttons, and there is one place that knows the
   * shortcut. `requestSubmit` rather than `submit` so the reply action runs and
   * the built-in validation is not skipped.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    /*
     * Ctrl+Shift+X folds the formatting bar out and back.
     *
     * On the form for the same reason the send shortcut is: it then works from
     * the editor, from the textarea and from the buttons. Checked before the
     * Enter branch because `X` is not `Enter` and would otherwise fall through.
     */
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "x"
    ) {
      event.preventDefault();
      setFormatting((on) => !on);
      return;
    }

    if (event.key !== "Enter") return;
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) return;
    if (!canSend) return;
    event.preventDefault();
    /*
     * **With the submitter**, and that is not a detail.
     *
     * This form has no `action` of its own — the two buttons carry
     * `formAction={replyAction}` and `formAction={closeAction}`, because replying
     * and replying-and-closing are two different server actions. A bare
     * `requestSubmit()` therefore submits with no action at all: React has
     * nothing to run, the browser performs the default submit, and the field is
     * reset. The reported symptom was exact — the shortcut cleared the reply
     * instead of sending it, which is the worst way for a send shortcut to fail.
     *
     * Passing the reply button names the action, so the keystroke does precisely
     * what pressing that button does.
     */
    replyButton.current?.click();
  };

  /** The default submit for the keyboard shortcut. See `onKeyDown`. */
  const replyButton = useRef<HTMLButtonElement>(null);

  /**
   * The send button, shared by both variants.
   *
   * Declared here rather than duplicated into each branch: it carries the ref the
   * Ctrl+Enter shortcut clicks, and two copies would mean the shortcut works in
   * whichever one happened to render — a failure that looks like the keystroke
   * being unreliable rather than like a missing ref.
   */
  const SendButton = () => (
    <Button
      ref={replyButton}
      type="submit"
      formAction={replyAction}
      size="icon-sm"
      disabled={!canSend}
      title={internal ? "Notiz speichern (Strg+Enter)" : "Antworten (Strg+Enter)"}
      className={cn(
        "rounded-lg",
        internal
          ? "bg-bubble-internal-accent/15 text-bubble-internal-accent hover:bg-bubble-internal-accent/25"
          : "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover",
      )}
    >
      {replying ? (
        <Loader2Icon className="animate-spin" />
      ) : internal ? (
        <LockIcon strokeWidth={1.5} />
      ) : (
        <SendIcon strokeWidth={1.5} />
      )}
      <span className="sr-only">
        {internal ? "Notiz speichern" : "Antworten"}
      </span>
    </Button>
  );

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
        {isAgent && (cannedResponses.length > 0 || macros.length > 0) && (
          <DropdownMenu
            open={snippetsOpen}
            onOpenChange={(open) => {
              setSnippetsOpen(open);
              // Every opening starts empty. A filter that survived would mean
              // pressing "/" and finding a list that silently hides most of it.
              if (!open) setSnippetFilter("");
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                disabled={busy}
              >
                Bausteine
                {rich && <Kbd keys={["/"]} />}
                <ChevronDownIcon strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 rounded-2xl border border-border shadow-elev-2"
              /*
                Typing filters the list; everything else stays with the
                primitive. Radix composes this handler *before* its own and
                skips it once the event is defaulted-prevented, which is how a
                printable key can be taken over here without also disabling the
                arrow keys, Enter and Escape that make the menu a listbox.
                Space is deliberately left alone — it activates the focused item.
              */
              onKeyDown={(event) => {
                if (event.ctrlKey || event.metaKey || event.altKey) return;

                if (event.key === "Backspace") {
                  event.preventDefault();
                  setSnippetFilter((value) => value.slice(0, -1));
                  return;
                }

                // Only while focus is still on the menu itself. Once somebody
                // has arrowed onto an entry, Enter belongs to that entry.
                if (
                  event.key === "Enter" &&
                  snippetFilter !== "" &&
                  event.target === event.currentTarget
                ) {
                  event.preventDefault();
                  takeFirstMatch();
                  return;
                }

                if (event.key.length === 1 && event.key !== " ") {
                  event.preventDefault();
                  setSnippetFilter((value) => (value + event.key).slice(0, 40));
                }
              }}
            >
              {/*
                The typed text, shown back. Without it the list narrows for a
                reason nothing on screen explains — and a stray keystroke looks
                like half the snippets have been deleted.
              */}
              {snippetFilter !== "" && (
                <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">
                  /{snippetFilter}
                </DropdownMenuLabel>
              )}

              {noMatches && (
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Kein Baustein und kein Makro passt.
                </DropdownMenuLabel>
              )}

              {shownCanned.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Textbausteine — werden eingefügt, nicht gesendet
                  </DropdownMenuLabel>
                  {shownCanned.map((canned) => (
                    <DropdownMenuItem
                      key={canned.id}
                      className="rounded-xl"
                      onSelect={() => insertText(canned.body)}
                    >
                      <FileTextIcon strokeWidth={1.5} />
                      <span className="truncate">{canned.title}</span>
                      {canned.shortcut && (
                        <span className="ml-auto pl-2 font-mono text-xs text-muted-foreground">
                          /{canned.shortcut}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/*
                Macros in the same menu, and marked as the different thing they
                are: a baustein inserts text, a macro also changes fields and may
                send. Two menus for one gesture would mean guessing which one holds
                the entry you want.
              */}
              {shownMacros.length > 0 && (
                <>
                  {shownCanned.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Makros — ändern auch Felder
                  </DropdownMenuLabel>
                  {shownMacros.map((macro) => (
                    <DropdownMenuItem
                      key={macro.id}
                      className="rounded-xl"
                      onSelect={() =>
                        dispatchMacro({ ticketId, macroId: macro.id })
                      }
                    >
                      <ZapIcon strokeWidth={1.5} />
                      <span className="truncate">{macro.title}</span>
                      {macro.shortcut && (
                        <span className="ml-auto pl-2 font-mono text-xs text-muted-foreground">
                          /{macro.shortcut}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
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
        /*
         * One row: the field, and the three things you do to it.
         *
         * The actions sit *inside* the field's border rather than under it, which
         * is what makes the whole thing read as a single chat input instead of a
         * form. `items-end` so they stay on the last line as the text grows.
         */
        <div
          className={cn(
            "flex items-end gap-1 rounded-xl border bg-background transition-colors focus-within:ring-1",
            internal
              ? "border-warning/50 focus-within:ring-warning/40"
              : "border-border focus-within:ring-ring/40",
          )}
        >
          <div className="min-w-0 flex-1">
            <RichTextEditor
              value={body}
              onChange={setBody}
              disabled={busy}
              tone={internal ? "warning" : "default"}
              onReady={setEditor}
              /*
                Only when there is something to offer: a shortcut that opens an
                empty menu is a swallowed keystroke.

                Macros count. The condition used to name only the canned
                responses, so on an instance that had macros and no snippets the
                key did nothing at all — and the menu it would have opened was
                sitting right above the field.
              */
              onSlash={
                isAgent && (cannedResponses.length > 0 || macros.length > 0)
                  ? () => setSnippetsOpen(true)
                  : undefined
              }
              placeholder={placeholderFor(internal)}
              showToolbar={formatting}
              compact
              // The border and the ring belong to the row above, or there would be
              // two outlines a pixel apart around one field.
              bare
            />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={formatting}
              onClick={() => setFormatting((on) => !on)}
              disabled={busy}
              title="Formatierung (Strg+Umschalt+X)"
              className={cn(
                "rounded-lg text-muted-foreground",
                formatting && "bg-surface-elevated text-foreground",
              )}
            >
              <TypeIcon strokeWidth={1.5} />
              <span className="sr-only">Formatierung ein- oder ausblenden</span>
            </Button>

            {/* Not behind the formatting toggle: attaching a file is not a
                formatting decision, and burying it there is how people conclude
                the reply box cannot take attachments. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => editor?.pickFile()}
              disabled={busy || !editor}
              title="Datei anhängen"
              className="rounded-lg text-muted-foreground"
            >
              <PaperclipIcon strokeWidth={1.5} />
              <span className="sr-only">Datei anhängen</span>
            </Button>

            <SendButton />
          </div>
        </div>
      ) : (
        /*
         * The reporter's field, in the same shape.
         *
         * The plain variant gets the identical action row — minus the two
         * controls that only mean something for rich text. It briefly did not,
         * because the send button had been moved *inside* the rich branch, and a
         * reply box with no way to send is as broken as a page that will not load.
         */
        <div
          className={cn(
            "flex items-end gap-1 rounded-xl border bg-background transition-colors focus-within:ring-1",
            "border-border focus-within:ring-ring/40",
          )}
        >
          <Textarea
            ref={plainRef}
            id="composer-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={1}
            disabled={busy}
            placeholder={placeholderFor(internal)}
            /*
             * `resize-none` and `field-sizing-content`: the box grows with the
             * text and cannot be dragged taller than the frame, which would push
             * the send button out of a fixed-height column.
             */
            className="max-h-64 min-h-9 resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0 field-sizing-content"
          />

          <div className="flex shrink-0 items-center gap-0.5 p-1.5">
            <SendButton />
          </div>
        </div>
      )}

      {/*
        One thin line under the field, and only what cannot live inside it.

        The send button moved into the input row, so what is left is the note
        switch — which has to stay visible, because writing an internal note by
        accident is the mistake with the worst consequence in this component — and
        the shortcut hint. Everything is `text-xs` and `h-7`: this is a status
        line, not a second toolbar.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {isAgent ? (
          <div className="flex items-center gap-2">
            <Switch
              id="composer-internal"
              checked={internal}
              onCheckedChange={setInternal}
              disabled={busy}
              className="scale-90"
            />
            <Label
              htmlFor="composer-internal"
              className={cn(
                "text-xs font-normal",
                internal ? "text-bubble-internal-accent" : "text-muted-foreground",
              )}
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
          <Kbd keys={["Strg", "Enter"]} />
          senden
        </span>
      </div>

      {/*
        "Antworten & Schließen" on its own line, away from the send button.
        
        It sat beside it as an equally weighted filled pill, and the two are not
        equally weighted: one adds a message, the other adds a message **and ends
        the conversation**. Two adjacent buttons of the same size invite the wrong
        one at speed, and the wrong one here is the irreversible-feeling half —
        the reporter gets a closed ticket they may not consider closed.

        Below the field, quieter, and full width so it cannot be hit while aiming
        for the primary action.

        Public only: an "answer and close" that filed an internal note would close
        a ticket the reporter never heard about.
      */}
      {isAgent && !internal && (
        <Button
          type="submit"
          formAction={closeAction}
          variant="ghost"
          size="sm"
          className="h-8 w-full rounded-full text-xs text-muted-foreground"
          disabled={!canSend}
        >
          {closing ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CheckCheckIcon strokeWidth={1.5} />
          )}
          Antworten und Ticket schließen
        </Button>
      )}

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
