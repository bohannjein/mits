"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  Link2Icon,
  Link2OffIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  PaperclipIcon,
  QuoteIcon,
  StrikethroughIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Rich-text editor for replies and internal notes.

   The value is HTML, and it is *not* trusted on the way out: `addComment`
   sanitises with a server-side allow-list before storing. This component is a
   convenience for the author, never a security boundary — a sanitiser that runs in
   the browser protects nobody, since the browser is what an attacker controls.

   Pasted and dropped images go through the ordinary upload endpoint and are inserted
   as `/api/uploads/<id>?inline=1`. Deliberately not as `data:` URLs: those would put
   megabytes of base64 into a database column, bypass the upload size limit entirely,
   and the sanitiser refuses that scheme anyway.
   ────────────────────────────────────────────────────────────────────────── */

export interface RichTextEditorHandle {
  /** Append markup — used by the canned-response dropdown. */
  insert: (html: string) => void;
  clear: () => void;
  /**
   * Open the file picker.
   *
   * Exposed because the paperclip that opens it now lives in the composer's
   * action row rather than in a toolbar that is folded away by default — and
   * attaching a file is not a formatting decision, so it must not be behind the
   * formatting toggle.
   *
   * Was `pickImage`, and the name was the bug: it opened a picker limited to
   * images while the button beside it said "Datei anhängen".
   */
  pickFile: () => void;
  /**
   * Put the caret in the editor.
   *
   * Needed because a contenteditable is not focusable through a ref to an input
   * element — the `r` shortcut has to go through tiptap's own command chain, or
   * the caret lands nowhere and the next keystroke goes to the page.
   */
  focus: () => void;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  /** Focus ring accent, so an internal note reads as one while being written. */
  tone = "default",
  onReady,
  onSlash,
  /**
   * The formatting toolbar. Off by default in the reply box, which starts as a
   * single line — a permanent bar of sixteen buttons over a one-line field is
   * more chrome than content.
   */
  showToolbar = true,
  /** One line to start, growing with the text. */
  compact = false,
  /**
   * Drop the own border and focus ring.
   *
   * For the chat bar, where the row around the editor already draws both — two
   * outlines a pixel apart read as a rendering fault.
   */
  bare = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  tone?: "default" | "warning";
  onReady?: (handle: RichTextEditorHandle) => void;
  /**
   * Fired when `/` is typed at the start of an empty block — the shortcut for the
   * canned-response picker. The parent opens its own menu; this component has no
   * opinion about what a slash command offers.
   */
  onSlash?: () => void;
  showToolbar?: boolean;
  compact?: boolean;
  bare?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  /*
   * `onSlash` reached through a ref, like `editorRef` below.
   *
   * `useEditor` builds `editorProps` once; a handler closing over the prop
   * directly would capture whatever it was on the first render and keep calling
   * that — so a parent that only knows its snippet list after a fetch would have
   * the shortcut wired to a stale, empty callback forever.
   */
  const slashRef = useRef<(() => void) | undefined>(undefined);
  slashRef.current = onSlash;
  /** Shared by upload failures and refused links — both are the same kind of
   *  transient complaint about what the author just tried. */
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Upload, then insert. Returns nothing — the editor is updated as a side effect,
   * because a paste handler cannot wait for a promise and still consume the event.
   *
   * **Not images only.** This filtered everything else out silently, which made the
   * paperclip a control that accepted a PDF and did nothing with it — the file was
   * gone, no message, and the reply went out without the document it was about. The
   * allow-list lives in `lib/storage.ts` and answers with a readable reason, so the
   * honest thing is to send whatever was picked and show what comes back.
   */
  const uploadAndInsert = async (editor: Editor, files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setNotice(null);

    const body = new FormData();
    for (const file of files) body.append("files", file);

    try {
      const response = await fetch("/api/tickets/upload", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as {
        uploads?: { id: string; name: string; type: string }[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);

      for (const upload of payload.uploads ?? []) {
        if (upload.type.startsWith("image/")) {
          editor
            .chain()
            .focus()
            .setImage({ src: `/api/uploads/${upload.id}?inline=1` })
            .run();
          continue;
        }

        /*
         * Everything else becomes a link carrying the file name.
         *
         * Its own paragraph plus an empty one after it, and that is not cosmetic:
         * inserting the anchor inline leaves the caret inside the link mark, so the
         * next word typed becomes part of the link. The empty block puts the caret
         * outside it.
         *
         * The name is escaped — it comes from a file on somebody's disk, and this
         * markup goes straight into the document. The sanitiser would clean it on
         * save, but by then the editor has already rendered it.
         */
        editor
          .chain()
          .focus()
          .insertContent(
            `<p><a href="/api/uploads/${upload.id}">${escapeHtml(upload.name)}</a></p><p></p>`,
          )
          .run();
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Datei konnte nicht hochgeladen werden.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const editor = useEditor({
    // Tiptap renders on the client only. Without this Next tries to render the
    // ProseMirror view during SSR and hydration mismatches on the first keystroke.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Headings beyond three levels are noise in a ticket reply.
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // Mirrors the server-side allow-list, so the editor cannot offer to create a
        // link the sanitiser will strip back out.
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          // `compact` starts at one line and grows; the old fixed 6rem floor is
          // dead space above the first character in a chat.
          compact
            ? "min-h-9 max-h-64 overflow-y-auto px-3 py-2 text-sm leading-relaxed outline-none"
            : "min-h-24 max-h-80 overflow-y-auto px-3 py-2.5 text-sm leading-relaxed outline-none",
          // Prose-ish spacing by hand: no typography plugin in this project, and the
          // set of tags is small enough to style directly.
          "[&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-medium [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-medium [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
          "[&_img]:my-2 [&_img]:max-h-64 [&_img]:rounded-xl [&_img]:border [&_img]:border-border",
        ),
      },
      /*
       * `/` at the start of an empty block opens the snippet picker.
       *
       * A key handler rather than a ProseMirror suggestion plugin: a suggestion
       * plugin would give inline filtering and would also mean a second popup
       * implementation with its own keyboard handling next to the Radix menu the
       * toolbar already uses. The condition is deliberately narrow — `$from.parent`
       * empty and the cursor at its start — so a slash inside a sentence, a URL or
       * a path stays a slash. Nothing is inserted when it fires, so a reply that
       * genuinely begins with a slash is one Escape away.
       */
      handleKeyDown: (view, event) => {
        if (event.key !== "/" || !slashRef.current) return false;
        if (event.ctrlKey || event.metaKey || event.altKey) return false;

        const { $from, empty } = view.state.selection;
        const atBlockStart = empty && $from.parentOffset === 0;
        if (!atBlockStart || $from.parent.content.size > 0) return false;

        event.preventDefault();
        slashRef.current();
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const instance = editorRef.current;
        if (files.length === 0 || !instance) return false;
        // Consumed: letting ProseMirror also handle it would insert the file name
        // as text beside the image that is about to arrive.
        event.preventDefault();
        void uploadAndInsert(instance, files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        const instance = editorRef.current;
        if (files.length === 0 || !instance) return false;
        event.preventDefault();
        void uploadAndInsert(instance, files);
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      // `isEmpty` rather than the serialised string: an empty document serialises to
      // "<p></p>", which is not empty by any string test and would make the submit
      // button look enabled with nothing to send.
      onChange(instance.isEmpty ? "" : instance.getHTML());
    },
  });

  // The paste and drop handlers are created before `editor` exists, so they reach it
  // through a ref rather than closing over a value that is still undefined.
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor ?? null;

  // Lets the parent insert a canned response without lifting the whole editor state.
  useEffect(() => {
    if (!editor || !onReady) return;
    onReady({
      insert: (html) => editor.chain().focus().insertContent(html).run(),
      pickFile: () => fileInput.current?.click(),
      focus: () => editor.chain().focus("end").run(),
      clear: () => editor.commands.clearContent(true),
    });
  }, [editor, onReady]);

  // The parent clears `value` after a successful send; the document has to follow.
  useEffect(() => {
    if (!editor) return;
    if (value === "" && !editor.isEmpty) editor.commands.clearContent(false);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    // Same box as the mounted editor, so the composer does not jump on hydration.
    // Same box as the mounted editor, so the composer does not jump on hydration.
    return (
      <div
        className={cn(
          compact ? "min-h-9" : "min-h-32",
          bare ? "" : "rounded-xl border border-border bg-background",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid overflow-hidden",
        bare
          ? "bg-transparent"
          : cn(
              "rounded-xl border bg-background focus-within:ring-1",
              tone === "warning"
                ? "border-warning/50 focus-within:ring-warning/40"
                : "border-border focus-within:ring-ring/40",
            ),
      )}
    >
      {/*
        Folded away unless asked for.

        Conditionally rendered rather than given the `hidden` attribute: this
        element also carries `flex`, and a class-based `display` beats the
        user-agent rule behind `[hidden]` — the bar would have stayed visible.
      */}
      {showToolbar && (
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <Tool
          icon={BoldIcon}
          label="Fett"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <Tool
          icon={ItalicIcon}
          label="Kursiv"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <Tool
          icon={StrikethroughIcon}
          label="Durchgestrichen"
          active={editor.isActive("strike")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />

        <Separator orientation="vertical" className="mx-1 h-5 bg-border" />

        {([1, 2, 3] as const).map((level) => (
          <Button
            key={level}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Überschrift ${level}`}
            aria-pressed={editor.isActive("heading", { level })}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level }).run()
            }
            className={cn(
              "rounded-lg font-mono text-[11px]",
              editor.isActive("heading", { level }) &&
                "bg-surface-elevated text-foreground",
            )}
          >
            H{level}
          </Button>
        ))}

        <Separator orientation="vertical" className="mx-1 h-5 bg-border" />

        <Tool
          icon={ListIcon}
          label="Liste"
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <Tool
          icon={ListOrderedIcon}
          label="Nummerierte Liste"
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <Tool
          icon={QuoteIcon}
          label="Zitat"
          active={editor.isActive("blockquote")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <Tool
          icon={CodeIcon}
          label="Code-Block"
          active={editor.isActive("codeBlock")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />

        <Separator orientation="vertical" className="mx-1 h-5 bg-border" />

        <Tool
          icon={editor.isActive("link") ? Link2OffIcon : Link2Icon}
          label={editor.isActive("link") ? "Link entfernen" : "Link setzen"}
          active={editor.isActive("link")}
          disabled={disabled}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const href = window.prompt("Ziel-URL");
            if (!href) return;
            // Refused here as well as in the sanitiser: a rejected link should say
            // so while the author is still looking at it, not vanish on save.
            if (!/^(https?:|mailto:|tel:)/i.test(href)) {
              setNotice("Nur http, https, mailto und tel sind erlaubt.");
              return;
            }
            editor.chain().focus().setLink({ href }).run();
          }}
        />
        <Tool
          icon={uploading ? Loader2Icon : PaperclipIcon}
          label="Datei anhängen"
          spinning={uploading}
          disabled={disabled || uploading}
          onClick={() => fileInput.current?.click()}
        />

      </div>
      )}

      {/*
        Outside the toolbar on purpose. Folding the formatting away must not take
        the file picker with it — the composer's paperclip opens this through
        `pickFile`, and attaching a file is not a formatting decision.

        `accept` mirrors the server allow-list in `lib/storage.ts` rather than
        narrowing it: a picker that hides the file type the server would have taken
        is a refusal with no message. It stays a hint either way — the server checks
        the extension again, and a drag-and-drop never consults this attribute.
      */}
      <input
        ref={fileInput}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.pdf,.txt,.log,.csv,.zip,.eml,.msg,.docx,.xlsx"
        multiple
        className="hidden"
        onChange={(event) =>
          void uploadAndInsert(editor, Array.from(event.target.files ?? []))
        }
        aria-label="Datei anhängen"
      />

      <EditorContent editor={editor} />

      {editor.isEmpty && placeholder && (
        <p className="pointer-events-none -mt-9 px-3 text-sm text-muted-foreground">
          {placeholder}
        </p>
      )}

      {notice && (
        <p className="border-t border-border px-3 py-1.5 text-xs font-medium text-destructive">
          {notice}
        </p>
      )}
    </div>
  );
}

/**
 * Escape a file name for the markup an attachment link is inserted as.
 *
 * A name comes off somebody's disk and can hold `<`, `>` or `&`. The server-side
 * sanitiser cleans the body on save, but this string reaches the editor's document
 * first — and what the author sees before pressing send has to be the file they
 * picked, not the fragment a stray angle bracket left behind.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function Tool({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  spinning = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  spinning?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg",
        active && "bg-surface-elevated text-foreground",
      )}
    >
      <Icon strokeWidth={1.5} className={cn(spinning && "animate-spin")} />
    </Button>
  );
}
