"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  LightbulbIcon,
  Loader2Icon,
  PaperclipIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DeflectionHit } from "@/lib/services/ai/deflection";
import { formatFileSize } from "@/types/mits";
import { cn } from "@/lib/utils";
import {
  INTAKE_CATEGORIES,
  UPLOAD_ACCEPT,
  type IntakeCategory,
  type MITSTicketDraft,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Reporting a problem, as a message rather than as a form.

   The old quick path was a stack of labelled controls with a submit button at the
   bottom. It collected the same three values this does, and it read like an
   application for something. Somebody whose printer is dead is not filling in a
   request; they are telling a person what happened.

   So: one card that looks like a composer, three pills instead of a dropdown, and
   a drop zone that is the whole card rather than a separate upload widget. The
   catalogue is still one tab away for anyone who knows they need a specific form —
   this route is deliberately the one that asks the fewest questions.

   **It produces the same draft as `SchemaForm`.** Same schema, same payload shape,
   same `POST /api/tickets`, same server-side validation. Nothing here is a second
   way into the ticket table; it is a second way to fill in one form.
   ────────────────────────────────────────────────────────────────────────── */

/** Mirrors `QUICK_TICKET_SCHEMA`. Checked again on the server, always. */
const MIN_TITLE = 5;
const MIN_DESCRIPTION = 20;
const MAX_FILES = 5;

const ENTRANCE = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

/*
 * Controlled, and every one of its four answers lives in `TriModalContainer`.
 *
 * Two reasons, and the second is the load-bearing one. Radix unmounts the inactive
 * tab panel, so with the text in local state any tab switch threw it away — and a
 * form suggestion beside the field is a *tab switch on purpose*, which would have
 * made this component eat its own input. Second, the suggestion column is a
 * sibling of this card and needs the same text to match against; the one thing two
 * siblings share can live in neither of them.
 *
 * Deliberately not in `useIntakeStore`: that store is a module-level singleton and
 * is shared across requests on the server, so a half-written sentence would leak
 * into somebody else's first render.
 */
export function ChatIntake({
  schemaId,
  onSubmit,
  /** Greeting name. Empty renders the neutral form of the heading. */
  greetingName = "",
  title,
  description,
  category,
  files,
  onTitleChange,
  onDescriptionChange,
  onCategoryChange,
  onFilesChange,
  /**
   * Self-service articles for the words typed so far, matched by the container.
   * Empty renders no hint area at all.
   */
  faqHits = [],
  onDismissHints,
}: {
  schemaId: string;
  onSubmit: (draft: MITSTicketDraft) => Promise<void>;
  greetingName?: string;
  title: string;
  description: string;
  category: IntakeCategory | null;
  files: File[];
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCategoryChange: (value: IntakeCategory | null) => void;
  onFilesChange: (files: File[]) => void;
  faqHits?: DeflectionHit[];
  onDismissHints: () => void;
}) {
  const reduceMotion = useReducedMotion();

  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filePicker = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setNotice(null);

    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setNotice(`Mehr als ${MAX_FILES} Dateien gehen nicht.`);
      return;
    }
    if (incoming.length > room) {
      setNotice(`Nur ${room} weitere Datei(en) möglich.`);
    }
    onFilesChange([...files, ...incoming.slice(0, room)]);
  };

  const titleOk = title.trim().length >= MIN_TITLE;
  const descriptionOk = description.trim().length >= MIN_DESCRIPTION;
  const canSend = titleOk && descriptionOk && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setNotice(null);

    try {
      /*
       * `attachments` carries real `File` objects, exactly as `SchemaForm` hands
       * them over. The container uploads them and swaps in the stored references
       * before the draft is posted — one upload path for every intake mode.
       *
       * `category` is omitted rather than sent as null when nothing is chosen: the
       * compiled schema is a `strictObject` over an optional enum, and null is not
       * one of its values.
       */
      await onSubmit({
        source: "legacy",
        form_schema_id: schemaId,
        payload: {
          title: title.trim(),
          description: description.trim(),
          ...(category ? { category } : {}),
          attachments: files,
        },
        priority: "medium",
        location_id: null,
        // Filled by the container, which owns the intent tiles above the tabs —
        // see the same note in `SchemaForm`.
        category_id: null,
      });
    } finally {
      // Left set on success too: the container swaps this whole component for the
      // receipt, so there is nothing to reset — and re-enabling the button during
      // that swap would offer a second submission of the same text.
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ENTRANCE}
      className="grid gap-4"
    >
      <div>
        <h2 className="text-xl font-normal tracking-tight sm:text-2xl">
          {greetingName ? `Hallo ${greetingName}, was ist los?` : "Was ist los?"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Einfach hinschreiben. Screenshots können direkt hineingezogen werden.
        </p>
      </div>

      {/* Pills, not a dropdown. Optional — see the note on INTAKE_CATEGORIES. */}
      <div className="flex flex-wrap gap-2">
        {INTAKE_CATEGORIES.map((entry) => {
          const selected = category === entry.value;
          return (
            <Button
              key={entry.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={selected}
              disabled={sending}
              // Tapping the selected pill clears it. A choice that cannot be taken
              // back is a trap on a field nobody was required to answer.
              onClick={() => onCategoryChange(selected ? null : entry.value)}
              className={cn(
                "h-9 rounded-full px-4 text-sm",
                selected
                  ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover hover:text-inverse-surface-foreground"
                  : "border border-border text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {selected && <CheckCircle2Icon strokeWidth={1.5} />}
              {entry.label}
            </Button>
          );
        })}
      </div>

      {/*
        The whole card is the drop zone, not a dashed rectangle beside the fields.

        `FileDropzone` owns the drag handling now. This file had its own copy — the
        primitive's docblock says it was extracted from here — and the copy had
        drifted in one way that mattered: it never checked whether the drag actually
        carried files, so selecting a word in the description and dragging it across
        the card put an upload frame in front of the text. The counter that stops the
        highlight flickering over child elements lives in the primitive too.
      */}
      <FileDropzone onFiles={addFiles} className="rounded-3xl">
        <Card
          /*
            Strg+V, auf derselben Karte wie das Ablegen.

            Ein Screenshot entsteht in der Zwischenablage — „Ausschneiden und
            skizzieren", Druck, ein Snipping-Werkzeug —, und der Weg von dort ins
            Ticket war vorher: erst speichern, dann suchen, dann wählen. Die Karte
            fängt das Ereignis, weil der Fokus dabei im Titel- oder im Textfeld
            steht und beide Kinder davon sind.

            **Nur wenn wirklich Dateien dabei sind.** `clipboardData.files` ist bei
            kopiertem Text leer; ohne die Prüfung würde jedes eingefügte Wort das
            Standardverhalten verlieren und im Feld nichts erscheinen.
          */
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData?.files ?? []);
            if (pasted.length === 0) return;
            event.preventDefault();
            addFiles(pasted);
          }}
          className="grid gap-3 rounded-3xl border border-border bg-card px-4 py-4 ring-0 shadow-elev-1 transition-colors focus-within:border-foreground/20"
        >
        <div className="grid gap-1.5">
          <Label htmlFor="intake-title" className="sr-only">
            Worum geht es?
          </Label>
          <Input
            id="intake-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            disabled={sending}
            maxLength={120}
            placeholder="Worum geht es? z. B. Drucker Etage 3 offline"
            // Borderless and large: inside the composer this is a subject line, not
            // a form field, and a boxed input here brings the form back.
            className="h-auto border-0 bg-transparent px-0 text-lg font-medium shadow-none focus-visible:ring-0 md:text-lg"
          />
        </div>

        <Textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          disabled={sending}
          rows={6}
          maxLength={4000}
          aria-label="Beschreibung"
          placeholder="Was ist passiert? Seit wann? Welche Fehlermeldung erscheint?"
          className="resize-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated py-1 pr-1 pl-3 text-xs"
              >
                <PaperclipIcon
                  className="size-3 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="max-w-48 truncate">{file.name}</span>
                <span className="text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={sending}
                  aria-label={`${file.name} entfernen`}
                  onClick={() =>
                    onFilesChange(
                      files.filter((_, position) => position !== index),
                    )
                  }
                  className="size-5 rounded-full p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <XIcon className="size-3" strokeWidth={1.5} />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending || files.length >= MAX_FILES}
              onClick={() => filePicker.current?.click()}
              className="h-9 rounded-full px-3 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <PaperclipIcon strokeWidth={1.5} />
              Anhang
            </Button>
            <input
              ref={filePicker}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="hidden"
              aria-label="Anhang wählen"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                // Cleared so picking the same file twice in a row still fires.
                event.target.value = "";
              }}
            />

            {/* The one constraint worth stating, and only once it is in the way. */}
            {description.trim() !== "" && !descriptionOk && (
              <span className="text-xs text-muted-foreground">
                Noch {MIN_DESCRIPTION - description.trim().length} Zeichen.
              </span>
            )}
          </div>

          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          >
            {sending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SendIcon strokeWidth={1.5} />
            )}
            {sending ? "Wird gesendet …" : "Absenden"}
          </Button>
        </div>
        </Card>
      </FileDropzone>

      {notice && <p className="text-xs text-destructive">{notice}</p>}

      {/*
        Under the composer, never over it. No dialog, no modal, no "sind Sie
        sicher" — a link and a way to make it go away. The brief was
        "vollkommen unaufdringlich", and the test of that is whether somebody who
        ignores it can finish what they were doing without touching it.
      */}
      <AnimatePresence initial={false}>
        {faqHits.length > 0 && !sending && (
          <motion.aside
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={ENTRANCE}
            aria-label="Vorschläge zur Selbsthilfe"
            className="grid gap-2 rounded-2xl border border-border bg-surface-elevated px-4 py-3"
          >
            <div className="flex items-start gap-2">
              <LightbulbIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="flex-1 text-xs text-muted-foreground">
                Hilft das schon weiter?
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Vorschläge ausblenden"
                // Stays gone for this visit. Somebody who closed it has answered
                // the question, and re-offering on the next keystroke is the
                // nagging the feature is supposed to avoid.
                onClick={onDismissHints}
                className="size-6 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <XIcon className="size-3" strokeWidth={1.5} />
              </Button>
            </div>

            <ul className="grid gap-1">
              {faqHits.map((hit) => (
                <li key={hit.id}>
                  {/* A new tab, deliberately: the half-written ticket stays where
                      it is. Reading the article and losing the text would be the
                      one way this feature could cost somebody something. */}
                  <a
                    href={`/customer/faq/${hit.id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {hit.question}
                    <ArrowRightIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </motion.aside>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
