"use client";

import {
  AtSignIcon,
  CheckCircle2Icon,
  CheckCheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  Loader2Icon,
  LockIcon,
  Maximize2Icon,
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
import { ReplyPopout } from "@/components/tickets/reply-popout";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useLatestResult } from "@/hooks/use-latest-result";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   The reply box.

   **One composer for both views**, where there used to be two. `TicketChat` and
   `TicketThread` each had their own copy of the send action, the clear-on-success
   effect and the snippet insertion — three things that have to behave identically
   and had two implementations, which is how one of them ends up with a fix the
   other never gets.

   What differs between an agent and a reporter is **which controls exist**, not
   the field: `variant` withholds the formatting bar and the full-size window and
   nothing else. It used to swap in a `<textarea>` for the reporter, which is why
   a customer could not drop or paste a file — see the note on the prop.

   Two submit buttons on one form, each bound to its own action. "Antworten &
   Schließen" is a single server action rather than two client calls: replying and
   closing is one decision, and two round-trips can leave a ticket answered but
   open when the second one fails.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketComposer({
  ticketId,
  isAgent,
  /**
   * Which controls exist around the field — **not** which field.
   *
   * Both variants are the same tiptap editor and both post HTML. `plain` used to
   * be a `<textarea>`, and that was the whole reason a reporter could not attach
   * anything: a textarea has no drop target, no paste handler and no way to carry
   * an inline image, so a screenshot pasted into it was silently nothing. The
   * upload path, the allow-list refusals and `uploadIdsInHtml` — which is what
   * binds a file to the ticket so its own author can open it again — all live on
   * the editor side.
   *
   * What `plain` still means: no formatting bar and no toggle for one, and no
   * full-size window. The reporter's page is minimal because it has fewer
   * controls, not because it has a weaker field.
   */
  variant = "rich",
  /** Placeholder-filled server-side. Empty when the module is off. */
  cannedResponses = [],
  /** One-click actions. Empty when the module is off. */
  macros = [],
  /**
   * Wer sich mit `@` in den Vorgang ziehen lässt.
   *
   * Nur Agenten, und der Server prüft es erneut: der Text trägt bloß den
   * Anzeigenamen, die Ids reisen in einem eigenen Feld. Leer, wenn das Modul aus
   * ist — dann gibt es den Knopf gar nicht.
   */
  colleagues = [],
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
  colleagues?: { id: string; name: string }[];
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
   * Wer in diesem Entwurf genannt wurde.
   *
   * Der Text bekommt den Anzeigenamen, dieser Zustand die Id — und nur die Id
   * geht mit. Den Namen serverseitig zurückzulesen wäre die zweite Wahrheit und
   * bei zwei Kolleginnen mit demselben Vornamen falsch.
   *
   * Eine Liste und keine Menge: die Reihenfolge ist die des Einfügens, und
   * `recordMentions` entdoppelt ohnehin.
   */
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);

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
   * Hand the page two callbacks rather than a DOM node.
   *
   * Focusing goes through tiptap's command chain, and the internal switch is React
   * state with no element to click. A ref to a node would make the page know both.
   */
  /**
   * Put the caret back in the field.
   *
   * One function, three callers: the `r` shortcut, the composer handle the page
   * hands out, and the send path below. It goes through tiptap's command chain
   * rather than a ref to a DOM node, because a contenteditable is not focusable
   * through an input ref — the caret would land nowhere and the next keystroke
   * would go to the page.
   */
  const focusComposer = useCallback(() => {
    editor?.focus();
  }, [editor]);

  const handle = useComposerHandle();

  useEffect(() => {
    if (!handle) return;

    handle.focus.current = focusComposer;
    // Only an agent has the switch; for a reporter the shortcut does nothing
    // rather than toggling a control that is not on their screen.
    handle.toggleInternal.current = isAgent
      ? () => setInternal((on) => !on)
      : null;
  }, [handle, focusComposer, isAgent]);

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
  /*
   * Whichever of the two submit paths ran last. This was `replyResult ??
   * closeResult`, which pinned the first result forever — see `useLatestResult`
   * for what that cost here specifically.
   */
  const result = useLatestResult(replyResult, closeResult);
  const busy = replying || closing || runningMacro;

  /*
   * Clear on confirmation, and put the caret straight back in the field.
   *
   * Keyed on the result object's identity so it fires once per submission. A
   * `result?.ok ? "" : body` shortcut would swallow an inserted snippet after the
   * first successful reply.
   *
   * The focus is the second half of the same thought: a conversation is a
   * sequence of messages, and a chat box that drops the caret after every send
   * makes the second message cost a click that the first one did not. Only on
   * success — a refused reply leaves the text where it is, and moving the caret
   * there would fight whoever is already fixing it.
   */
  useEffect(() => {
    if (!result?.ok) return;
    setBody("");
    // Zusammen mit dem Text, nicht danach: eine stehen gebliebene Erwähnung
    // hinge am nächsten Entwurf und benachrichtigte jemanden für eine Nachricht,
    // in der sein Name gar nicht vorkommt.
    setMentioned([]);
    focusComposer();
  }, [result, focusComposer]);

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
   * The body travels as HTML and a canned response is stored as plain text:
   * concatenating the two would hand the sanitiser text whose newlines collapse
   * into one paragraph, so the template arrives as a wall. `toParagraphs` escapes
   * and wraps it, and the editor knows where the cursor is.
   */
  const insertText = useCallback(
    (text: string) => {
      const html = toParagraphs(text);
      if (editor) {
        editor.insert(html);
        return;
      }
      // Before the editor has mounted there is nothing to insert into; appending
      // to the value keeps the snippet rather than dropping it silently.
      setBody((current) => (current ? `${current}${html}` : html));
    },
    [editor],
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
   * "Antworten & Schließen", now beside the send button behind a confirmation.
   *
   * It used to be a full-width ghost button on its own line, deliberately far
   * from the primary action, because two adjacent equally weighted pills invite
   * the wrong one at speed — and the wrong one here ends the conversation.
   *
   * The confirmation is what makes the proximity affordable: the button is back
   * where the hand already is, and the irreversible half now costs a second
   * click that names what it does. Removing the distance without adding the
   * question would be the version that closes tickets by accident.
   *
   * The submit cannot be a `formAction` any more. The confirming button lives
   * inside a Radix popover, which is portalled out of the `<form>` — so the
   * FormData is built by hand, exactly like the macro dispatch above. The three
   * fields are the ones the form's own hidden inputs carry.
   */
  const [confirmClose, setConfirmClose] = useState(false);

  /*
   * The full-size editor, and the resync it needs.
   *
   * Both editors write the same `body` string, but the inline tiptap instance
   * only reacts to `value` becoming empty — it does not track arbitrary changes,
   * deliberately, because a document that re-parses on every keystroke loses the
   * caret. So when the dialog closes, the inline one is reset from the state the
   * dialog left behind. Without this the draft written upstairs is invisible
   * downstairs and reappears only after sending.
   */
  const [popout, setPopout] = useState(false);

  const closePopout = (open: boolean) => {
    setPopout(open);
    if (!open && rich && editor) {
      editor.clear();
      if (body) editor.insert(body);
    }
  };

  const submitReply = () => {
    const data = new FormData();
    data.set("ticketId", ticketId);
    data.set("body", body);
    data.set("bodyFormat", "html");
    data.set("visibility", internal ? "internal" : "public");
    startTransition(() => replyAction(data));
    setPopout(false);
  };

  const submitClose = () => {
    const data = new FormData();
    data.set("ticketId", ticketId);
    data.set("body", body);
    data.set("bodyFormat", "html");
    // Not read by the action — it closes publicly by definition — but sent so
    // the payload matches the form's, and a future reader is not left wondering
    // which of the two paths omits it.
    data.set("visibility", "public");
    startTransition(() => closeAction(data));
    setConfirmClose(false);
  };

  /**
   * The second submit, shared by both variants like `SendButton`.
   *
   * Public replies only: an "answer and close" that filed an internal note would
   * close a ticket the reporter never heard about.
   */
  const CloseButton = () =>
    isAgent && !internal ? (
      <Popover open={confirmClose} onOpenChange={setConfirmClose}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canSend}
            title="Antworten & Schließen"
            className="rounded-lg text-muted-foreground"
          >
            {closing ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CheckCheckIcon strokeWidth={1.5} />
            )}
            <span className="sr-only">Antworten und Ticket schließen</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <p className="text-sm">Antwort senden und Ticket schließen?</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setConfirmClose(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submitClose}
              className="h-8 rounded-full bg-inverse-surface px-3 text-xs text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            >
              <CheckCircle2Icon strokeWidth={1.5} />
              Schließen
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    ) : null;

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
    /*
      The whole reply box is the drop target, not just the editor.

      tiptap has its own `handleDrop`, and it works — but only over the
      contenteditable itself, which on a one-line composer is a strip about
      thirty pixels tall. Somebody dragging a screenshot aims at the box, and
      hitting the padding meant the browser navigated to the file and replaced
      the page. The wrapper catches the whole area and hands the files to the
      same upload path.

      Both variants. The reporter's field used to be a textarea, which is why
      dropping a screenshot on the customer page did nothing at all — see the note
      on `variant`.
    */
    <FileDropzone
      disabled={busy || !editor}
      onFiles={(files) => editor?.addFiles(files)}
      className="rounded-2xl"
    >
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
      {/*
        Die Ids der Genannten. Nur sie — der Server schlägt Namen und Zugriff
        selbst nach, und ein Name aus dem Browser wäre eine Behauptung darüber,
        wer gemeint war.
      */}
      <input
        type="hidden"
        name="mentions"
        value={JSON.stringify(mentioned.map((person) => person.id))}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* No `htmlFor`: the id it pointed at was the reporter's textarea, and a
            contenteditable is not the kind of element a label can be bound to.
            This is the caption of the box, and the box says what it is. */}
        <Label className="text-xs text-muted-foreground">
          {internal ? "Interne Notiz" : "Öffentliche Antwort"}
        </Label>

        <div className="flex flex-wrap items-center gap-1">
        {/*
          Jemanden dazuholen.

          Neben den Bausteinen und nicht in ihnen: ein Baustein fügt Text ein,
          eine Erwähnung benachrichtigt einen Menschen. Dasselbe Menü hätte zwei
          Wirkungsarten in einer Liste.

          Kein `@`-Kürzel im Feld wie das `/` daneben: dafür bräuchte tiptap eine
          Suggestion-Erweiterung — eine neue Abhängigkeit für eine Geste, die der
          Knopf ohne sie erledigt.
        */}
        {isAgent && colleagues.length > 0 && (
          <DropdownMenu open={mentionOpen} onOpenChange={setMentionOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                disabled={busy}
              >
                <AtSignIcon strokeWidth={1.5} />
                Erwähnen
                {mentioned.length > 0 && (
                  <span className="tabular-nums text-muted-foreground">
                    {mentioned.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 rounded-2xl border border-border shadow-elev-2"
            >
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Wird benachrichtigt und folgt danach
              </DropdownMenuLabel>
              {colleagues.map((person) => {
                const already = mentioned.some((entry) => entry.id === person.id);
                return (
                  <DropdownMenuItem
                    key={person.id}
                    className="rounded-xl"
                    disabled={already}
                    onSelect={() => {
                      // Der Name in den Text, die Id in den Zustand. Das
                      // schließende Leerzeichen ist der Unterschied zwischen
                      // „@Bea Schulzdanke" und einem lesbaren Satz.
                      insertText(`@${person.name} `);
                      setMentioned((current) => [...current, person]);
                    }}
                  >
                    <AtSignIcon strokeWidth={1.5} />
                    <span className="truncate">{person.name}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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
      <input type="hidden" name="bodyFormat" value="html" />

      {/*
        One row: the field, and the things you do to it.

        The actions sit *inside* the field's border rather than under it, which is
        what makes the whole thing read as a single chat input instead of a form.
        `items-end` so they stay on the last line as the text grows.

        **One row for both variants.** The reporter's used to be a separate branch
        with a `<textarea>` in it, and that branch was the reason a customer could
        neither drop nor paste a file. What the variant still decides is which of
        the buttons on the right exist.
      */}
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
            placeholder={COMPOSER_PLACEHOLDER}
            // Never for a reporter: the bar is the one thing `plain` withholds,
            // and a toggle they cannot reach must not be able to open it either.
            showToolbar={rich && formatting}
            compact
            // The border and the ring belong to the row above, or there would be
            // two outlines a pixel apart around one field.
            bare
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 p-1.5">
          {/* The escape hatch for a long answer — see `ReplyPopout`. */}
          {rich && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setPopout(true)}
              disabled={busy}
              title="Großes Fenster"
              className="rounded-lg text-muted-foreground"
            >
              <Maximize2Icon strokeWidth={1.5} />
              <span className="sr-only">Im großen Fenster schreiben</span>
            </Button>
          )}

          {rich && (
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
          )}

          {/*
            The paperclip is **not** rich-only.

            Attaching a file is not a formatting decision, so it is not behind the
            formatting toggle — and it is not behind the variant either. A reporter
            answering „schick mir mal einen Screenshot" needs exactly this button,
            and its absence was the whole defect.
          */}
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

          <CloseButton />
          <SendButton />
        </div>
      </div>

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

    {/* Rich only. Nothing in the reporter's row can open it, and mounting a
        dialog that has no trigger is a second editor over the same string for
        nobody. */}
    {rich && (
    <ReplyPopout
      open={popout}
      onOpenChange={closePopout}
      value={body}
      onChange={setBody}
      onSend={submitReply}
      onSendAndClose={isAgent && !internal ? submitClose : null}
      sending={replying}
      closing={closing}
      canSend={canSend}
      internal={internal}
    />
    )}
    </FileDropzone>
  );
}

/**
 * Derselbe Platzhalter für jede Rolle und beide Sichtbarkeiten.
 *
 * Vorher standen dort zwei Sätze, die erklärten, was das Absenden bewirkt („Geht
 * an den Melder und löst eine Benachrichtigung aus", „Nur für Agenten sichtbar").
 * Beides steht schon daneben: das Label über dem Feld nennt „Öffentliche
 * Antwort" oder „Interne Notiz", und die Notiz färbt das ganze Feld amber und
 * gestrichelt. Ein Platzhalter ist die Aufforderung zu tippen, nicht die dritte
 * Kopie derselben Auskunft — und in einem Chatfeld heißt diese Aufforderung
 * überall gleich.
 */
const COMPOSER_PLACEHOLDER = "Nachricht eingeben";

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
